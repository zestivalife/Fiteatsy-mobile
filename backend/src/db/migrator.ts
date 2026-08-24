import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PoolClient } from 'pg';
import { closePool, getPool } from './pool.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const MIGRATION_LOCK_NAMESPACE = 20260730;
const MIGRATION_LOCK_KEY = 11;
const LEGACY_PROFESSIONAL_SNAPSHOT_FILE = '0036_professional_identity_snapshot_backfill.sql';
const LEGACY_PROFESSIONAL_SNAPSHOT_USER_IDS = [
  '0e65d616-b96e-4fc5-8d36-a2f33cd81c89',
  '3bc788d8-795d-4ecb-bded-e120b33ed554',
  '3b641ceb-8eab-4e70-bffe-efd746347cee',
  '8fa26de5-21fc-43e1-ba8b-86c898f6c91b',
  '14848d83-8a39-4674-90f9-13909e0bd728',
  '78fc83c9-2d55-4815-8918-baf00fff7abb'
] as const;

let migrationPromise: Promise<void> | null = null;

const ensureSchemaMigrationsTable = async (client: PoolClient) => {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
};

const readMigrationFiles = async () => {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
};

const acquireMigrationLock = async (client: PoolClient) => {
  await client.query('select pg_advisory_lock($1, $2)', [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_KEY]);
};

const releaseMigrationLock = async (client: PoolClient) => {
  await client.query('select pg_advisory_unlock($1, $2)', [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_KEY]);
};

const rollbackQuietly = async (client: PoolClient) => {
  try {
    await client.query('rollback');
  } catch {}
};

const shouldSkipLegacySnapshotOnFreshReplay = async (
  client: PoolClient,
  file: string,
  startedWithEmptyLedger: boolean
) => {
  if (!startedWithEmptyLedger || file !== LEGACY_PROFESSIONAL_SNAPSHOT_FILE) return false;

  const result = await client.query<{ matching_count: number }>(
    `select count(*)::int as matching_count
       from users
      where id = any($1::text[])`,
    [LEGACY_PROFESSIONAL_SNAPSHOT_USER_IDS]
  );
  return Number(result.rows[0]?.matching_count ?? 0) === 0;
};

const applyMigrations = async () => {
  const pool = getPool();
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    await acquireMigrationLock(client);
    lockAcquired = true;
    await ensureSchemaMigrationsTable(client);
    const applied = await client.query<{ version: string }>('select version from schema_migrations');
    const appliedVersions = new Set(applied.rows.map((row) => row.version));
    const startedWithEmptyLedger = appliedVersions.size === 0;

    const files = await readMigrationFiles();
    for (const file of files) {
      if (appliedVersions.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('begin');
      try {
        await ensureSchemaMigrationsTable(client);
        const skipLegacySnapshot = await shouldSkipLegacySnapshotOnFreshReplay(
          client,
          file,
          startedWithEmptyLedger
        );
        if (!skipLegacySnapshot) await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [file]);
        await client.query('commit');
        appliedVersions.add(file);
      } catch (error) {
        await rollbackQuietly(client);
        throw error;
      }
    }
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await releaseMigrationLock(client);
      } catch {}
    }
    client.release();
  }
};

export const migrateDatabase = async () => {
  migrationPromise ??= applyMigrations().catch((error) => {
    migrationPromise = null;
    throw error;
  });
  return migrationPromise;
};

export const resetMigrationStateForTests = () => {
  migrationPromise = null;
};

const isDirectRun =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void migrateDatabase()
    .then(async () => {
      await closePool();
    })
    .catch(async (error) => {
      console.error(
        error instanceof Error
          ? `Database migration failed: ${error.message}`
          : 'Database migration failed.'
      );
      await closePool();
      process.exitCode = 1;
    });
}
