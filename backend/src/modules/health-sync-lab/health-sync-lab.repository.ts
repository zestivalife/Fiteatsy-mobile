import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import type { WearableProvider } from '../health/wearable-platform.repository.js';

export const HEALTH_SYNC_METRICS = [
  'steps','distance','sleep','heart_rate','resting_heart_rate','hrv_sdnn','hrv_rmssd',
  'active_energy','exercise','workout','weight','hydration','spo2','respiratory_rate'
] as const;

export type HealthSyncMetric = typeof HEALTH_SYNC_METRICS[number];
export type RequestStatus = 'PENDING'|'ACKNOWLEDGED'|'RUNNING'|'SUCCESS'|'PARTIAL'|'FAILED'|'TIMED_OUT'|'CANCELLED';
export type DiagnosticAuditEvent = 'VIEW_DIAGNOSTICS'|'INSPECT_RECORDS'|'REQUEST_DEVICE_SYNC'|'ADMIN_QUEUE_ACTION';

const newId = (prefix:string) => `${prefix}_${crypto.randomUUID()}`;

export async function auditDiagnosticAccess(input:{actorId:string;targetAccountId:string;connectionId?:string;eventType:DiagnosticAuditEvent;metricType?:string;safeMetadata?:Record<string,string|number|boolean|null>}) {
  await pool.query(`insert into health_sync_diagnostic_audit_events(id,actor_user_id,target_account_id,connection_id,event_type,metric_type,safe_metadata)
    values($1,$2,$3,$4,$5,$6,$7)`,[newId('hsdaud'),input.actorId,input.targetAccountId,input.connectionId??null,input.eventType,input.metricType??null,JSON.stringify(input.safeMetadata??{})]);
}

export async function listDiagnosticDevices(accountId:string, clientId?:string) {
  const values:unknown[]=[accountId];
  const clientClause=clientId ? `and wc.client_id=$2` : '';
  if(clientId) values.push(clientId);
  const result=await pool.query(`select wc.id,wc.client_id,wc.provider,wc.platform,wc.installation_id,wc.status,
    wc.granted_scopes,wc.last_permission_check_at,wc.last_sync_attempt_at,wc.last_successful_sync_at,
    h.app_version,h.mobile_commit_sha,h.device_label,h.last_app_heartbeat_at,h.last_native_heartbeat_at,
    h.last_local_persist_at,h.last_upload_at,coalesce(h.pending_count,0) pending_count,
    coalesce(h.failed_count,0) failed_count,coalesce(h.quarantined_count,0) quarantined_count,
    coalesce(h.persisted_document_bytes,0) persisted_document_bytes
    from wearable_connections wc left join health_sync_device_heartbeats h on h.connection_id=wc.id
    where wc.account_id=$1 ${clientClause} order by wc.updated_at desc`,values);
  return result.rows;
}

export async function getDiagnosticStatus(accountId:string, connectionId:string) {
  const device=await pool.query(`select wc.*,h.* from wearable_connections wc
    left join health_sync_device_heartbeats h on h.connection_id=wc.id
    where wc.id=$1 and wc.account_id=$2`,[connectionId,accountId]);
  if(!device.rows[0]) return null;
  const run=await pool.query(`select * from wearable_sync_runs where connection_id=$1 order by started_at desc limit 1`,[connectionId]);
  return {device:device.rows[0],latestRun:run.rows[0]??null};
}

export async function listMetricDiagnostics(accountId:string, connectionId:string) {
  const result=await pool.query(`with authorised as (
      select id,client_id,provider from wearable_connections where id=$1 and account_id=$2
    ), backend_counts as (
      select ho.metric_type,count(*)::bigint backend_record_count,max(ho.measured_at) latest_backend_at
      from health_observations ho join authorised a on a.client_id=ho.client_id
      where ho.user_id=$2 and ho.deleted_at is null group by ho.metric_type
    ), aggregate_counts as (
      select ha.metric_type,count(*)::bigint aggregate_count,max(ha.calculated_at) latest_aggregate_at
      from health_aggregate_assertions ha join authorised a on a.client_id=ha.client_id
      where ha.user_id=$2 group by ha.metric_type
    ) select m.*,coalesce(b.backend_record_count,0) backend_record_count,b.latest_backend_at,
      coalesce(a.aggregate_count,0) aggregate_count,a.latest_aggregate_at
    from health_sync_metric_status m join authorised z on z.id=m.connection_id
    left join backend_counts b on b.metric_type=m.metric_type
    left join aggregate_counts a on a.metric_type=m.metric_type
    order by m.metric_type`,[connectionId,accountId]);
  return result.rows;
}

export async function getMetricRecords(accountId:string, connectionId:string, metric:string, limit:number) {
  const result=await pool.query(`select ho.id,ho.metric_type,ho.unit,ho.measured_at,ho.start_at,ho.end_at,
    ho.source_provider,ho.source_record_id,ho.provider_updated_at,ho.provider_version,ho.quality_status
    from health_observations ho join wearable_connections wc on wc.client_id=ho.client_id
    where wc.id=$1 and wc.account_id=$2 and ho.user_id=$2 and ho.metric_type=$3 and ho.deleted_at is null
    order by ho.measured_at desc limit $4`,[connectionId,accountId,metric,limit]);
  return result.rows;
}

export async function listQueue(accountId:string, connectionId:string) {
  const heartbeat=await pool.query(`select pending_count,failed_count,quarantined_count,last_upload_at
    from health_sync_device_heartbeats where connection_id=$1 and account_id=$2`,[connectionId,accountId]);
  const requests=await pool.query(`select id,status,requested_metrics,safe_error_code,created_at,started_at,completed_at,expires_at
    from health_sync_requests where connection_id=$1 and account_id=$2 order by created_at desc limit 25`,[connectionId,accountId]);
  return {summary:heartbeat.rows[0]??{pending_count:0,failed_count:0,quarantined_count:0,last_upload_at:null},requests:requests.rows};
}

export async function createSyncRequest(input:{accountId:string;clientId:string;connectionId:string;provider:WearableProvider;metrics:string[];actorId:string}) {
  const requestId=newId('hsreq');
  const result=await pool.query(`insert into health_sync_requests
    (id,connection_id,client_id,account_id,requested_by_user_id,provider,requested_metrics,status,expires_at)
    select $1,wc.id,wc.client_id,wc.account_id,$5,wc.provider,$6,'PENDING',now()+interval '15 minutes'
    from wearable_connections wc where wc.id=$2 and wc.client_id=$3 and wc.account_id=$4 and wc.provider=$7
    and wc.status in ('CONNECTED','PARTIAL') returning *`,
    [requestId,input.connectionId,input.clientId,input.accountId,input.actorId,JSON.stringify(input.metrics),input.provider]);
  if(!result.rows[0]) return null;
  await pool.query(`insert into health_sync_request_events(id,request_id,actor_user_id,event_type,safe_metadata)
    values($1,$2,$3,'REQUESTED',$4)`,[newId('hsevt'),requestId,input.actorId,JSON.stringify({metricCount:input.metrics.length})]);
  await auditDiagnosticAccess({actorId:input.actorId,targetAccountId:input.accountId,connectionId:input.connectionId,eventType:'REQUEST_DEVICE_SYNC',safeMetadata:{metricCount:input.metrics.length}});
  return result.rows[0];
}

export async function getSyncRequest(accountId:string,requestId:string){
  await pool.query(`update health_sync_requests set status='TIMED_OUT',completed_at=now(),updated_at=now()
    where id=$1 and account_id=$2 and status in ('PENDING','ACKNOWLEDGED','RUNNING') and expires_at<=now()`,[requestId,accountId]);
  const result=await pool.query(`select * from health_sync_requests where id=$1 and account_id=$2`,[requestId,accountId]);
  if(!result.rows[0]) return null;
  const events=await pool.query(`select event_type,metric_type,safe_metadata,created_at from health_sync_request_events
    where request_id=$1 order by created_at asc`,[requestId]);
  return {...result.rows[0],events:events.rows};
}

export async function listPendingDeviceRequests(accountId:string,connectionId:string){
  await pool.query(`update health_sync_requests set status='TIMED_OUT',completed_at=now(),updated_at=now()
    where connection_id=$1 and account_id=$2 and status in ('PENDING','ACKNOWLEDGED','RUNNING') and expires_at<=now()`,[connectionId,accountId]);
  const result=await pool.query(`select id,provider,requested_metrics,status,created_at,expires_at from health_sync_requests
    where connection_id=$1 and account_id=$2 and status in ('PENDING','ACKNOWLEDGED','RUNNING') order by created_at`,[connectionId,accountId]);
  return result.rows;
}

export async function recordDeviceProgress(input:{accountId:string;clientId:string;connectionId:string;requestId:string;status:RequestStatus;metric?:string;eventType:string;safeMetadata?:Record<string,unknown>}){
  const result=await pool.query(`update health_sync_requests set status=$1,
    acknowledged_at=case when $1='ACKNOWLEDGED' then coalesce(acknowledged_at,now()) else acknowledged_at end,
    started_at=case when $1='RUNNING' then coalesce(started_at,now()) else started_at end,
    completed_at=case when $1 in ('SUCCESS','PARTIAL','FAILED','TIMED_OUT','CANCELLED') then now() else completed_at end,
    updated_at=now() where id=$2 and connection_id=$3 and client_id=$4 and account_id=$5 returning *`,
    [input.status,input.requestId,input.connectionId,input.clientId,input.accountId]);
  if(!result.rows[0]) return null;
  await pool.query(`insert into health_sync_request_events(id,request_id,actor_user_id,event_type,metric_type,safe_metadata)
    values($1,$2,$3,$4,$5,$6)`,[newId('hsevt'),input.requestId,input.accountId,input.eventType,input.metric??null,JSON.stringify(input.safeMetadata??{})]);
  return result.rows[0];
}

export async function recordDeviceSnapshot(input:{accountId:string;clientId:string;connectionId:string;appVersion?:string;mobileCommitSha?:string;deviceLabel?:string;pendingCount:number;failedCount:number;quarantinedCount:number;persistedDocumentBytes:number;nativeHeartbeat:boolean;localPersisted:boolean;uploaded:boolean;metrics:Array<{metricType:string;supported:boolean;permissionState:string;nativeRecordCount:number;localRecordCount:number;terminalState:string;uploadState:string;latestNativeAt?:string;latestLocalAt?:string;nativeReadAt?:string;localPersistAt?:string;backendPersistAt?:string;displayReadyAt?:string;safeErrorCode?:string}>}){
  const client=await pool.connect();
  try{await client.query('begin');
    const connection=await client.query(`select id from wearable_connections where id=$1 and client_id=$2 and account_id=$3`,[input.connectionId,input.clientId,input.accountId]);
    if(!connection.rows[0]){await client.query('rollback');return null;}
    await client.query(`insert into health_sync_device_heartbeats(connection_id,client_id,account_id,app_version,mobile_commit_sha,device_label,
      last_app_heartbeat_at,last_native_heartbeat_at,last_local_persist_at,last_upload_at,pending_count,failed_count,quarantined_count,persisted_document_bytes)
      values($1,$2,$3,$4,$5,$6,now(),case when $11 then now() end,case when $12 then now() end,case when $13 then now() end,$7,$8,$9,$10)
      on conflict(connection_id) do update set app_version=excluded.app_version,mobile_commit_sha=excluded.mobile_commit_sha,
      device_label=excluded.device_label,last_app_heartbeat_at=now(),last_native_heartbeat_at=coalesce(excluded.last_native_heartbeat_at,health_sync_device_heartbeats.last_native_heartbeat_at),
      last_local_persist_at=coalesce(excluded.last_local_persist_at,health_sync_device_heartbeats.last_local_persist_at),last_upload_at=coalesce(excluded.last_upload_at,health_sync_device_heartbeats.last_upload_at),
      pending_count=excluded.pending_count,failed_count=excluded.failed_count,quarantined_count=excluded.quarantined_count,persisted_document_bytes=excluded.persisted_document_bytes,updated_at=now()`,
      [input.connectionId,input.clientId,input.accountId,input.appVersion??null,input.mobileCommitSha??null,input.deviceLabel??null,input.pendingCount,input.failedCount,input.quarantinedCount,input.persistedDocumentBytes,input.nativeHeartbeat,input.localPersisted,input.uploaded]);
    for(const metric of input.metrics) await client.query(`insert into health_sync_metric_status(connection_id,client_id,account_id,metric_type,supported,permission_state,native_record_count,local_record_count,latest_native_at,latest_local_at,terminal_state,upload_state,native_read_at,local_persist_at,backend_persist_at,display_ready_at,safe_error_code)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      on conflict(connection_id,metric_type) do update set supported=excluded.supported,permission_state=excluded.permission_state,native_record_count=excluded.native_record_count,local_record_count=excluded.local_record_count,latest_native_at=excluded.latest_native_at,latest_local_at=excluded.latest_local_at,terminal_state=excluded.terminal_state,upload_state=excluded.upload_state,native_read_at=excluded.native_read_at,local_persist_at=excluded.local_persist_at,backend_persist_at=excluded.backend_persist_at,display_ready_at=excluded.display_ready_at,safe_error_code=excluded.safe_error_code,updated_at=now()`,
      [input.connectionId,input.clientId,input.accountId,metric.metricType,metric.supported,metric.permissionState,metric.nativeRecordCount,metric.localRecordCount,metric.latestNativeAt??null,metric.latestLocalAt??null,metric.terminalState,metric.uploadState,metric.nativeReadAt??null,metric.localPersistAt??null,metric.backendPersistAt??null,metric.displayReadyAt??null,metric.safeErrorCode??null]);
    await client.query('commit');return {ok:true};
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}
