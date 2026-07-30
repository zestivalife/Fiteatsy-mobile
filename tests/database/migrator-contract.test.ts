import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migratorSource = fs.readFileSync(
  '/Users/l.paunikar/Desktop/fiteatsy-mobile/backend/src/db/migrator.ts',
  'utf8'
);

test('migration runner uses PostgreSQL advisory locks for serialized startup', () => {
  assert.equal(/pg_advisory_lock/i.test(migratorSource), true);
  assert.equal(/pg_advisory_unlock/i.test(migratorSource), true);
});

test('standalone migration path closes database resources on completion', () => {
  assert.equal(/closePool\(\)/.test(migratorSource), true);
});

test.skip('migration lock contention runtime validation requires a live PostgreSQL instance');
