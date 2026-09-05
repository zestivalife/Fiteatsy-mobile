import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
const CLIENT_PUBLIC_ID_PREFIX = 'fc_';
const toIso = (value) => {
    if (!value)
        return null;
    return new Date(String(value)).toISOString();
};
const mapClient = (row) => ({
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
const isUniqueViolation = (error) => typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === '23505';
export const getClientByAccountUserId = async (accountUserId, db = pool) => {
    const result = await db.query(`
      select *
      from fiteatsy_clients
      where account_user_id = $1
        and deleted_at is null
      order by case when lower(coalesce(status, '')) = 'active' then 0 else 1 end, updated_at desc
      limit 1
    `, [accountUserId]);
    if (result.rowCount === 0)
        return null;
    return mapClient(result.rows[0]);
};
const getClientByAccountUserIdAnyStatus = async (accountUserId, db = pool) => {
    const result = await db.query(`
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
    `, [accountUserId]);
    if (result.rowCount === 0)
        return null;
    return mapClient(result.rows[0]);
};
const reactivateClientRecord = async (clientId, db = pool) => {
    const timestamp = new Date().toISOString();
    const result = await db.query(`
      update fiteatsy_clients
      set
        status = 'active',
        deleted_at = null,
        updated_at = $2,
        version = version + 1
      where id = $1
      returning *
    `, [clientId, timestamp]);
    if (result.rowCount === 0)
        return null;
    return mapClient(result.rows[0]);
};
export const getClientByFiteatsyClientId = async (fiteatsyClientId, db = pool) => {
    const result = await db.query(`
      select *
      from fiteatsy_clients
      where fiteatsy_client_id = $1
        and deleted_at is null
      limit 1
    `, [fiteatsyClientId]);
    if (result.rowCount === 0)
        return null;
    return mapClient(result.rows[0]);
};
export const createOrResolveClientForAccount = async (accountUserId, db = pool) => {
    const existing = await getClientByAccountUserIdAnyStatus(accountUserId, db);
    if (existing) {
        if (existing.deletedAtISO == null && existing.status.toLowerCase() === 'active')
            return existing;
        const reactivated = await reactivateClientRecord(existing.id, db);
        if (reactivated)
            return reactivated;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const inserted = await db.query(`
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
        `, [crypto.randomUUID(), buildClientPublicId(), accountUserId, new Date().toISOString()]);
            if (inserted.rowCount === 1)
                return mapClient(inserted.rows[0]);
            const resolved = await getClientByAccountUserIdAnyStatus(accountUserId, db);
            if (resolved) {
                if (resolved.deletedAtISO == null && resolved.status.toLowerCase() === 'active')
                    return resolved;
                const reactivated = await reactivateClientRecord(resolved.id, db);
                if (reactivated)
                    return reactivated;
            }
        }
        catch (error) {
            if (isUniqueViolation(error))
                continue;
            throw error;
        }
    }
    const resolved = await getClientByAccountUserIdAnyStatus(accountUserId, db);
    if (resolved) {
        if (resolved.deletedAtISO == null && resolved.status.toLowerCase() === 'active')
            return resolved;
        const reactivated = await reactivateClientRecord(resolved.id, db);
        if (reactivated)
            return reactivated;
    }
    throw new Error('Failed to create or resolve Fiteatsy client for account.');
};
export const resolveCurrentClientForAccount = async (accountUserId, db = pool) => createOrResolveClientForAccount(accountUserId, db);
export const countClients = async () => {
    const result = await pool.query('select count(*)::int as count from fiteatsy_clients where deleted_at is null');
    return Number(result.rows[0]?.count ?? 0);
};
