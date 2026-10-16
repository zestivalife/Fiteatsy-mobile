import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration=readFileSync(new URL('../../backend/src/db/migrations/0104_external_health_records.sql',import.meta.url),'utf8');
const health=readFileSync(new URL('../../backend/src/modules/external-clients/external-health-records.repository.ts',import.meta.url),'utf8');
const transient=readFileSync(new URL('../../backend/src/modules/external-clients/external-transient-report.repository.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.routes.ts',import.meta.url),'utf8');

test('migration is additive and External-only',()=>{
  assert.match(migration,/create table if not exists external_health_records/);
  assert.match(migration,/create table if not exists external_profile_evidence_reviews/);
  assert.match(migration,/create index if not exists external_health_records_scope_idx/);
  assert.match(migration,/create index if not exists external_profile_evidence_review_scope_idx/);
  assert.doesNotMatch(migration,/alter table|external_diet|common_food|biomarker_observations|zestiva_internal/i);
});

test('confirmed analysis atomically creates one linked health record without source bytes',()=>{
  assert.match(transient,/createExternalHealthRecordForAnalysis\(db/);
  assert.match(migration,/analysis_id uuid unique references external_transient_report_analyses/);
  assert.match(transient,/healthRecordId:healthRecord\.id/);
  assert.doesNotMatch(migration,/bytea|source_file|original_file/i);
});

test('quarantine is scoped by tenant client and immutable analysis linkage',()=>{
  assert.match(health,/tenant_id=\$2 and client_id=\$3 and analysis_id=\$4/);
  assert.match(health,/quarantined_at=now\(\),quarantine_reason=\$1/);
  assert.doesNotMatch(health,/delete from external_confirmed_biomarkers/i);
  assert.match(health,/audit_history=audit_history\|\|jsonb_build_array/);
  assert.match(health,/quarantined_observation_count/);
  assert.doesNotMatch(health,/external_client_audit_events/);
});

test('removal audit history is append-only and retains governed before/after evidence',()=>{
  assert.match(migration,/audit_history jsonb not null default '\[\]'::jsonb/);
  for(const field of ['actor_id','actor_type','timestamp','reason','health_record_id','analysis_id','extraction_run_id','quarantined_observation_count','previous_record_status','resulting_record_status'])assert.match(health,new RegExp(field));
  assert.doesNotMatch(health,/audit_history\s*=\s*jsonb_build_array/);
});

test('active projections preserve legitimate history and exclude only governed quarantine',()=>{
  assert.match(transient,/b\.quarantined_at is null and \(r\.id is null or r\.status='ACTIVE'\)/);
  assert.match(transient,/healthRecordId:row\.health_record_id/);
  assert.match(routes,/\/:id\/health-records\/trends/);
});

test('comparison blocks incompatible units and uses neutral factual language',()=>{
  assert.match(health,/previousUnit\.toLowerCase\(\)===latestUnit\.toLowerCase\(\)/);
  assert.match(health,/NOT_COMPARABLE/);
  assert.match(health,/Cannot compare directly because the units differ/);
  for(const label of ['INCREASED','DECREASED','UNCHANGED'])assert.match(health,new RegExp(label));
});

test('every endpoint resolves tenant-scoped External client authority',()=>{
  assert.match(health,/tenantType==='ZESTIVA_INTERNAL'/);
  assert.match(health,/id=\$1 and tenant_id=\$2 and deleted_at is null/);
  assert.match(routes,/\/:id\/health-records\/compare/);
  assert.match(routes,/\/:id\/health-records\/:recordId\/remove/);
});
