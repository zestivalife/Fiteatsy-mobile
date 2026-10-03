import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { createCareCaseIfMissing } from '../../backend/src/modules/platform/platform.store.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { ZESTIVA_TENANT_ID } from '../../backend/src/modules/tenancy/tenant-context.js';

const TENANT_A = '60000000-0000-4000-8000-000000000001';
const TENANT_B = '70000000-0000-4000-8000-000000000001';

const seedTenantClient = async (tenantId: string, suffix: string) => {
  const userId = randomUUID();
  const clientId = randomUUID();
  const profileId = randomUUID();
  await pool.query(
    `insert into tenants(id,name,slug,tenant_type) values($1,$2,$3,'PRACTICE')
     on conflict(id) do nothing`,
    [tenantId, `Practice ${suffix}`, `practice-${suffix}`],
  );
  await pool.query(
    `insert into users(id,name,email_normalized,role,status,account_purpose)
     values($1,$2,$3,'user','active','QA_TEST')`,
    [userId, `External Client ${suffix}`, `external-${suffix}-${userId}@example.test`],
  );
  await pool.query(
    `insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status)
     values($1,$2,$3,'CLIENT','active')`,
    [randomUUID(), tenantId, userId],
  );
  await pool.query(
    `insert into fiteatsy_clients(id,fiteatsy_client_id,account_user_id,tenant_id)
     values($1,$2,$3,$4)`,
    [clientId, `fc_external_${suffix}_${Date.now()}`, userId, tenantId],
  );
  await pool.query(
    `insert into health_profiles(id,user_id,client_id) values($1,$2,$3)`,
    [profileId, userId, clientId],
  );
  return { userId, clientId, profileId };
};

test('EXTERNAL_TENANT_WRITES_NEVER_DEFAULT_TO_ZESTIVA', async () => {
  await resetBackendStateForTests();
  const client = await seedTenantClient(TENANT_A, 'a');
  const careCase = await createCareCaseIfMissing(
    { accountId: client.userId, clientId: client.clientId },
    client.profileId,
  );
  const stored = await pool.query<{ tenant_id: string }>('select tenant_id from care_cases where id=$1', [careCase.id]);
  assert.equal(stored.rows[0]?.tenant_id, TENANT_A);
  assert.notEqual(stored.rows[0]?.tenant_id, ZESTIVA_TENANT_ID);
});

test('PARENT_CHILD_TENANT_OWNERSHIP_INVARIANT fails closed', async () => {
  await resetBackendStateForTests();
  const client = await seedTenantClient(TENANT_B, 'b');
  await pool.query(
    `insert into tenants(id,name,slug,tenant_type) values($1,'Practice A','practice-a','PRACTICE')
     on conflict(id) do nothing`,
    [TENANT_A],
  );
  await pool.query('update tenant_memberships set tenant_id=$1 where user_id=$2', [TENANT_A, client.userId]);
  await assert.rejects(
    createCareCaseIfMissing({ accountId: client.userId, clientId: client.clientId }, client.profileId),
    /TENANT_RESOURCE_MISMATCH/,
  );
  const inserted = await pool.query<{ count: number }>('select count(*)::int as count from care_cases where client_id=$1', [client.clientId]);
  assert.equal(inserted.rows[0]?.count, 0);
});

test('canonical writes reject users without an active tenant membership', async () => {
  await resetBackendStateForTests();
  const userId = randomUUID();
  const clientId = randomUUID();
  const profileId = randomUUID();
  await pool.query(
    `insert into users(id,name,email_normalized,role,status,account_purpose) values($1,'Legacy Client',$2,'user','active','QA_TEST')`,
    [userId, `legacy-${userId}@example.test`],
  );
  await pool.query(
    'insert into fiteatsy_clients(id,fiteatsy_client_id,account_user_id,tenant_id) values($1,$2,$3,$4)',
    [clientId, `fc_legacy_${Date.now()}`, userId, ZESTIVA_TENANT_ID],
  );
  await pool.query('insert into health_profiles(id,user_id,client_id) values($1,$2,$3)', [profileId, userId, clientId]);
  await assert.rejects(
    createCareCaseIfMissing({ accountId: userId, clientId }, profileId),
    /TENANT_CONTEXT_REQUIRED/,
  );
  const stored = await pool.query<{ count: number }>('select count(*)::int as count from care_cases where client_id=$1', [clientId]);
  assert.equal(stored.rows[0]?.count, 0);
});

test('contract schema enforces explicit ownership and retires transition triggers', async () => {
  const tables = [
    'fiteatsy_clients','consultant_client_assignments','care_cases','consultant_client_operations',
    'consultant_client_operation_audit','daily_checkins','nudges','health_reports','health_report_files',
    'health_report_upload_sessions','document_intelligence_audit','biomarkers','biomarker_observations',
    'health_observations','diet_plans','diet_plan_versions','diet_plan_review_events','notifications',
    'profile_photo_assets','consultant_access_consents','consultant_access_consent_events',
  ];
  const columns = await pool.query<{ table_name: string; is_nullable: string }>(
    `select table_name,is_nullable from information_schema.columns
      where table_schema='public' and column_name='tenant_id' and table_name=any($1::text[])`,
    [tables],
  );
  assert.equal(columns.rowCount, 21);
  assert.deepEqual(columns.rows.filter((row) => row.is_nullable !== 'NO'), []);

  const triggers = await pool.query<{ count: number }>(
    `select count(*)::int as count from pg_trigger
      where not tgisinternal and tgname='tenant_dual_write'`,
  );
  assert.equal(triggers.rows[0]?.count, 0);
  const fallbackFunction = await pool.query<{ exists: boolean }>(
    `select to_regprocedure('set_zestiva_tenant_during_transition()') is not null as exists`,
  );
  assert.equal(fallbackFunction.rows[0]?.exists, false);
});

test('database rejects cross-tenant parent-child writes', async () => {
  await resetBackendStateForTests();
  const client = await seedTenantClient(TENANT_A, 'constraint-a');
  await pool.query(
    `insert into tenants(id,name,slug,tenant_type) values($1,'Constraint B','constraint-b','PRACTICE')
     on conflict(id) do nothing`,
    [TENANT_B],
  );
  const careCase = await createCareCaseIfMissing(
    { accountId: client.userId, clientId: client.clientId },
    client.profileId,
  );
  await assert.rejects(
    pool.query('update care_cases set tenant_id=$1 where id=$2', [TENANT_B, careCase.id]),
    /care_cases_client_tenant_fk/,
  );
});
