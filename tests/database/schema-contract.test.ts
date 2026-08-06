import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schemaSql = fs.readFileSync(
  '/Users/l.paunikar/Desktop/fiteatsy-mobile/backend/src/db/schema.sql',
  'utf8'
);

const hasPattern = (pattern: RegExp) => pattern.test(schemaSql);

test('database schema defines required platform tables for CRUD coverage', () => {
  for (const tableName of [
    'fiteatsy_clients',
    'health_profiles',
    'recovery_programs',
    'care_cases',
    'nutrition_profiles',
    'timeline_events',
    'health_events',
    'health_tickets',
    'health_reports',
    'health_report_upload_sessions',
    'health_observations',
    'biomarkers',
    'biomarker_observations',
    'processing_jobs',
    'health_scores',
    'diet_plans',
    'diet_plan_versions',
    'clinical_memory',
    'communications',
    'notifications',
    'attachments',
  ]) {
    assert.equal(hasPattern(new RegExp(`create table if not exists ${tableName} \\(`, 'i')), true);
  }
});

test('database schema includes foreign keys for healthcare ownership integrity', () => {
  assert.equal(hasPattern(/account_user_id text not null unique references users\(id\) on delete cascade/i), true);
  assert.equal(hasPattern(/fiteatsy_client_id text not null unique/i), true);
  assert.equal(hasPattern(/create unique index if not exists fiteatsy_clients_internal_owner_unique/i), true);
  assert.equal(hasPattern(/foreign key \(client_id, user_id\) references fiteatsy_clients\(id, account_user_id\) on delete restrict/i), true);
  assert.equal(hasPattern(/health_profile_id uuid not null references health_profiles/i), true);
  assert.equal(hasPattern(/recovery_program_id uuid not null references recovery_programs/i), true);
  assert.equal(hasPattern(/care_case_id uuid not null references care_cases/i), true);
  assert.equal(hasPattern(/source_report_id text references health_reports/i), true);
  assert.equal(hasPattern(/report_id text references health_reports/i), true);
  assert.equal(hasPattern(/create unique index if not exists health_observations_client_sync_key_unique/i), true);
  assert.equal(hasPattern(/foreign key \(client_id, user_id\) references fiteatsy_clients/i), true);
});

test('database schema includes soft delete and versioning fields', () => {
  assert.equal(hasPattern(/status text not null default 'active'/i), true);
  assert.equal(hasPattern(/version integer not null default 1/i), true);
  assert.equal(hasPattern(/deleted_at timestamptz/i), true);
});

test('database schema defines traceable health intelligence scores', () => {
  assert.equal(hasPattern(/create table if not exists health_scores/i), true);
  assert.equal(hasPattern(/score_type text not null/i), true);
  assert.equal(hasPattern(/score_value integer/i), true);
  assert.equal(hasPattern(/score_status text not null default 'insufficient_data'/i), true);
  assert.equal(hasPattern(/input_summary jsonb not null default/i), true);
  assert.equal(hasPattern(/calculation_version text not null/i), true);
  assert.equal(hasPattern(/check \(score_type in \('nutrition', 'clinical', 'activity', 'sleep', 'calm', 'recovery', 'overall'\)\)/i), true);
});

test('database schema preserves report-to-biomarker extraction lineage', () => {
  assert.equal(hasPattern(/create table if not exists biomarker_observations/i), true);
  assert.equal(hasPattern(/client_id text not null/i), true);
  assert.equal(hasPattern(/source_report_id text references health_reports\(id\) on delete set null/i), true);
  assert.equal(hasPattern(/original_parameter_name text/i), true);
  assert.equal(hasPattern(/validation_status text not null default 'pending'/i), true);
  assert.equal(hasPattern(/reference_range text/i), true);
});

test('database schema enforces medical report intelligence governance gates', () => {
  assert.equal(hasPattern(/document_hash text/i), true);
  assert.equal(hasPattern(/'EXTRACTED'/i), true);
  assert.equal(hasPattern(/'VALIDATED'/i), true);
  assert.equal(hasPattern(/'PRIORITIZED'/i), true);
  assert.equal(hasPattern(/'SCORED'/i), true);
  assert.equal(hasPattern(/'PUBLISHED'/i), true);
  assert.equal(hasPattern(/health_reports_client_document_hash_active_unique/i), true);
  assert.equal(hasPattern(/on health_reports \(client_id, document_hash\)/i), true);
});

test.skip('database CRUD runtime validation is pending a live PostgreSQL test database');
test.skip('database rollback semantics are pending a live PostgreSQL test database');
test.skip('database transaction semantics are pending a live PostgreSQL test database');
