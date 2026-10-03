import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { ClientOwnershipContext } from '../platform/platform.types.js';
import { getTenantMigrationMode, ZESTIVA_TENANT_ID } from './tenant-context.js';

type Queryable = Pick<PoolClient, 'query'>;

export const resolveTrustedTenantForUserWrite = async (
  userId: string,
  routeFamily: string,
  db: Queryable = pool,
): Promise<string> => {
  const result = await db.query<{ tenant_id: string | null; has_any_membership: boolean; legacy_eligible: boolean }>(
    `select (
       select membership.tenant_id from tenant_memberships membership
       join tenants tenant on tenant.id=membership.tenant_id
       where membership.user_id=u.id and membership.status='active' and tenant.status='active'
       order by (tenant.tenant_type='ZESTIVA_INTERNAL') desc,membership.joined_at asc limit 1
     ) as tenant_id,
     exists(select 1 from tenant_memberships membership where membership.user_id=u.id) as has_any_membership,
     (u.deleted_at is null and lower(coalesce(u.status,''))='active'
       and u.account_purpose in ('PRODUCTION_USER','QA_TEST')) as legacy_eligible
     from users u where u.id=$1 limit 1`,
    [userId],
  );
  const candidate = result.rows[0];
  if (candidate?.tenant_id) return candidate.tenant_id;
  if (!candidate?.has_any_membership && candidate?.legacy_eligible && getTenantMigrationMode() !== 'CANONICAL') {
    const legacy = await db.query('select 1 from tenants where id=$1 and status=\'active\'', [ZESTIVA_TENANT_ID]);
    if (legacy.rowCount) return ZESTIVA_TENANT_ID;
  }
  void routeFamily;
  throw new Error('TENANT_CONTEXT_REQUIRED');
};

export const resolveTrustedTenantForClientWrite = async (
  owner: ClientOwnershipContext,
  routeFamily: string,
  db: Queryable = pool,
): Promise<string> => {
  const parent = await db.query<{ tenant_id: string | null; account_user_id: string }>(
    `select tenant_id, account_user_id
       from fiteatsy_clients
      where id = $1 and deleted_at is null
      limit 1`,
    [owner.clientId],
  );
  const client = parent.rows[0];
  if (!client || client.account_user_id !== owner.accountId) throw new Error('TENANT_RESOURCE_MISMATCH');

  const tenantId = await resolveTrustedTenantForUserWrite(owner.accountId, routeFamily, db);
  if (client.tenant_id != null && client.tenant_id !== tenantId) throw new Error('TENANT_RESOURCE_MISMATCH');
  return client.tenant_id ?? tenantId;
};

export const resolveTrustedTenantForActorAndClientWrite = async (
  actorUserId: string,
  clientId: string,
  routeFamily: string,
  db: Queryable = pool,
): Promise<string> => {
  const parent = await db.query<{ tenant_id: string | null }>(
    `select tenant_id from fiteatsy_clients where id = $1 and deleted_at is null limit 1`,
    [clientId],
  );
  const client = parent.rows[0];
  if (!client) throw new Error('TENANT_RESOURCE_MISMATCH');
  const tenantId = await resolveTrustedTenantForUserWrite(actorUserId, routeFamily, db);
  if (client.tenant_id != null && client.tenant_id !== tenantId) throw new Error('TENANT_RESOURCE_MISMATCH');
  return client.tenant_id ?? tenantId;
};

export const resolveTrustedTenantForCareCaseWrite = async (
  careCaseId: string,
  actorUserId: string,
  routeFamily: string,
  db: Queryable = pool,
): Promise<string> => {
  const parent = await db.query<{ care_case_tenant_id: string | null; client_tenant_id: string | null }>(
    `select care_case.tenant_id as care_case_tenant_id, client.tenant_id as client_tenant_id
       from care_cases care_case
       join fiteatsy_clients client on client.id=care_case.client_id and client.deleted_at is null
      where care_case.id=$1 and care_case.deleted_at is null
      limit 1`,
    [careCaseId],
  );
  const ownership = parent.rows[0];
  if (!ownership) throw new Error('TENANT_RESOURCE_MISMATCH');
  const tenantId = await resolveTrustedTenantForUserWrite(actorUserId, routeFamily, db);
  if (ownership.client_tenant_id != null && ownership.client_tenant_id !== tenantId) {
    throw new Error('TENANT_RESOURCE_MISMATCH');
  }
  if (ownership.care_case_tenant_id != null && ownership.care_case_tenant_id !== tenantId) {
    throw new Error('TENANT_RESOURCE_MISMATCH');
  }
  return ownership.care_case_tenant_id ?? ownership.client_tenant_id ?? tenantId;
};
