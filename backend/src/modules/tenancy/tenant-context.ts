import { pool } from '../../db/pool.js';
import type { AuthenticatedAccount } from '../auth/auth.repository.js';

export const ZESTIVA_TENANT_ID = '00000000-0000-4000-8000-000000000001';

export type TenantContext = {
  tenantId: string;
  tenantName: string;
  tenantType: 'ZESTIVA_INTERNAL' | 'INDEPENDENT_CONSULTANT' | 'PRACTICE' | 'CLINIC' | 'ENTERPRISE';
  currentMembershipRole: 'OWNER' | 'CONSULTANT' | 'SENIOR_CONSULTANT' | 'COORDINATOR' | 'BILLING_ADMIN' | 'STAFF' | 'CLIENT';
};

export const resolveActiveTenantContext = async (account: AuthenticatedAccount): Promise<TenantContext | null> => {
  const result=await pool.query<{
    tenant_id:string; name:string; tenant_type:TenantContext['tenantType']; tenant_role:TenantContext['currentMembershipRole'];
  }>(`select membership.tenant_id,tenant.name,tenant.tenant_type,membership.tenant_role
        from tenant_memberships membership
        join tenants tenant on tenant.id=membership.tenant_id
       where membership.user_id=$1 and membership.status='active' and tenant.status='active'
       order by (tenant.tenant_type='ZESTIVA_INTERNAL') desc,membership.joined_at asc
       limit 1`,[account.user.id]);
  const row=result.rows[0];
  return row?{tenantId:row.tenant_id,tenantName:row.name,tenantType:row.tenant_type,currentMembershipRole:row.tenant_role}:null;
};

export const assertTenantResourceScope = (context:TenantContext,resourceTenantId:string|null,legacyAccessAlreadyGranted:boolean) => {
  if(resourceTenantId!=null&&resourceTenantId!==context.tenantId)return false;
  if(resourceTenantId==null)return legacyAccessAlreadyGranted;
  return true;
};

export const recordTenantResolutionPath = async (context:TenantContext,path:'TENANT'|'LEGACY_FALLBACK',routeFamily:string) => {
  await pool.query(`insert into tenant_resolution_events(tenant_id,path,route_family) values($1,$2,$3)`,[context.tenantId,path,routeFamily]);
};
