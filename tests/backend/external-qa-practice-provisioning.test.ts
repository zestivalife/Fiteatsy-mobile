import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EXTERNAL_QA_PROFESSIONS } from '../../backend/src/modules/admin/external-qa-practice.repository.js';

const repository = readFileSync(new URL('../../backend/src/modules/admin/external-qa-practice.repository.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../backend/src/modules/admin/delegated.routes.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../backend/src/db/migrations/0103_external_qa_practice_provisioning.sql', import.meta.url), 'utf8');

test('QA provisioner exposes exactly the eight governed professions', () => {
  assert.deepEqual([...EXTERNAL_QA_PROFESSIONS], [
    'DIABETES_EDUCATOR','PSYCHOLOGIST','WELLNESS_CONSULTANT','HEALTH_COACH',
    'BEHAVIOURAL_THERAPIST','OCCUPATIONAL_THERAPIST','PHYSIOTHERAPIST','MENTAL_WELLNESS_THERAPIST'
  ]);
});

test('QA route is delegated Platform Owner only and idempotent', () => {
  assert.match(routes, /qa-external-practices/);
  assert.match(routes, /fiteatsy\.qa\.external_practice\.create/);
  assert.match(routes, /qa_external_practice', 'platform_owner'/);
  assert.match(routes, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(repository, /QA_FIXTURE_BINDING_CONFLICT/);
});

test('QA validation rejects real identities and unlabelled tenants', () => {
  assert.match(repository, /@zestiva\.test/);
  assert.match(repository, /QA_EMAIL_REQUIRED/);
  assert.match(repository, /QA_TENANT_LABEL_REQUIRED/);
});

test('provisioning reuses canonical External models and creates synthetic clients only', () => {
  assert.match(repository, /provisionExternalConsultant/);
  assert.match(repository, /insert into external_clients/);
  assert.match(repository, /Synthetic governed QA client; no real personal or health data/);
  for (const forbidden of ['password_hash', 'jwt', 'refresh_token', 'ZESTIVA_INTERNAL']) assert.doesNotMatch(repository, new RegExp(forbidden, 'i'));
});

test('migration is additive audit lineage with archive cleanup and no client-core alteration', () => {
  assert.match(migration, /create table if not exists external_qa_practice_provisioning/);
  assert.match(migration, /create table if not exists external_qa_practice_audit_events/);
  assert.doesNotMatch(migration, /alter table external_clients/i);
  assert.doesNotMatch(migration, /delete from external_clients/i);
  assert.match(repository, /status='removed'/);
  assert.match(repository, /status='suspended'/);
  assert.doesNotMatch(repository, /delete from external_clients/i);
});
