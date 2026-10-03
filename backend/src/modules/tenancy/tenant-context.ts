import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { AuthenticatedAccount } from '../auth/auth.repository.js';

export const ZESTIVA_TENANT_ID = '00000000-0000-4000-8000-000000000001';

type Queryable = Pick<PoolClient, 'query'>;
type TenantMembershipRole = TenantContext['currentMembershipRole'];

export const ensureCanonicalZestivaMembership = async (
  userId: string,
  tenantRole: TenantMembershipRole,
  db: Queryable = pool,
) => {
  await db.query(
    `insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status)
     values($1,$2,$3,$4,'active')
     on conflict(tenant_id,user_id) do update set
       tenant_role=excluded.tenant_role,
       status='active',
       removed_at=null,
       updated_at=now()`,
    [crypto.randomUUID(), ZESTIVA_TENANT_ID, userId, tenantRole],
  );
};

export type TenantMigrationMode = 'EXPAND' | 'BACKFILL' | 'DUAL_READ' | 'CANONICAL';
export type TenantResolutionPath = 'MEMBERSHIP' | 'DENIED';

export type TenantContext = {
  tenantId: string;
  tenantName: string;
  tenantType: 'ZESTIVA_INTERNAL' | 'INDEPENDENT_CONSULTANT' | 'PRACTICE' | 'CLINIC' | 'ENTERPRISE';
  currentMembershipRole: 'OWNER' | 'CONSULTANT' | 'SENIOR_CONSULTANT' | 'COORDINATOR' | 'BILLING_ADMIN' | 'STAFF' | 'CLIENT';
  resolutionPath: Exclude<TenantResolutionPath, 'DENIED'>;
};

export const getTenantMigrationMode = (): TenantMigrationMode => {
  const configured = String(process.env.TENANT_MIGRATION_MODE ?? 'CANONICAL').toUpperCase();
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
  void input.hasAnyMembership;
  void input.legacyZestivaEligible;
  void input.migrationMode;
  return 'DENIED';
};

export const recordTenantResolutionPath = async (
  context: Pick<TenantContext, 'tenantId'> | null,
  path: TenantResolutionPath | 'TENANT',
  routeFamily: string,
) => {
  const canonicalPath = path === 'TENANT' ? 'MEMBERSHIP' : path;
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
  const resolutionPath=resolveTenantResolutionDecision({
    activeMembership,
    hasAnyMembership:false,
    legacyZestivaEligible:false,
    migrationMode:getTenantMigrationMode(),
  });
  if(activeMembership){
    await recordTenantResolutionPath(activeMembership,resolutionPath,routeFamily);
    return activeMembership;
  }
  await recordTenantResolutionPath(null,'DENIED',routeFamily);
  return null;
};

export const resolveActiveTenantContext = async (account: AuthenticatedAccount): Promise<TenantContext | null> =>
  resolveActiveTenantContextForUserId(account.user.id);

export const assertTenantResourceScope = (context:TenantContext,resourceTenantId:string|null,legacyAccessAlreadyGranted:boolean) => {
  if(resourceTenantId!=null&&resourceTenantId!==context.tenantId)return false;
  if(resourceTenantId==null)return false;
  void legacyAccessAlreadyGranted;
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
    await recordTenantResolutionPath(context,'TENANT',input.routeFamily);
  }
  return allowed;
};

export const activeTenantMembershipSql = (userIdPlaceholder: string, tenantColumn: string) => `exists (
    select 1 from tenant_memberships tenant_scope_membership
     where tenant_scope_membership.user_id=${userIdPlaceholder}
       and tenant_scope_membership.tenant_id=${tenantColumn}
       and tenant_scope_membership.status='active'
  )`;
