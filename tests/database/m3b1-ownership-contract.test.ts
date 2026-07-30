import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schemaSql = fs.readFileSync(
  '/Users/l.paunikar/Desktop/fiteatsy-mobile/backend/src/db/schema.sql',
  'utf8'
);

const migrationSql = fs.readFileSync(
  '/Users/l.paunikar/Desktop/fiteatsy-mobile/backend/src/db/migrations/0003_m3b1_ownership_schema_foundation.sql',
  'utf8'
);

const getTableBlock = (sql: string, tableName: string) => {
  const match = sql.match(
    new RegExp(`create table if not exists ${tableName} \\(([\\s\\S]*?)\\n\\);`, 'i')
  );
  return match?.[1] ?? '';
};

test('M3B.1 schema adds canonical client ownership only to approved direct-root tables', () => {
  for (const tableName of [
    'daily_checkins',
    'ai_decision_logs',
    'nudges',
    'health_profiles',
    'care_cases',
    'nutrition_profiles',
    'lab_reports',
    'notifications',
    'attachments'
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
    'communications'
  ]) {
    const block = getTableBlock(schemaSql, tableName);
    assert.doesNotMatch(block, /client_id text/i);
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
  assert.match(
    migrationSql,
    /update lab_reports lr[\s\S]*?from fiteatsy_clients c[\s\S]*?lr\.user_id = c\.account_user_id/i
  );
  assert.match(
    migrationSql,
    /update attachments a[\s\S]*?from fiteatsy_clients c[\s\S]*?a\.user_id = c\.account_user_id/i
  );
  assert.match(
    migrationSql,
    /update daily_checkins dc[\s\S]*?from fiteatsy_clients c[\s\S]*?dc\.user_id = c\.account_user_id/i
  );
  assert.match(
    migrationSql,
    /update ai_decision_logs adl[\s\S]*?from fiteatsy_clients c[\s\S]*?adl\.user_id = c\.account_user_id/i
  );
  assert.match(
    migrationSql,
    /update nudges n[\s\S]*?from fiteatsy_clients c[\s\S]*?n\.user_id = c\.account_user_id/i
  );
});

test('M3B.1 migration uses retention-safe referential actions and integrity checks', () => {
  assert.match(
    migrationSql,
    /create unique index if not exists fiteatsy_clients_internal_owner_unique[\s\S]*?on fiteatsy_clients \(id, account_user_id\)/i
  );
  assert.equal(
    (migrationSql.match(/references fiteatsy_clients \(id, account_user_id\)\s+on delete restrict/gi) ?? [])
      .length >= 9,
    true
  );
  assert.match(migrationSql, /raise exception 'M3B\.1 backfill failed: health_profiles contains rows without resolvable client ownership'/i);
  assert.match(migrationSql, /raise exception 'M3B\.1 backfill failed: attachments contains rows without resolvable client ownership'/i);
});
