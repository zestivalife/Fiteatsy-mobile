import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { resolveVerifiedAccountIdentity } from '../../backend/src/modules/auth/auth.repository.js';
import { listExternalBiomarkers } from '../../backend/src/modules/external-clients/external-biomarkers.repository.js';
import { listExternalHealthRecords } from '../../backend/src/modules/external-clients/external-health-records.repository.js';
import { listExternalConfirmedTransientBiomarkers } from '../../backend/src/modules/external-clients/external-transient-report.repository.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { ensureCanonicalTestTenants, TENANT_A_ID, TENANT_B_ID } from '../../backend/src/test-support/test-tenants.js';

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

const account = (suffix: string) => resolveVerifiedAccountIdentity({
  name: `External authority ${suffix}`,
  email: `external-authority-${suffix}@example.test`,
  mobileNumber: `+91989900${suffix.padStart(4, '0')}`,
});

const addMembership = (userId: string, tenantId: string, status = 'active') => pool.query(
  `insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status)
   values($1,$2,$3,'CONSULTANT',$4)`,
  [randomUUID(), tenantId, userId, status],
);

const addClient = async (tenantId: string, userId: string, suffix: string) => {
  const id = randomUUID();
  await pool.query(
    `insert into external_clients(
       id,tenant_id,first_name,last_name,display_name,email,email_normalized,created_by_user_id
     ) values($1,$2,'Authority',$3,$4,$5,$5,$6)`,
    [id, tenantId, suffix, `Authority ${suffix}`, `authority-${suffix}-${id}@example.test`, userId],
  );
  return id;
};

test.beforeEach(async () => {
  await resetBackendStateForTests();
  await ensureCanonicalTestTenants({ includeIsolationTenants: true });
});

databaseTest('internal membership cannot shadow exact external-client practice authority', async () => {
  const consultant = await account('1');
  await addMembership(consultant.user.id, TENANT_A_ID);
  const clientId = await addClient(TENANT_A_ID, consultant.user.id, 'tenant-a');

  assert.deepEqual(await listExternalHealthRecords(consultant, clientId), []);
  assert.deepEqual(await listExternalBiomarkers(consultant, clientId), { latest: [], pendingReviewCount: 0 });
  assert.deepEqual(await listExternalConfirmedTransientBiomarkers(consultant, clientId), []);
});

databaseTest('multi-practice consultant resolves authority from each requested client record', async () => {
  const consultant = await account('2');
  await addMembership(consultant.user.id, TENANT_A_ID);
  await addMembership(consultant.user.id, TENANT_B_ID);
  const clientA = await addClient(TENANT_A_ID, consultant.user.id, 'multi-a');
  const clientB = await addClient(TENANT_B_ID, consultant.user.id, 'multi-b');

  assert.deepEqual(await listExternalHealthRecords(consultant, clientA), []);
  assert.deepEqual(await listExternalHealthRecords(consultant, clientB), []);
});

databaseTest('cross-tenant, inactive authority and malformed client identifiers fail closed', async () => {
  const owner = await account('3');
  await addMembership(owner.user.id, TENANT_A_ID);
  const clientA = await addClient(TENANT_A_ID, owner.user.id, 'protected-a');

  const wrongTenant = await account('4');
  await addMembership(wrongTenant.user.id, TENANT_B_ID);
  await assert.rejects(
    listExternalHealthRecords(wrongTenant, clientA),
    (error: { code?: string; status?: number }) => error.code === 'EXTERNAL_CLIENT_NOT_FOUND' && error.status === 404,
  );

  const inactive = await account('5');
  await addMembership(inactive.user.id, TENANT_A_ID, 'inactive');
  await assert.rejects(
    listExternalBiomarkers(inactive, clientA),
    (error: { code?: string; status?: number }) => error.code === 'EXTERNAL_BIOMARKER_AUTHORITY_REQUIRED' && error.status === 403,
  );

  await assert.rejects(
    listExternalConfirmedTransientBiomarkers(owner, 'not-a-uuid'),
    (error: { code?: string; status?: number }) => error.code === 'EXTERNAL_CLIENT_NOT_FOUND' && error.status === 404,
  );
});
