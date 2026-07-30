import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';

type Queryable = Pick<PoolClient, 'query'>;

export type PersistedClient = {
  id: string;
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
      limit 1
    `,
    [accountUserId]
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
  db: Queryable = pool
): Promise<PersistedClient> => {
  const existing = await getClientByAccountUserId(accountUserId, db);
  if (existing) return existing;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const inserted = await db.query(
        `
          insert into fiteatsy_clients (
            id,
            fiteatsy_client_id,
            account_user_id,
            status,
            version,
            created_at,
            updated_at
          ) values ($1, $2, $3, 'active', 1, $4, $4)
          on conflict (account_user_id) do nothing
          returning *
        `,
        [crypto.randomUUID(), buildClientPublicId(), accountUserId, new Date().toISOString()]
      );
      if (inserted.rowCount === 1) return mapClient(inserted.rows[0]);
      const resolved = await getClientByAccountUserId(accountUserId, db);
      if (resolved) return resolved;
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  const resolved = await getClientByAccountUserId(accountUserId, db);
  if (resolved) return resolved;
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
