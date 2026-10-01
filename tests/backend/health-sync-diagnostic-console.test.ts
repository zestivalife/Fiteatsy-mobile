import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { HEALTH_SYNC_METRICS } from '../../backend/src/modules/health-sync-lab/health-sync-lab.repository.ts';
import { renderHealthSyncLabPage } from '../../backend/src/modules/health-sync-lab/health-sync-lab.page.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const routes=readFileSync(path.join(root,'backend/src/modules/health-sync-lab/health-sync-lab.routes.ts'),'utf8');
const repository=readFileSync(path.join(root,'backend/src/modules/health-sync-lab/health-sync-lab.repository.ts'),'utf8');
const migration=readFileSync(path.join(root,'backend/src/db/migrations/0082_health_sync_diagnostic_console.sql'),'utf8');
const server=readFileSync(path.join(root,'backend/src/server.ts'),'utf8');

test('Health Sync Lab exposes the governed internal surface and no direct native provider API',()=>{
  for(const route of ['/devices','/status','/metrics','/metrics/:metricId','/queue','/requests','/requests/:id']) assert.match(routes,new RegExp(route.replace(/[/:]/g,'\\$&')));
  assert.match(server,/\/health-sync-lab/);
  assert.match(server,/\/internal\/health-sync/);
  const page=renderHealthSyncLabPage();
  assert.match(page,/Native provider → local canonical store → backend/);
  assert.doesNotMatch(page,/HKHealthStore|HealthConnectClient|react-native-health/);
});

test('Health Sync Lab requires authentication and an internal role for inspection and requests',()=>{
  assert.match(routes,/shell contains no account data/);
  assert.match(routes,/healthSyncLabRouter\.get\('\/devices',requireAuthenticatedAccount,requireInternalRole/);
  assert.match(routes,/requireAuthenticatedAccount,requireInternalRole/);
  assert.match(routes,/admin','super_admin','platform_owner/);
  assert.match(routes,/INTERNAL_HEALTH_SYNC_ROLE_REQUIRED/);
  assert.doesNotMatch(routes,/query\.token|req\.query\.token/);
  assert.match(repository,/health_sync_diagnostic_audit_events/);
  for (const event of ['VIEW_DIAGNOSTICS','INSPECT_RECORDS','REQUEST_DEVICE_SYNC','ADMIN_QUEUE_ACTION']) assert.match(migration,new RegExp(event));
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
