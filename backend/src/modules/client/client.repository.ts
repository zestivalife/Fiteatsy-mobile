import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

type Queryable = Pick<PoolClient, 'query'>;

export type PersistedClient = {
  id: string;
  tenantId: string;
  fiteatsyClientId: string;
  accountUserId: string;
  status: string;
  version: number;
  createdAtISO: string;
  updatedAtISO: string;
  deletedAtISO: string | null;
};

const CLIENT_PUBLIC_ID_PREFIX = 'fc_';

const toIso = (value: unknown) => {
  if (!value) return null;
  return new Date(String(value)).toISOString();
};

const mapClient = (row: Record<string, unknown>): PersistedClient => ({
  id: String(row.id),
  tenantId: String(row.tenant_id),
  fiteatsyClientId: String(row.fiteatsy_client_id),
  accountUserId: String(row.account_user_id),
  status: String(row.status),
  version: Number(row.version),
  createdAtISO: new Date(String(row.created_at)).toISOString(),
  updatedAtISO: new Date(String(row.updated_at)).toISOString(),
  deletedAtISO: toIso(row.deleted_at)
});

const buildClientPublicId = () => `${CLIENT_PUBLIC_ID_PREFIX}${crypto.randomBytes(16).toString('hex')}`;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code?: unknown }).code === 'string' &&
  (error as { code: string }).code === '23505';

const FITEATSY_HOME_TENANT_SLUG = 'zestiva';

export const resolveFiteatsyHomeTenantId = async (db: Queryable = pool) => {
  const result = await db.query(
    `select id::text as id
       from tenants
      where slug = $1
        and tenant_type = 'ZESTIVA_INTERNAL'
        and lower(status) = 'active'
      limit 2`,
    [FITEATSY_HOME_TENANT_SLUG]
  );
  if (result.rowCount !== 1) {
    const error = new Error('Fiteatsy home tenant is unavailable.');
    error.name = 'FITEATSY_TENANT_UNAVAILABLE';
    throw error;
  }
  return String(result.rows[0].id);
};

const ensureClientMembership = async (accountUserId: string, tenantId: string, db: Queryable) => {
  const timestamp = new Date().toISOString();
  await db.query(
    `insert into tenant_memberships (
       id, tenant_id, user_id, tenant_role, status, joined_at, created_at, updated_at
     ) values ($1, $2, $3, 'CLIENT', 'active', $4, $4, $4)
     on conflict (tenant_id, user_id) do update
       set status = 'active',
           removed_at = null,
           updated_at = excluded.updated_at`,
    [crypto.randomUUID(), tenantId, accountUserId, timestamp]
  );
};

const assertClientTenant = (client: PersistedClient, tenantId: string) => {
  if (client.tenantId === tenantId) return;
  const error = new Error('Client belongs to a different tenant.');
  error.name = 'CLIENT_TENANT_MISMATCH';
  throw error;
};

export const getClientByAccountUserId = async (
  accountUserId: string,
  db: Queryable = pool
) => {
  const result = await db.query(
    `
      select *
      from fiteatsy_clients
      where account_user_id = $1
        and deleted_at is null
      order by case when lower(coalesce(status, '')) = 'active' then 0 else 1 end, updated_at desc
      limit 1
    `,
    [accountUserId]
  );
  if (result.rowCount === 0) return null;
  return mapClient(result.rows[0]);
};

const getClientByAccountUserIdAnyStatus = async (
  accountUserId: string,
  db: Queryable = pool
) => {
  const result = await db.query(
    `
      select *
      from fiteatsy_clients
      where account_user_id = $1
      order by
        case
          when deleted_at is null and lower(coalesce(status, '')) = 'active' then 0
          when deleted_at is null then 1
          else 2
        end,
        updated_at desc
      limit 1
    `,
    [accountUserId]
  );
  if (result.rowCount === 0) return null;
  return mapClient(result.rows[0]);
};

const reactivateClientRecord = async (clientId: string, tenantId: string, db: Queryable = pool) => {
  const timestamp = new Date().toISOString();
  const result = await db.query(
    `
      update fiteatsy_clients
      set
        status = 'active',
        deleted_at = null,
        updated_at = $3,
        version = version + 1
      where id = $1 and tenant_id = $2
      returning *
    `,
    [clientId, tenantId, timestamp]
  );
  if (result.rowCount === 0) return null;
  return mapClient(result.rows[0]);
};

export const getClientByFiteatsyClientId = async (
  fiteatsyClientId: string,
  db: Queryable = pool
) => {
  const result = await db.query(
    `
      select *
      from fiteatsy_clients
      where fiteatsy_client_id = $1
        and deleted_at is null
      limit 1
    `,
    [fiteatsyClientId]
  );
  if (result.rowCount === 0) return null;
  return mapClient(result.rows[0]);
};

export const createOrResolveClientForAccount = async (
  accountUserId: string,
  db: Queryable = pool,
  resolvedTenantId?: string
): Promise<PersistedClient> => {
  const tenantId = resolvedTenantId ?? await resolveFiteatsyHomeTenantId(db);
  await ensureClientMembership(accountUserId, tenantId, db);
  const existing = await getClientByAccountUserIdAnyStatus(accountUserId, db);
  if (existing) {
    assertClientTenant(existing, tenantId);
    if (existing.deletedAtISO == null && existing.status.toLowerCase() === 'active') return existing;
    const reactivated = await reactivateClientRecord(existing.id, tenantId, db);
    if (reactivated) return reactivated;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const inserted = await db.query(
        `
          insert into fiteatsy_clients (
            id,
            tenant_id,
            fiteatsy_client_id,
            account_user_id,
            status,
            version,
            created_at,
            updated_at
          ) values ($1, $2, $3, $4, 'active', 1, $5, $5)
          on conflict (account_user_id) do nothing
          returning *
        `,
        [crypto.randomUUID(), tenantId, buildClientPublicId(), accountUserId, new Date().toISOString()]
      );
      if (inserted.rowCount === 1) return mapClient(inserted.rows[0]);
      const resolved = await getClientByAccountUserIdAnyStatus(accountUserId, db);
      if (resolved) {
        assertClientTenant(resolved, tenantId);
        if (resolved.deletedAtISO == null && resolved.status.toLowerCase() === 'active') return resolved;
        const reactivated = await reactivateClientRecord(resolved.id, tenantId, db);
        if (reactivated) return reactivated;
      }
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  const resolved = await getClientByAccountUserIdAnyStatus(accountUserId, db);
  if (resolved) {
    assertClientTenant(resolved, tenantId);
    if (resolved.deletedAtISO == null && resolved.status.toLowerCase() === 'active') return resolved;
    const reactivated = await reactivateClientRecord(resolved.id, tenantId, db);
    if (reactivated) return reactivated;
  }
  throw new Error('Failed to create or resolve Fiteatsy client for account.');
};

export const resolveCurrentClientForAccount = async (
  accountUserId: string,
  db: Queryable = pool
) => createOrResolveClientForAccount(accountUserId, db);

export const countClients = async () => {
  const result = await pool.query('select count(*)::int as count from fiteatsy_clients where deleted_at is null');
  return Number(result.rows[0]?.count ?? 0);
};
