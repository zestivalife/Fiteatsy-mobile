import { pool } from '../../db/pool.js';
import type { AuthenticatedAccount } from '../auth/auth.repository.js';

export const ZESTIVA_TENANT_ID = '00000000-0000-4000-8000-000000000001';

export type TenantMigrationMode = 'EXPAND' | 'BACKFILL' | 'DUAL_READ' | 'CANONICAL';
export type TenantResolutionPath = 'MEMBERSHIP' | 'LEGACY_ZESTIVA_FALLBACK' | 'DENIED';

export type TenantContext = {
  tenantId: string;
  tenantName: string;
  tenantType: 'ZESTIVA_INTERNAL' | 'INDEPENDENT_CONSULTANT' | 'PRACTICE' | 'CLINIC' | 'ENTERPRISE';
  currentMembershipRole: 'OWNER' | 'CONSULTANT' | 'SENIOR_CONSULTANT' | 'COORDINATOR' | 'BILLING_ADMIN' | 'STAFF' | 'CLIENT';
  resolutionPath: Exclude<TenantResolutionPath, 'DENIED'>;
};

const legacyTenantRole = (role: string | null): TenantContext['currentMembershipRole'] => {
  switch ((role ?? '').toLowerCase()) {
    case 'platform_owner':
    case 'super_admin': return 'OWNER';
    case 'admin': return 'STAFF';
    case 'senior_consultant': return 'SENIOR_CONSULTANT';
    case 'consultant':
    case 'provider':
    case 'dietician': return 'CONSULTANT';
    case 'coordinator': return 'COORDINATOR';
    default: return 'CLIENT';
  }
};

export const getTenantMigrationMode = (): TenantMigrationMode => {
  const configured = String(process.env.TENANT_MIGRATION_MODE ?? 'EXPAND').toUpperCase();
  return configured === 'BACKFILL' || configured === 'DUAL_READ' || configured === 'CANONICAL'
    ? configured
    : 'EXPAND';
};

export const resolveTenantResolutionDecision = (input: {
  activeMembership: TenantContext | null;
  hasAnyMembership: boolean;
  legacyZestivaEligible: boolean;
  migrationMode: TenantMigrationMode;
}): TenantResolutionPath => {
  if (input.activeMembership) return 'MEMBERSHIP';
  if (input.hasAnyMembership) return 'DENIED';
  if (input.migrationMode === 'CANONICAL') return 'DENIED';
  return input.legacyZestivaEligible ? 'LEGACY_ZESTIVA_FALLBACK' : 'DENIED';
};

export const recordTenantResolutionPath = async (
  context: Pick<TenantContext, 'tenantId'> | null,
  path: TenantResolutionPath | 'TENANT' | 'LEGACY_FALLBACK',
  routeFamily: string,
) => {
  const canonicalPath = path === 'TENANT' ? 'MEMBERSHIP' : path === 'LEGACY_FALLBACK' ? 'LEGACY_ZESTIVA_FALLBACK' : path;
  await pool.query(
    `insert into tenant_resolution_events(tenant_id,path,route_family) values($1,$2,$3)`,
    [context?.tenantId ?? null, canonicalPath, routeFamily],
  );
};

export const resolveActiveTenantContextForUserId = async (
  userId: string,
  routeFamily = 'tenant_context',
): Promise<TenantContext | null> => {
  const result=await pool.query<{
    tenant_id:string; name:string; tenant_type:TenantContext['tenantType']; tenant_role:TenantContext['currentMembershipRole'];
  }>(`select membership.tenant_id,tenant.name,tenant.tenant_type,membership.tenant_role
        from tenant_memberships membership
        join tenants tenant on tenant.id=membership.tenant_id
       where membership.user_id=$1 and membership.status='active' and tenant.status='active'
       order by (tenant.tenant_type='ZESTIVA_INTERNAL') desc,membership.joined_at asc
       limit 1`,[userId]);
  const row=result.rows[0];
  const activeMembership = row ? {
    tenantId:row.tenant_id,
    tenantName:row.name,
    tenantType:row.tenant_type,
    currentMembershipRole:row.tenant_role,
    resolutionPath:'MEMBERSHIP' as const,
  } : null;
  const eligibility = await pool.query<{
    role:string|null; legacy_eligible:boolean; has_any_membership:boolean;
  }>(`select u.role,
            (u.deleted_at is null and lower(coalesce(u.status,''))='active'
              and u.account_purpose in ('PRODUCTION_USER','QA_TEST')) as legacy_eligible,
            exists(select 1 from tenant_memberships membership where membership.user_id=u.id) as has_any_membership
       from users u where u.id=$1 limit 1`,[userId]);
  const candidate=eligibility.rows[0];
  const resolutionPath=resolveTenantResolutionDecision({
    activeMembership,
    hasAnyMembership:Boolean(candidate?.has_any_membership),
    legacyZestivaEligible:Boolean(candidate?.legacy_eligible),
    migrationMode:getTenantMigrationMode(),
  });
  if(activeMembership){
    await recordTenantResolutionPath(activeMembership,resolutionPath,routeFamily);
    return activeMembership;
  }
  if(resolutionPath==='LEGACY_ZESTIVA_FALLBACK'){
    const tenant=await pool.query<{name:string;tenant_type:TenantContext['tenantType']}>(
      `select name,tenant_type from tenants where id=$1 and status='active' limit 1`,[ZESTIVA_TENANT_ID],
    );
    const zestiva=tenant.rows[0];
    if(zestiva){
      const fallback:TenantContext={
        tenantId:ZESTIVA_TENANT_ID,
        tenantName:zestiva.name,
        tenantType:zestiva.tenant_type,
        currentMembershipRole:legacyTenantRole(candidate?.role??null),
        resolutionPath,
      };
      await recordTenantResolutionPath(fallback,resolutionPath,routeFamily);
      return fallback;
    }
  }
  await recordTenantResolutionPath(null,'DENIED',routeFamily);
  return null;
};

export const resolveActiveTenantContext = async (account: AuthenticatedAccount): Promise<TenantContext | null> =>
  resolveActiveTenantContextForUserId(account.user.id);

export const assertTenantResourceScope = (context:TenantContext,resourceTenantId:string|null,legacyAccessAlreadyGranted:boolean) => {
  if(resourceTenantId!=null&&resourceTenantId!==context.tenantId)return false;
  if(resourceTenantId==null)return legacyAccessAlreadyGranted;
  return true;
};

export const resolveTenantResourceScope = async (input: {
  userId: string;
  resourceTenantId: string | null;
  legacyAccessAlreadyGranted: boolean;
  routeFamily: string;
}) => {
  const context=await resolveActiveTenantContextForUserId(input.userId,input.routeFamily);
  if(!context)return false;
  const allowed=assertTenantResourceScope(context,input.resourceTenantId,input.legacyAccessAlreadyGranted);
  if(allowed){
    await recordTenantResolutionPath(context,input.resourceTenantId==null?'LEGACY_FALLBACK':'TENANT',input.routeFamily);
  }
  return allowed;
};

export const activeTenantMembershipSql = (userIdPlaceholder: string, tenantColumn: string) => `(
  ${tenantColumn} is null
  or exists (
    select 1 from tenant_memberships tenant_scope_membership
     where tenant_scope_membership.user_id=${userIdPlaceholder}
       and tenant_scope_membership.tenant_id=${tenantColumn}
       and tenant_scope_membership.status='active'
  )
)`;
