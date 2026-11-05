import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { resolveVerifiedAccountIdentity } from '../../backend/src/modules/auth/auth.repository.js';
import { resolveConsultantApplicationIdentity } from '../../backend/src/modules/external-consultants/external-consultant-identity.repository.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';

test.beforeEach(async () => {
  await resetBackendStateForTests();
  await pool.query(`
    create table if not exists external_consultant_signups (
      id uuid primary key,
      auth_identity_id text not null,
      fiteatsy_user_id text references users(id) on delete restrict,
      signup_state text not null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query('truncate table external_consultant_signups');
});

const account = async (suffix: string) => resolveVerifiedAccountIdentity({
  name: `Roster Identity ${suffix}`,
  email: `roster-identity-${suffix}@example.com`,
  mobileNumber: `+9198210000${suffix.padStart(2, '0')}`,
});

test('governed signup maps the Auth subject to the assignment principal', async () => {
  const authenticated = await account('1');
  const assignmentPrincipal = await account('2');
  await pool.query(
    `insert into external_consultant_signups(id,auth_identity_id,fiteatsy_user_id,signup_state)
     values(gen_random_uuid(),$1,$2,'READY')`,
    [authenticated.user.id, assignmentPrincipal.user.id],
  );

  assert.deepEqual(
    await resolveConsultantApplicationIdentity(authenticated.user.id, `ext_${authenticated.user.id}`),
    { status: 'RESOLVED', applicationUserId: assignmentPrincipal.user.id, source: 'EXTERNAL_CONSULTANT_SIGNUP' },
  );
});

test('inactive and ambiguous governed identities fail closed', async () => {
  const authenticated = await account('3');
  const inactive = await account('4');
  await pool.query("update users set status='inactive' where id=$1", [inactive.user.id]);
  await pool.query(
    `insert into external_consultant_signups(id,auth_identity_id,fiteatsy_user_id,signup_state)
     values(gen_random_uuid(),$1,$2,'READY')`,
    [authenticated.user.id, inactive.user.id],
  );
  assert.equal((await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id)).status, 'INACTIVE');

  await pool.query('truncate table external_consultant_signups');
  const first = await account('5');
  const second = await account('6');
  await pool.query(
    `insert into external_consultant_signups(id,auth_identity_id,fiteatsy_user_id,signup_state)
     values(gen_random_uuid(),$1,$2,'READY'),(gen_random_uuid(),$1,$3,'READY')`,
    [authenticated.user.id, first.user.id, second.user.id],
  );
  assert.equal((await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id)).status, 'AMBIGUOUS');
});
