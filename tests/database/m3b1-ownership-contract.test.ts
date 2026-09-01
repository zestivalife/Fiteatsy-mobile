import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const schemaSql = fs.readFileSync(
  fileURLToPath(new URL('../../backend/src/db/schema.sql', import.meta.url)),
  'utf8'
);

const migrationSql = fs.readFileSync(
  fileURLToPath(new URL('../../backend/src/db/migrations/0003_m3b1_ownership_schema_foundation.sql', import.meta.url)),
  'utf8'
);

const phase1bSql = fs.readFileSync(
  fileURLToPath(new URL('../../backend/src/db/migrations/0001_phase1b_persistence_foundation.sql', import.meta.url)),
  'utf8'
);

const m3aSql = fs.readFileSync(
  fileURLToPath(new URL('../../backend/src/db/migrations/0002_m3a_client_identity_foundation.sql', import.meta.url)),
  'utf8'
);

const getTableBlock = (sql: string, tableName: string) => {
  const match = sql.match(
    new RegExp(`create table if not exists ${tableName} \\(([\\s\\S]*?)\\n\\);`, 'i')
  );
  return match?.[1] ?? '';
};

const extractCreatedTables = (sql: string) =>
  Array.from(sql.matchAll(/create table if not exists ([a-z_]+)/gi)).map((match) => match[1]);

const extractReferencedTables = (sql: string) => {
  const refs = new Set<string>();
  for (const pattern of [
    /alter table\s+([a-z_]+)/gi,
    /update\s+([a-z_]+)/gi,
    /from\s+([a-z_]+)/gi,
    /join\s+([a-z_]+)/gi,
    /on\s+([a-z_]+)\s*\(/gi
  ]) {
    for (const match of sql.matchAll(pattern)) {
      refs.add(match[1]);
    }
  }
  return refs;
};

test('M3B.1 schema adds canonical client ownership only to approved direct-root tables', () => {
  for (const tableName of [
    'health_profiles',
    'care_cases',
    'nutrition_profiles',
    'notifications'
  ]) {
    const block = getTableBlock(schemaSql, tableName);
    assert.match(block, /client_id text/i);
    assert.match(
      block,
      /foreign key \(client_id, user_id\) references fiteatsy_clients\(id, account_user_id\) on delete restrict/i
    );
  }
});

test('M3B.1 leaves parent-derived tables without redundant client ownership columns', () => {
  for (const tableName of [
    'recovery_programs',
    'timeline_events',
    'health_events',
    'health_tickets',
    'biomarkers',
    'diet_plans',
    'diet_plan_versions',
    'clinical_memory',
    'communications',
    'daily_checkins',
    'ai_decision_logs',
    'nudges',
    'lab_reports',
    'attachments'
  ]) {
    assert.doesNotMatch(migrationSql, new RegExp(`\\b${tableName}\\b`, 'i'));
  }
});

test('M3B.1 migration backfills direct-root client ownership through account_user_id mapping', () => {
  assert.match(
    migrationSql,
    /update health_profiles hp[\s\S]*?from fiteatsy_clients c[\s\S]*?hp\.user_id = c\.account_user_id/i
  );
  assert.match(
    migrationSql,
    /update care_cases cc[\s\S]*?from fiteatsy_clients c[\s\S]*?cc\.user_id = c\.account_user_id/i
  );
  assert.match(
    migrationSql,
    /update nutrition_profiles np[\s\S]*?from fiteatsy_clients c[\s\S]*?np\.user_id = c\.account_user_id/i
  );
  assert.match(
    migrationSql,
    /update notifications n[\s\S]*?from fiteatsy_clients c[\s\S]*?n\.user_id = c\.account_user_id/i
  );
});

test('M3B.1 migration uses retention-safe referential actions and integrity checks', () => {
  assert.match(
    migrationSql,
    /create unique index if not exists fiteatsy_clients_internal_owner_unique[\s\S]*?on fiteatsy_clients \(id, account_user_id\)/i
  );
  assert.equal(
    (migrationSql.match(/references fiteatsy_clients \(id, account_user_id\)\s+on delete restrict/gi) ?? [])
      .length >= 4,
    true
  );
  assert.match(migrationSql, /raise exception 'M3B\.1 backfill failed: health_profiles contains rows without resolvable client ownership'/i);
  assert.match(migrationSql, /raise exception 'M3B\.1 backfill failed: notifications contains rows without resolvable client ownership'/i);
});

test('M3B.1 migration references only tables that exist in the 0001 + 0002 baseline', () => {
  const baselineTables = new Set([
    ...extractCreatedTables(phase1bSql),
    ...extractCreatedTables(m3aSql)
  ]);
  const allowedNonBaselineRefs = new Set(['pg_constraint']);

  const unsupportedRefs = Array.from(extractReferencedTables(migrationSql)).filter(
    (tableName) =>
      tableName.length > 1 &&
      !baselineTables.has(tableName) &&
      !allowedNonBaselineRefs.has(tableName)
  );

  assert.deepEqual(unsupportedRefs, []);
});
