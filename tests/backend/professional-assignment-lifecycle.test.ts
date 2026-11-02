import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../backend/src/db/pool.js';
import { resolveVerifiedAccountIdentity } from '../../backend/src/modules/auth/auth.repository.js';
import {
  createProfessionalAssignment,
  ProfessionalAssignmentConflictError,
} from '../../backend/src/modules/professional-assignments/professional-assignments.repository.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';

test.beforeEach(async () => {
  await resetBackendStateForTests();
});

const account = async (suffix: string, role: string) => {
  const value = await resolveVerifiedAccountIdentity({
    name: `Assignment ${suffix}`,
    email: `assignment-${suffix}@example.com`,
    mobileNumber: `+9198100000${suffix.padStart(2, '0')}`,
  });
  await pool.query('update users set role = $2 where id = $1', [value.user.id, role]);
  return value;
};

test('assignment creation is idempotent and never silently reassigns a client', async () => {
  const client = await account('1', 'user');
  const firstProfessional = await account('2', 'dietician');
  const secondProfessional = await account('3', 'consultant');

  const first = await createProfessionalAssignment({
    actorUserId: firstProfessional.user.id,
    clientUserId: client.user.id,
    professionalUserId: firstProfessional.user.id,
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
  });
  const repeated = await createProfessionalAssignment({
    actorUserId: firstProfessional.user.id,
    clientUserId: client.user.id,
    professionalUserId: firstProfessional.user.id,
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
  });
  assert.equal(repeated?.id, first?.id);

  await assert.rejects(
    createProfessionalAssignment({
      actorUserId: secondProfessional.user.id,
      clientUserId: client.user.id,
      professionalUserId: secondProfessional.user.id,
      professionalType: 'CONSULTANT',
      relationshipType: 'CLIENT_CARE',
    }),
    (error: unknown) => error instanceof ProfessionalAssignmentConflictError && error.activeAssignmentId === String(first?.id),
  );

  const active = await pool.query("select consultant_user_id from consultant_client_assignments where client_user_id = $1 and status = 'active'", [client.user.id]);
  assert.equal(active.rowCount, 1);
  assert.equal(active.rows[0].consultant_user_id, firstProfessional.user.id);
});

test('explicit compare-and-set reassignment revokes exactly the expected assignment', async () => {
  const client = await account('4', 'user');
  const firstProfessional = await account('5', 'dietician');
  const secondProfessional = await account('6', 'consultant');
  const first = await createProfessionalAssignment({ actorUserId: firstProfessional.user.id, clientUserId: client.user.id, professionalUserId: firstProfessional.user.id, professionalType: 'CONSULTANT', relationshipType: 'CLIENT_CARE' });

  const replacement = await createProfessionalAssignment({
    actorUserId: secondProfessional.user.id,
    clientUserId: client.user.id,
    professionalUserId: secondProfessional.user.id,
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
    expectedActiveAssignmentId: String(first?.id),
    reason: 'Approved identity reconciliation',
  });

  assert.equal(replacement?.consultant_user_id, secondProfessional.user.id);
  const prior = await pool.query('select status from consultant_client_assignments where id = $1', [first?.id]);
  assert.equal(prior.rows[0].status, 'revoked');
});
