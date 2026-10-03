import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DatabaseMigrationRequiredError,
  initializeBackend
} from '../../backend/src/server.js';
import {
  evaluateDatabaseSchemaStatus,
  type DatabaseSchemaStatus
} from '../../backend/src/db/migrator.js';

const currentStatus: DatabaseSchemaStatus = {
  status: 'CURRENT',
  currentVersion: '0084_multi_tenant_contract.sql',
  requiredVersion: '0084_multi_tenant_contract.sql',
  pendingVersions: []
};

const noOpBootstrap = async () => ({
  enabled: false,
  activeAdminExists: true,
  bootstrapAuditExists: true,
  adminUserFound: true,
  completed: false,
  status: 'disabled' as const,
  reason: 'test'
});

test('production startup checks schema readiness without invoking migrations', async () => {
  const serverSource = fs.readFileSync(new URL('../../backend/src/server.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(serverSource, /migrateDatabase/);
  await initializeBackend({
    schemaStatusCheck: async () => currentStatus,
    adminBootstrap: noOpBootstrap,
    scheduleJobs: false
  });
});

test('current schema is accepted by application startup', async () => {
  await assert.doesNotReject(() => initializeBackend({
    schemaStatusCheck: async () => currentStatus,
    adminBootstrap: noOpBootstrap,
    scheduleJobs: false
  }));
});

test('outdated schema fails clearly before bootstrap and does not mutate it', async () => {
  let bootstrapCalls = 0;
  const outdated: DatabaseSchemaStatus = {
    status: 'MIGRATION_REQUIRED',
    currentVersion: '0083_create_daily_checkins_and_nudges.sql',
    requiredVersion: '0084_multi_tenant_contract.sql',
    pendingVersions: ['0084_multi_tenant_contract.sql']
  };
  await assert.rejects(
    initializeBackend({
      schemaStatusCheck: async () => outdated,
      adminBootstrap: async () => {
        bootstrapCalls += 1;
        return noOpBootstrap();
      },
      scheduleJobs: false
    }),
    (error: unknown) => error instanceof DatabaseMigrationRequiredError &&
      error.code === 'DATABASE_MIGRATION_REQUIRED'
  );
  assert.equal(bootstrapCalls, 0);
});

test('multiple application startups remain migration-free', async () => {
  let checks = 0;
  for (let index = 0; index < 3; index += 1) {
    await initializeBackend({
      schemaStatusCheck: async () => {
        checks += 1;
        return currentStatus;
      },
      adminBootstrap: noOpBootstrap,
      scheduleJobs: false
    });
  }
  assert.equal(checks, 3);
});

test('schema comparison deterministically reports missing migrations', () => {
  assert.deepEqual(
    evaluateDatabaseSchemaStatus(['0082.sql', '0083.sql', '0084.sql'], ['0082.sql', '0083.sql']),
    {
      status: 'MIGRATION_REQUIRED',
      currentVersion: '0083.sql',
      requiredVersion: '0084.sql',
      pendingVersions: ['0084.sql']
    }
  );
});

test('the explicit migration command remains separate from API startup', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL('../../backend/package.json', import.meta.url), 'utf8')
  ) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts['db:migrate'], 'tsx src/db/migrator.ts');
  assert.equal(packageJson.scripts.start, 'node dist/server.js');
});
