import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type AppliedMigrationManifest = {
  migrationIdentity: 'full-filename';
  historicalLedgerOnly: Record<string, string>;
  allowedDuplicatePrefixes: Record<string, string[]>;
  appliedSha256: Record<string, string>;
};

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDirectory = path.join(repositoryRoot, 'backend/src/db/migrations');
const manifest = JSON.parse(
  fs.readFileSync(path.join(migrationsDirectory, 'applied-migrations.sha256.json'), 'utf8')
) as AppliedMigrationManifest;

const migrationFiles = fs
  .readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

const sha256 = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationsDirectory, file))).digest('hex');

test('migration filenames are canonical and deterministic', () => {
  for (const file of migrationFiles) {
    assert.match(file, /^\d{4}_[a-z0-9_]+\.sql$/);
  }
  assert.deepEqual(migrationFiles, [...migrationFiles].sort((left, right) => left.localeCompare(right)));
});

test('new duplicate migration prefixes are rejected', () => {
  const filesByPrefix = new Map<string, string[]>();
  for (const file of migrationFiles) {
    const prefix = file.slice(0, 4);
    filesByPrefix.set(prefix, [...(filesByPrefix.get(prefix) ?? []), file]);
  }

  const actualDuplicates = Object.fromEntries(
    [...filesByPrefix.entries()].filter(([, files]) => files.length > 1)
  );
  assert.deepEqual(actualDuplicates, manifest.allowedDuplicatePrefixes);
});

test('production-applied migration files remain present and immutable', () => {
  assert.equal(manifest.migrationIdentity, 'full-filename');
  for (const [file, expectedHash] of Object.entries(manifest.appliedSha256)) {
    assert.equal(migrationFiles.includes(file), true, `Applied migration was removed: ${file}`);
    assert.equal(sha256(file), expectedHash, `Applied migration was modified: ${file}`);
  }
});

test('historical ledger-only aliases are explicitly documented', () => {
  assert.deepEqual(manifest.historicalLedgerOnly, {
    '0018_health_calculations.sql': 'Renamed historically before immutability governance; superseded byte-for-byte by 0019_health_calculations.sql.'
  });
  assert.equal(migrationFiles.includes('0018_health_calculations.sql'), false);
  assert.equal(sha256('0019_health_calculations.sql'), manifest.appliedSha256['0019_health_calculations.sql']);
});
