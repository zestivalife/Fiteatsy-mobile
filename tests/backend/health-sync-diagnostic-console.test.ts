import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { HEALTH_SYNC_METRICS } from '../../backend/src/modules/health-sync-lab/health-sync-lab.repository.ts';
import { renderHealthSyncLabPage } from '../../backend/src/modules/health-sync-lab/health-sync-lab.page.ts';
import { isLocalHealthLabRequest } from '../../backend/src/modules/health-sync-lab/health-sync-lab.routes.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const routes=readFileSync(path.join(root,'backend/src/modules/health-sync-lab/health-sync-lab.routes.ts'),'utf8');
const repository=readFileSync(path.join(root,'backend/src/modules/health-sync-lab/health-sync-lab.repository.ts'),'utf8');
const migration=readFileSync(path.join(root,'backend/src/db/migrations/0082_health_sync_diagnostic_console.sql'),'utf8');
const activityMigration=readFileSync(path.join(root,'backend/src/db/migrations/0083_health_sync_activity_diagnostics.sql'),'utf8');
const server=readFileSync(path.join(root,'backend/src/server.ts'),'utf8');
const mobileBridge=readFileSync(path.join(root,'src/services/healthSyncDiagnosticBridge.ts'),'utf8');
const coordinator=readFileSync(path.join(root,'src/services/canonicalHealthSyncCoordinator.ts'),'utf8');
const healthKitBridge=readFileSync(path.join(root,'modules/fiteatsy-healthkit/ios/FiteatsyHealthKitModule.swift'),'utf8');

test('Health Sync Lab exposes the governed internal surface and no direct native provider API',()=>{
  for(const route of ['/devices','/status','/metrics','/metrics/:metricId','/queue','/requests','/requests/:id']) assert.match(routes,new RegExp(route.replace(/[/:]/g,'\\$&')));
  assert.match(server,/\/health-sync-lab/);
  assert.match(server,/\/internal\/health-sync/);
  const page=renderHealthSyncLabPage();
  assert.match(page,/Native provider → local canonical store → backend/);
  assert.doesNotMatch(page,/HKHealthStore|HealthConnectClient|react-native-health/);
});

test('Health Sync Lab requires authentication and an internal role for inspection and requests',()=>{
  assert.match(routes,/healthSyncLabRouter\.get\('\/devices',requireAuthenticatedAccount,requireInternalRole/);
  assert.match(routes,/requireAuthenticatedAccount,requireInternalRole/);
  assert.match(routes,/admin','super_admin','platform_owner/);
  assert.match(routes,/INTERNAL_HEALTH_SYNC_ROLE_REQUIRED/);
  assert.doesNotMatch(routes,/query\.token|req\.query\.token/);
  assert.match(repository,/health_sync_diagnostic_audit_events/);
  for (const event of ['VIEW_DIAGNOSTICS','INSPECT_RECORDS','REQUEST_DEVICE_SYNC','ADMIN_QUEUE_ACTION']) assert.match(migration,new RegExp(event));
});

test('local diagnostic mode removes manual credentials and auto-discovers governed device context',()=>{
  const page=renderHealthSyncLabPage();
  assert.doesNotMatch(page,/Internal bearer token|type="password"|healthLabToken|Account ID input/);
  assert.match(page,/\/internal\/health-sync\/local\/contexts/);
  assert.match(page,/\/internal\/health-sync\/local\/snapshot/);
  assert.match(page,/Local diagnostic context resolved automatically/);
  assert.match(page,/Logged in as/);
  assert.match(repository,/listLocalDiagnosticContexts/);
  assert.match(repository,/resolveLocalDiagnosticContext/);
});

test('local diagnostic bypass requires explicit flag, development runtime, loopback host, and loopback socket',()=>{
  const originalFlag=process.env.FITEATSY_LOCAL_HEALTH_LAB;
  const originalNodeEnv=process.env.NODE_ENV;
  process.env.NODE_ENV='development';
  process.env.FITEATSY_LOCAL_HEALTH_LAB='true';
  const request=(hostname:string,localAddress:string)=>({hostname,socket:{localAddress}}) as never;
  try{
    assert.equal(isLocalHealthLabRequest(request('127.0.0.1','127.0.0.1')),true);
    assert.equal(isLocalHealthLabRequest(request('localhost','::1')),true);
    assert.equal(isLocalHealthLabRequest(request('health.example.com','127.0.0.1')),false);
    assert.equal(isLocalHealthLabRequest(request('127.0.0.1','192.168.1.12')),false);
    process.env.FITEATSY_LOCAL_HEALTH_LAB='false';
    assert.equal(isLocalHealthLabRequest(request('127.0.0.1','127.0.0.1')),false);
    process.env.FITEATSY_LOCAL_HEALTH_LAB='true';
    process.env.NODE_ENV='production';
    assert.equal(isLocalHealthLabRequest(request('127.0.0.1','127.0.0.1')),false);
  } finally {
    if(originalFlag===undefined) delete process.env.FITEATSY_LOCAL_HEALTH_LAB; else process.env.FITEATSY_LOCAL_HEALTH_LAB=originalFlag;
    if(originalNodeEnv===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=originalNodeEnv;
  }
  assert.match(routes,/DIAGNOSTIC_LOCAL_ONLY/);
  assert.match(routes,/requireLocalHealthLab/);
});

test('mobile companion APIs are account isolated and do not accept a caller-supplied account',()=>{
  assert.match(routes,/accountId:account\.accountId,clientId:account\.client\.id/);
  assert.match(repository,/where id=\$2 and connection_id=\$3 and client_id=\$4 and account_id=\$5/);
  assert.match(repository,/where id=\$1 and client_id=\$2 and account_id=\$3/);
});

test('metric lifecycle covers every canonical UI metric with explicit terminal and upload states',()=>{
  assert.deepEqual(HEALTH_SYNC_METRICS,[
    'steps','distance','sleep','heart_rate','resting_heart_rate','hrv_sdnn','hrv_rmssd',
    'active_energy','exercise','workout','weight','hydration','spo2','respiratory_rate'
  ]);
  assert.match(migration,/PERMISSION_DENIED/);
  assert.match(migration,/UNSUPPORTED/);
  assert.match(migration,/TIMED_OUT/);
  assert.match(migration,/display_ready_at timestamptz/);
});

test('display readiness is stored independently from backend upload completion',()=>{
  assert.match(migration,/local_persist_at timestamptz/);
  assert.match(migration,/backend_persist_at timestamptz/);
  assert.match(migration,/display_ready_at timestamptz/);
  assert.match(repository,/display_ready_at=excluded\.display_ready_at/);
  assert.doesNotMatch(migration,/display_ready_at.*references.*upload/i);
});

test('record inspection returns provenance metadata but never health values',()=>{
  const query=repository.slice(repository.indexOf('export async function getMetricRecords'),repository.indexOf('export async function listQueue'));
  assert.match(query,/source_provider/);
  assert.match(query,/source_record_id/);
  assert.match(query,/measured_at/);
  assert.doesNotMatch(query,/ho\.value/);
});

test('governed sync requests expire and preserve an append-only safe event trail',()=>{
  assert.match(migration,/expires_at timestamptz not null/);
  assert.match(repository,/status='TIMED_OUT'/);
  assert.match(migration,/health_sync_request_events/);
  assert.match(routes,/safeMetadata:z\.record/);
  assert.doesNotMatch(routes,/healthValue|rawPayload|token:/);
});

test('physical iPhone reporting owns HealthKit activity summaries and governed request polling',()=>{
  assert.match(healthKitBridge,/HKActivitySummaryQuery/);
  assert.match(healthKitBridge,/activeEnergyBurned/);
  assert.match(healthKitBridge,/appleExerciseTime/);
  assert.match(healthKitBridge,/appleStandHours/);
  assert.match(mobileBridge,/\/internal\/health-sync\/mobile\/heartbeat/);
  assert.match(mobileBridge,/\/internal\/health-sync\/mobile\/requests/);
  assert.match(activityMigration,/activity_summary jsonb/);
  assert.match(activityMigration,/workout_summary jsonb/);
  const page=renderHealthSyncLabPage();
  assert.match(page,/Apple Fitness \/ Activity/);
  assert.match(page,/NOT_AVAILABLE_VIA_HEALTHKIT/);
});

test('diagnostic reporting is metadata scoped and cannot block the canonical sync pipeline',()=>{
  assert.doesNotMatch(mobileBridge,/observation\.value|healthValue|accessToken|sessionToken/);
  assert.match(coordinator,/reportHealthSyncDiagnosticSnapshot[\s\S]*\.catch\(\(\)=>undefined\)/);
  assert.match(mobileBridge,/pendingCount/);
  assert.match(mobileBridge,/nativeRecordCount/);
  assert.match(mobileBridge,/localRecordCount/);
});
