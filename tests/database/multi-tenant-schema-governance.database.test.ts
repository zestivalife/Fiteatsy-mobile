import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
const pg = backendRequire('pg') as typeof import('../../backend/node_modules/pg');

const authoritativeTables = [
  'fiteatsy_clients','consultant_client_assignments','care_cases','consultant_client_operations',
  'consultant_client_operation_audit','daily_checkins','nudges','health_reports','health_report_files',
  'health_report_upload_sessions','document_intelligence_audit','biomarkers','biomarker_observations',
  'health_observations','diet_plans','diet_plan_versions','diet_plan_review_events','notifications',
  'profile_photo_assets','consultant_access_consents','consultant_access_consent_events',
] as const;

test('fresh governed migration history creates all 21 authoritative tenant tables', async () => {
  const sourceUrl = process.env.DATABASE_URL;
  assert.ok(sourceUrl, 'DATABASE_URL is required for the migration-only database contract');

  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const databaseName = `fiteatsy_schema_governance_test_${randomUUID().replaceAll('-', '')}`;
  const migratedUrl = new URL(sourceUrl);
  migratedUrl.pathname = `/${databaseName}`;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });

  await admin.connect();
  try {
    await admin.query(`create database ${databaseName}`);
    await execFileAsync(
      process.execPath,
      ['--import', 'tsx', 'src/db/migrator.ts'],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: migratedUrl.toString(), NODE_ENV: 'test' },
        timeout: 120_000,
      },
    );

    const migrated = new pg.Client({ connectionString: migratedUrl.toString() });
    await migrated.connect();
    try {
      const result = await migrated.query<{ table_name: string; tenant_column: string | null }>(
        `select expected.table_name,
                columns.column_name as tenant_column
           from unnest($1::text[]) with ordinality expected(table_name,position)
           left join information_schema.tables tables
             on tables.table_schema='public' and tables.table_name=expected.table_name
           left join information_schema.columns columns
             on columns.table_schema='public' and columns.table_name=expected.table_name
            and columns.column_name='tenant_id'
          order by expected.position`,
        [authoritativeTables],
      );
      assert.equal(result.rowCount, 21);
      assert.deepEqual(result.rows.map((row) => row.table_name), [...authoritativeTables]);
      assert.equal(result.rows.filter((row) => row.tenant_column === 'tenant_id').length, 21);

      const verification = await migrated.query<{ count: number }>(
        'select count(*)::int as count from tenant_backfill_verification',
      );
      assert.equal(verification.rows[0]?.count, 21);
    } finally {
      await migrated.end();
    }
  } finally {
    await admin.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()',
      [databaseName],
    );
    await admin.query(`drop database if exists ${databaseName}`);
    await admin.end();
  }
});
