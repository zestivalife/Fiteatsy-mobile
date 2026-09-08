import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';

export type WearableProvider = 'APPLE_HEALTH' | 'HEALTH_CONNECT';
export type WearableTrigger = 'INITIAL_CONNECT' | 'MANUAL' | 'FOREGROUND_RESUME' | 'BACKGROUND' | 'RETRY';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const acceptWearableConsent = async (
  owner: ClientOwnershipContext,
  input: { provider: WearableProvider; consentVersion: string; purposeVersion: string; requestedScopes: string[]; purposes: string[] }
) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update wearable_consents set status = 'WITHDRAWN', withdrawn_at = now(), updated_at = now()
       where client_id = $1 and account_id = $2 and provider = $3 and status = 'ACTIVE'`,
      [owner.clientId, owner.accountId, input.provider]
    );
    const result = await client.query(
      `insert into wearable_consents
       (id, client_id, account_id, provider, consent_version, purpose_version, status,
        requested_metric_scopes, acknowledged_purposes, accepted_at)
       values ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$8,now()) returning *`,
      [id('wcon'), owner.clientId, owner.accountId, input.provider, input.consentVersion,
        input.purposeVersion, JSON.stringify(input.requestedScopes), JSON.stringify(input.purposes)]
    );
    await client.query('commit');
    return result.rows[0];
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const getActiveWearableConsent = async (owner: ClientOwnershipContext, provider: WearableProvider) => {
  const result = await pool.query(
    `select * from wearable_consents where client_id=$1 and account_id=$2 and provider=$3 and status='ACTIVE'
     order by accepted_at desc limit 1`,
    [owner.clientId, owner.accountId, provider]
  );
  return result.rows[0] ?? null;
};

export const upsertWearableConnection = async (
  owner: ClientOwnershipContext,
  input: { consentId: string; provider: WearableProvider; platform: 'IOS' | 'ANDROID'; installationId: string;
    status: 'CONNECTED' | 'PARTIAL' | 'PERMISSION_REQUIRED' | 'REVOKED' | 'UNAVAILABLE' | 'ERROR'; grantedScopes: string[];
    backgroundSyncEnabled?: boolean }
) => {
  const result = await pool.query(
    `insert into wearable_connections
     (id, client_id, account_id, consent_id, provider, platform, installation_id, status,
      granted_scopes, last_permission_check_at, connected_at, background_sync_enabled)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),case when $8 in ('CONNECTED','PARTIAL') then now() end,$10)
     on conflict (client_id, provider, installation_id) do update set
       consent_id=excluded.consent_id, status=excluded.status, granted_scopes=excluded.granted_scopes,
       last_permission_check_at=now(), connected_at=coalesce(wearable_connections.connected_at, excluded.connected_at),
       disconnected_at=case when excluded.status='REVOKED' then now() else null end,
       background_sync_enabled=excluded.background_sync_enabled, updated_at=now()
     returning *`,
    [id('wconn'), owner.clientId, owner.accountId, input.consentId, input.provider, input.platform,
      input.installationId, input.status, JSON.stringify(input.grantedScopes), input.backgroundSyncEnabled ?? false]
  );
  return result.rows[0];
};

export const listWearableConnections = async (owner: ClientOwnershipContext) => {
  const result = await pool.query(
    `select wc.*, c.status consent_status, c.consent_version, c.purpose_version
     from wearable_connections wc join wearable_consents c on c.id=wc.consent_id
     where wc.client_id=$1 and wc.account_id=$2 order by wc.updated_at desc`,
    [owner.clientId, owner.accountId]
  );
  return result.rows;
};

export const startWearableSyncRun = async (owner: ClientOwnershipContext, connectionId: string, provider: WearableProvider, trigger: WearableTrigger) => {
  const result = await pool.query(
    `insert into wearable_sync_runs (id,connection_id,client_id,provider,trigger,status)
     select $1,wc.id,wc.client_id,wc.provider,$4,'RUNNING' from wearable_connections wc
     join wearable_consents c on c.id=wc.consent_id and c.status='ACTIVE'
     where wc.id=$2 and wc.client_id=$3 and wc.account_id=$5 and wc.provider=$6
       and wc.status in ('CONNECTED','PARTIAL') returning *`,
    [id('wsrun'), connectionId, owner.clientId, trigger, owner.accountId, provider]
  );
  return result.rows[0] ?? null;
};

export const completeWearableSyncRun = async (
  owner: ClientOwnershipContext,
  runId: string,
  input: { status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; recordsRead: number; recordsUploaded: number;
    recordsInserted: number; recordsDuplicates: number; recordsUpdated: number; recordsDeleted: number;
    errorStage?: string; errorCode?: string; safeErrorSummary?: string; checkpointAfter?: unknown }
) => {
  const result = await pool.query(
    `update wearable_sync_runs r set status=$1,completed_at=now(),records_read=$2,records_uploaded=$3,
      records_inserted=$4,records_duplicates=$5,records_updated=$6,records_deleted=$7,error_stage=$8,
      error_code=$9,safe_error_summary=$10,checkpoint_after=$11
     from wearable_connections wc where r.id=$12 and r.connection_id=wc.id and wc.client_id=$13 and wc.account_id=$14
     returning r.*`,
    [input.status,input.recordsRead,input.recordsUploaded,input.recordsInserted,input.recordsDuplicates,
      input.recordsUpdated,input.recordsDeleted,input.errorStage ?? null,input.errorCode ?? null,
      input.safeErrorSummary ?? null,input.checkpointAfter == null ? null : JSON.stringify(input.checkpointAfter),
      runId,owner.clientId,owner.accountId]
  );
  if (result.rows[0]) {
    await pool.query(
      `update wearable_connections set last_sync_attempt_at=now(),
       last_successful_sync_at=case when $1 in ('SUCCESS','PARTIAL') then now() else last_successful_sync_at end,
       last_error_code=case when $1='FAILED' then $2 else null end,
       last_error_at=case when $1='FAILED' then now() else null end,updated_at=now() where id=$3`,
      [input.status,input.errorCode ?? null,result.rows[0].connection_id]
    );
  }
  return result.rows[0] ?? null;
};

export const commitWearableCheckpoint = async (
  owner: ClientOwnershipContext,
  input: { connectionId: string; provider: WearableProvider; metricScope: string; cursorValue?: string; anchorValue?: string; backfillComplete?: boolean }
) => {
  const result = await pool.query(
    `insert into wearable_sync_checkpoints
     (id,connection_id,client_id,provider,metric_scope,cursor_value,anchor_value,backfill_started_at,backfill_completed_at)
     select $1,wc.id,wc.client_id,wc.provider,$4,$5,$6,now(),case when $7 then now() end
     from wearable_connections wc where wc.id=$2 and wc.client_id=$3 and wc.account_id=$8 and wc.provider=$9
     on conflict (connection_id,metric_scope) do update set cursor_value=excluded.cursor_value,
       anchor_value=excluded.anchor_value,backfill_completed_at=coalesce(wearable_sync_checkpoints.backfill_completed_at,excluded.backfill_completed_at),
       committed_at=now(),updated_at=now() returning *`,
    [id('wcp'),input.connectionId,owner.clientId,input.metricScope,input.cursorValue ?? null,input.anchorValue ?? null,
      input.backfillComplete ?? false,owner.accountId,input.provider]
  );
  return result.rows[0] ?? null;
};

export const listWearableCheckpoints = async (owner: ClientOwnershipContext, connectionId: string) => {
  const result = await pool.query(`select cp.metric_scope,cp.cursor_value,cp.anchor_value,cp.backfill_completed_at,cp.committed_at
    from wearable_sync_checkpoints cp join wearable_connections wc on wc.id=cp.connection_id
    where cp.connection_id=$1 and cp.client_id=$2 and wc.account_id=$3 order by cp.metric_scope`,
    [connectionId,owner.clientId,owner.accountId]);
  return result.rows;
};

export const withdrawWearableConsent = async (owner: ClientOwnershipContext, provider: WearableProvider) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`update wearable_consents set status='WITHDRAWN',withdrawn_at=now(),updated_at=now()
      where client_id=$1 and account_id=$2 and provider=$3 and status='ACTIVE'`, [owner.clientId,owner.accountId,provider]);
    await client.query(`update wearable_connections set status='REVOKED',disconnected_at=now(),background_sync_enabled=false,updated_at=now()
      where client_id=$1 and account_id=$2 and provider=$3`, [owner.clientId,owner.accountId,provider]);
    await client.query(`insert into wearable_audit_events(id,client_id,account_id,provider,event_type,safe_metadata)
      values($1,$2,$3,$4,'CONSENT_WITHDRAWN','{}'::jsonb)`, [id('waud'),owner.clientId,owner.accountId,provider]);
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
};
