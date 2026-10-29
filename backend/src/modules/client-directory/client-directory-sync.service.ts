import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import type { PersistedAuthUser } from '../auth/auth.repository.js';
import type { PersistedClient } from '../client/client.repository.js';

type Queryable = Pick<PoolClient, 'query'>;
export type ClientDirectoryEventType =
  | 'FITEATSY_USER_REGISTERED'
  | 'FITEATSY_USER_VERIFIED'
  | 'FITEATSY_USER_PROFILE_UPDATED'
  | 'FITEATSY_USER_STATUS_CHANGED'
  | 'FITEATSY_USER_DEACTIVATED'
  | 'FITEATSY_USER_DELETED';

const DELIVERY_BATCH_SIZE = 50;
const RECONCILIATION_BATCH_SIZE = 250;
const MAX_DELIVERY_ATTEMPTS = 8;
const DISPATCH_INTERVAL_MS = 60_000;
const RECONCILIATION_INTERVAL_MS = 15 * 60_000;

const base64Url = (value: string | Buffer) => Buffer.from(value).toString('base64url');
const eligibleRole = (role: string | null) => ['user', 'client'].includes((role ?? 'user').toLowerCase());

const eventPayload = (user: PersistedAuthUser, client: PersistedClient | null, tombstone = false) => ({
  fiteatsy_user_id: user.id,
  fiteatsy_client_id: tombstone ? null : client?.fiteatsyClientId ?? null,
  display_name: tombstone ? 'Removed account' : user.name,
  mobile_number_normalized: tombstone ? null : user.mobileNumber,
  email_normalized: tombstone ? null : user.email,
  account_status: tombstone ? 'REMOVED' : user.status.toUpperCase(),
  mobile_verified: tombstone ? false : Boolean(user.mobileVerifiedAtISO),
  registration_status: tombstone ? 'PENDING' : user.mobileVerifiedAtISO ? 'COMPLETED' : 'PENDING',
  registered_at: user.createdAtISO,
  source_updated_at: user.updatedAtISO,
  deleted_at: tombstone ? user.updatedAtISO : user.deletedAtISO,
});

export const enqueueClientDirectoryEvent = async (
  db: Queryable,
  eventType: ClientDirectoryEventType,
  user: PersistedAuthUser,
  client: PersistedClient | null,
  options: { allowTombstone?: boolean } = {},
) => {
  const roleIneligible = !eligibleRole(user.role);
  const tombstone = eventType === 'FITEATSY_USER_DELETED' || roleIneligible;
  if (roleIneligible && !options.allowTombstone) return false;
  const timestamp = new Date().toISOString();
  await db.query(
    `insert into fiteatsy_client_directory_outbox(
       id,event_type,aggregate_user_id,source_version,schema_version,payload,
       occurred_at,available_at,created_at
     ) values ($1,$2,$3,$4,1,$5::jsonb,$6,$6,$6)
     on conflict (aggregate_user_id,source_version,event_type) do nothing`,
    [crypto.randomUUID(), eventType, user.id, user.version, JSON.stringify(eventPayload(user, client, tombstone)), timestamp],
  );
  return true;
};

const createServiceAssertion = (nowSeconds = Math.floor(Date.now() / 1000)) => {
  const header = base64Url(JSON.stringify({
    alg: 'RS256', typ: 'JWT',
    ...(env.externalConsultantsAssertionKeyId ? { kid: env.externalConsultantsAssertionKeyId } : {}),
  }));
  const payload = base64Url(JSON.stringify({
    iss: env.externalConsultantsAssertionIssuer,
    aud: env.externalConsultantsAssertionAudience,
    sub: 'fiteatsy-client-directory-sync',
    actor_type: 'FITEATSY_SERVICE',
    purpose: 'client_directory_sync',
    iat: nowSeconds,
    exp: nowSeconds + 120,
    jti: crypto.randomUUID(),
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), env.externalConsultantsAssertionPrivateKey);
  return `${unsigned}.${signature.toString('base64url')}`;
};

const destinationUrl = () => `${env.externalConsultantsBaseUrl}/api/v1/internal/fiteatsy-client-directory/events`;

export const dispatchClientDirectoryEvents = async () => {
  if (!env.clientDirectorySyncEnabled || !env.externalConsultantsEnabled || !env.externalConsultantsBaseUrl || !env.externalConsultantsAssertionPrivateKey) {
    return { enabled: false, delivered: 0, failed: 0 };
  }
  const claimed = await pool.query(
    `update fiteatsy_client_directory_outbox o
        set delivery_attempts = delivery_attempts + 1,
            available_at = now() + interval '2 minutes'
       from (
         select id from fiteatsy_client_directory_outbox
          where delivered_at is null and dead_lettered_at is null and available_at <= now()
          order by created_at,id
          for update skip locked limit $1
       ) pending
      where o.id=pending.id
      returning o.*`,
    [DELIVERY_BATCH_SIZE],
  );
  let delivered = 0;
  let failed = 0;
  for (const row of claimed.rows) {
    try {
      const response = await fetch(destinationUrl(), {
        method: 'POST',
        signal: AbortSignal.timeout(12_000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${createServiceAssertion()}`,
          'Idempotency-Key': String(row.id),
        },
        body: JSON.stringify({
          event_id: row.id,
          event_type: row.event_type,
          fiteatsy_user_id: row.aggregate_user_id,
          source_version: row.source_version,
          schema_version: row.schema_version,
          occurred_at: new Date(row.occurred_at).toISOString(),
          data: row.payload,
        }),
      });
      if (!response.ok) throw Object.assign(new Error('directory destination rejected event'), { code: `HTTP_${response.status}` });
      await pool.query(
        `update fiteatsy_client_directory_outbox
            set delivered_at=now(),last_error_code=null
          where id=$1`,
        [row.id],
      );
      delivered += 1;
    } catch (error) {
      const attempts = Number(row.delivery_attempts);
      const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 6));
      await pool.query(
        `update fiteatsy_client_directory_outbox
            set last_error_code=$2,
                available_at=now()+($3::text || ' minutes')::interval,
                dead_lettered_at=case when delivery_attempts >= $4 then now() else null end
          where id=$1`,
        [row.id, error instanceof Error && 'code' in error ? String(error.code) : 'DELIVERY_FAILED', delayMinutes, MAX_DELIVERY_ATTEMPTS],
      );
      failed += 1;
    }
  }
  if (delivered > 0) {
    await pool.query(`update fiteatsy_client_directory_sync_state set last_successful_delivery_at=now(),updated_at=now() where singleton=true`);
  }
  return { enabled: true, delivered, failed };
};

const mapReconciliationUser = (row: Record<string, unknown>): PersistedAuthUser => ({
  id: String(row.id), name: String(row.name), email: row.email_normalized == null ? null : String(row.email_normalized),
  mobileNumber: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
  role: row.role == null ? null : String(row.role), accountPurpose: String(row.account_purpose ?? 'USER'),
  status: String(row.status), version: Number(row.version), createdAtISO: new Date(String(row.created_at)).toISOString(),
  updatedAtISO: new Date(String(row.updated_at)).toISOString(), deletedAtISO: row.deleted_at == null ? null : new Date(String(row.deleted_at)).toISOString(),
  lastLoginAtISO: row.last_login_at == null ? null : new Date(String(row.last_login_at)).toISOString(),
  emailVerifiedAtISO: row.email_verified_at == null ? null : new Date(String(row.email_verified_at)).toISOString(),
  mobileVerifiedAtISO: row.mobile_verified_at == null ? null : new Date(String(row.mobile_verified_at)).toISOString(),
});

export const reconcileClientDirectoryOutbox = async () => {
  const connection = await pool.connect();
  const lock = await connection.query(`select pg_try_advisory_lock(hashtext('fiteatsy_client_directory_reconciliation')) as acquired`);
  if (!lock.rows[0]?.acquired) {
    connection.release();
    return { processed: 0, complete: false, skipped: 'ALREADY_RUNNING' as const };
  }
  try {
  const state = await connection.query(`select last_reconciliation_user_id from fiteatsy_client_directory_sync_state where singleton=true`);
  const checkpoint = state.rows[0]?.last_reconciliation_user_id ?? null;
  if (checkpoint == null) {
    await connection.query(`update fiteatsy_client_directory_sync_state set reconciliation_started_at=now(),updated_at=now() where singleton=true`);
  }
  const rows = await connection.query(
    `select u.*,c.id as client_row_id,c.tenant_id,c.fiteatsy_client_id,c.status as client_status,
            c.version as client_version,c.created_at as client_created_at,c.updated_at as client_updated_at,c.deleted_at as client_deleted_at
       from users u
       left join fiteatsy_clients c on c.account_user_id=u.id
      where (
          lower(coalesce(u.role,'user')) in ('user','client')
          or exists (select 1 from fiteatsy_client_directory_outbox prior where prior.aggregate_user_id=u.id)
        )
        and ($1::uuid is null or u.id > $1::uuid)
      order by u.id limit $2`,
    [checkpoint, RECONCILIATION_BATCH_SIZE],
  );
  for (const row of rows.rows) {
    const user = mapReconciliationUser(row);
    const client: PersistedClient | null = row.client_row_id == null ? null : {
      id: String(row.client_row_id), tenantId: String(row.tenant_id), fiteatsyClientId: String(row.fiteatsy_client_id),
      accountUserId: user.id, status: String(row.client_status), version: Number(row.client_version),
      createdAtISO: new Date(String(row.client_created_at)).toISOString(), updatedAtISO: new Date(String(row.client_updated_at)).toISOString(),
      deletedAtISO: row.client_deleted_at == null ? null : new Date(String(row.client_deleted_at)).toISOString(),
    };
    const eventType: ClientDirectoryEventType = user.deletedAtISO || !eligibleRole(user.role)
      ? 'FITEATSY_USER_DELETED'
      : user.status.toLowerCase() === 'active' ? 'FITEATSY_USER_PROFILE_UPDATED' : 'FITEATSY_USER_DEACTIVATED';
    await enqueueClientDirectoryEvent(connection, eventType, user, client, { allowTombstone: true });
  }
  const nextCheckpoint = rows.rows.length === RECONCILIATION_BATCH_SIZE ? rows.rows.at(-1)?.id : null;
  let sourceCount: number | null = null;
  let excludedCount: number | null = null;
  let duplicateMobileCount: number | null = null;
  if (nextCheckpoint == null) {
    const counts = await connection.query(`select
      count(*) filter (where lower(coalesce(role,'user')) in ('user','client') and deleted_at is null)::int as source_count,
      count(*) filter (where lower(coalesce(role,'user')) not in ('user','client') or deleted_at is not null)::int as excluded_count,
      (select count(*)::int from (
        select right(regexp_replace(coalesce(mobile_number_normalized,''),'[^0-9]','','g'),10)
          from users
         where lower(coalesce(role,'user')) in ('user','client') and deleted_at is null
           and length(regexp_replace(coalesce(mobile_number_normalized,''),'[^0-9]','','g')) >= 10
         group by right(regexp_replace(coalesce(mobile_number_normalized,''),'[^0-9]','','g'),10)
        having count(*) > 1
      ) duplicates) as duplicate_mobile_count
      from users`);
    sourceCount = Number(counts.rows[0]?.source_count ?? 0);
    excludedCount = Number(counts.rows[0]?.excluded_count ?? 0);
    duplicateMobileCount = Number(counts.rows[0]?.duplicate_mobile_count ?? 0);
  }
  await connection.query(
    `update fiteatsy_client_directory_sync_state
        set last_reconciliation_user_id=$1,
            last_successful_reconciliation_at=case when $1::uuid is null then now() else last_successful_reconciliation_at end,
            last_source_count=coalesce($2,last_source_count),
            last_excluded_count=coalesce($3,last_excluded_count),
            last_duplicate_mobile_count=coalesce($4,last_duplicate_mobile_count),
            updated_at=now()
      where singleton=true`,
    [nextCheckpoint, sourceCount, excludedCount, duplicateMobileCount],
  );
  return { processed: rows.rowCount, complete: nextCheckpoint == null };
  } finally {
    await connection.query(`select pg_advisory_unlock(hashtext('fiteatsy_client_directory_reconciliation'))`);
    connection.release();
  }
};

export const getClientDirectorySyncStatus = async () => {
  const [state, queue] = await Promise.all([
    pool.query(`select reconciliation_started_at,last_successful_delivery_at,last_successful_reconciliation_at,
      last_reconciliation_user_id,last_source_count,last_excluded_count,last_duplicate_mobile_count,updated_at
      from fiteatsy_client_directory_sync_state where singleton=true`),
    pool.query(`select
      count(*) filter (where delivered_at is null and dead_lettered_at is null)::int as pending,
      count(*) filter (where delivered_at is not null)::int as delivered,
      count(*) filter (where dead_lettered_at is not null)::int as dead_lettered
      from fiteatsy_client_directory_outbox`),
  ]);
  return { enabled: env.clientDirectorySyncEnabled, state: state.rows[0] ?? null, queue: queue.rows[0] ?? { pending: 0, delivered: 0, dead_lettered: 0 } };
};

export const replayDeadLetteredClientDirectoryEvents = async (limit: number) => {
  const result = await pool.query(
    `update fiteatsy_client_directory_outbox o
        set dead_lettered_at=null,last_error_code=null,delivery_attempts=0,available_at=now()
       from (select id from fiteatsy_client_directory_outbox where dead_lettered_at is not null order by created_at,id limit $1) failed
      where o.id=failed.id returning o.id`,
    [limit],
  );
  return { replayed: result.rowCount };
};

export const scheduleClientDirectorySync = () => {
  if (!env.clientDirectorySyncEnabled) return { dispatchTimer: null, reconciliationTimer: null };
  const runDispatch = () => void dispatchClientDirectoryEvents().catch(() => undefined);
  const runReconciliation = () => void reconcileClientDirectoryOutbox().catch(() => undefined);
  runReconciliation();
  runDispatch();
  const dispatchTimer = setInterval(runDispatch, DISPATCH_INTERVAL_MS);
  const reconciliationTimer = setInterval(runReconciliation, RECONCILIATION_INTERVAL_MS);
  dispatchTimer.unref();
  reconciliationTimer.unref();
  return { dispatchTimer, reconciliationTimer };
};
