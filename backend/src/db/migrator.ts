import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PoolClient } from 'pg';
import { closePool, getPool } from './pool.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const MIGRATION_LOCK_NAMESPACE = 20260730;
const MIGRATION_LOCK_KEY = 11;

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

    const files = await readMigrationFiles();
    for (const file of files) {
      if (appliedVersions.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('begin');
      try {
        await ensureSchemaMigrationsTable(client);
        await client.query(sql);
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
