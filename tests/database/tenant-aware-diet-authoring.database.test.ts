import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase, resetMigrationStateForTests } from '../../backend/src/db/migrator.js';
import { pool } from '../../backend/src/db/pool.js';
import { createQaAssignment, provisionQaIdentity } from '../../backend/src/modules/admin/qa-provisioning.repository.js';
import { ensureRegisteredClientsForEligibleUsers } from '../../backend/src/modules/consultants/consultants.repository.js';
import { createProfessionalAssignment } from '../../backend/src/modules/professional-assignments/professional-assignments.repository.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

databaseTest('production tenant constraints accept governed clients and assignments without materialising dieticians as clients', async () => {
  resetMigrationStateForTests();
  await migrateDatabase();
  await resetBackendStateForTests();

  const suffix = Date.now();
  const reason = 'tenant-aware diet authoring regression';
  try {
    const consultant = await provisionQaIdentity({
      actorUserId: null,
      actorReference: 'database-regression',
      name: 'Tenant Dietician QA',
      email: `tenant-dietician-${suffix}@invalid.example`,
      mobileNumber: `+9198${String(suffix).slice(-8)}`,
      role: 'consultant',
      reason,
    });
    const client = await provisionQaIdentity({
      actorUserId: null,
      actorReference: 'database-regression',
      name: 'Tenant Client QA',
      email: `tenant-client-${suffix}@invalid.example`,
      mobileNumber: `+9197${String(suffix).slice(-8)}`,
      role: 'user',
      reason,
    });

    const assignment = await createQaAssignment({
      actorUserId: consultant.user.id,
      consultantUserId: consultant.user.id,
      clientUserId: client.user.id,
      reason,
    });
    assert.ok(assignment);
    assert.ok(assignment.tenant_id);
    assert.equal(assignment.tenant_id, client.client?.tenantId);

    const professionalReplay = await createProfessionalAssignment({
      actorUserId: consultant.user.id,
      clientUserId: client.user.id,
      professionalUserId: consultant.user.id,
      professionalType: 'CONSULTANT',
      relationshipType: 'CLIENT_CARE',
      reason,
    });
    assert.equal(professionalReplay?.id, assignment.id);
    assert.equal(professionalReplay?.tenant_id, assignment.tenant_id);

    await pool.query("update users set role='dietician' where id=$1", [consultant.user.id]);
    const materialized = await ensureRegisteredClientsForEligibleUsers();
    const consultantClient = await pool.query('select id from fiteatsy_clients where account_user_id=$1', [consultant.user.id]);
    assert.equal(materialized, 0);
    assert.equal(consultantClient.rowCount, 0);

    const constraints = await pool.query(
      `select table_name, column_name, is_nullable
         from information_schema.columns
        where (table_name, column_name) in (('fiteatsy_clients','tenant_id'),('consultant_client_assignments','tenant_id'))
        order by table_name`,
    );
    assert.equal(constraints.rowCount, 2);
    assert.ok(constraints.rows.every((row) => row.is_nullable === 'NO'));
  } finally {
    await resetBackendStateForTests();
  }
});

databaseTest('professional assignment rejects a consultant outside the client tenant', async () => {
  resetMigrationStateForTests();
  await migrateDatabase();
  await resetBackendStateForTests();

  const suffix = Date.now();
  try {
    const consultant = await provisionQaIdentity({
      actorUserId: null,
      actorReference: 'database-regression',
      name: 'Cross Tenant Consultant QA',
      email: `cross-tenant-consultant-${suffix}@invalid.example`,
      mobileNumber: `+9196${String(suffix).slice(-8)}`,
      role: 'consultant',
      reason: 'cross-tenant rejection regression',
    });
    const client = await provisionQaIdentity({
      actorUserId: null,
      actorReference: 'database-regression',
      name: 'Cross Tenant Client QA',
      email: `cross-tenant-client-${suffix}@invalid.example`,
      mobileNumber: `+9195${String(suffix).slice(-8)}`,
      role: 'user',
      reason: 'cross-tenant rejection regression',
    });
    await pool.query("update tenant_memberships set status='removed',removed_at=now() where user_id=$1", [consultant.user.id]);

    const assignment = await createProfessionalAssignment({
      actorUserId: consultant.user.id,
      clientUserId: client.user.id,
      professionalUserId: consultant.user.id,
      professionalType: 'CONSULTANT',
      relationshipType: 'CLIENT_CARE',
    });
    assert.equal(assignment, null);
  } finally {
    await resetBackendStateForTests();
  }
});
