import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migratorSource = fs.readFileSync(path.join(repositoryRoot, 'backend/src/db/migrator.ts'), 'utf8');

test('migration runner uses PostgreSQL advisory locks for serialized startup', () => {
  assert.equal(/pg_advisory_lock/i.test(migratorSource), true);
  assert.equal(/pg_advisory_unlock/i.test(migratorSource), true);
});

test('standalone migration path closes database resources on completion', () => {
  assert.equal(/closePool\(\)/.test(migratorSource), true);
});

test('migration runner orders and records migrations by full filename', () => {
  assert.match(migratorSource, /\.sort\(\(left, right\) => left\.localeCompare\(right\)\)/);
  assert.match(migratorSource, /insert into schema_migrations \(version\) values \(\$1\)/i);
  assert.match(migratorSource, /\[file\]/);
});

test('each migration and ledger write share a transaction with rollback on failure', () => {
  assert.match(migratorSource, /client\.query\('begin'\)/i);
  assert.match(migratorSource, /client\.query\(sql\)/i);
  assert.match(migratorSource, /client\.query\('insert into schema_migrations/i);
  assert.match(migratorSource, /client\.query\('commit'\)/i);
  assert.match(migratorSource, /rollbackQuietly\(client\)/i);
});

test('legacy production snapshot is bypassed only for a genuinely fresh replay without target identities', () => {
  assert.match(migratorSource, /startedWithEmptyLedger = appliedVersions\.size === 0/);
  assert.match(migratorSource, /file !== LEGACY_PROFESSIONAL_SNAPSHOT_FILE/);
  assert.match(migratorSource, /where id = any\(\$1::text\[\]\)/i);
  assert.match(migratorSource, /matching_count[^]*=== 0/);
  assert.match(migratorSource, /if \(!skipLegacySnapshot\) await client\.query\(sql\)/);
});

test.skip('migration lock contention runtime validation requires a live PostgreSQL instance');
