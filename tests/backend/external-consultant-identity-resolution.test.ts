import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
  // DELETE respects the production FK graph. PostgreSQL rejects truncating a
  // referenced table even when its RESTRICT child is empty.
  await pool.query('delete from external_consultant_signups');
});

const account = async (suffix: string) => resolveVerifiedAccountIdentity({
  name: `Roster Identity ${suffix}`,
  email: `roster-identity-${suffix}@example.com`,
  mobileNumber: `+9198210000${suffix.padStart(2, '0')}`,
});

const insertGovernedSignup = async (authIdentityId: string, fiteatsyUserId: string) => {
  await pool.query(
    `insert into external_consultant_signups(
       id,auth_identity_id,fiteatsy_user_id,email_normalized,account_type,
       signup_state,idempotency_key,created_by_reference
     ) values($1,$2,$3,$4,'INDEPENDENT_CONSULTANT','READY',$5,'IDENTITY_RESOLUTION_TEST')`,
    [randomUUID(), authIdentityId, fiteatsyUserId, `${randomUUID()}@example.test`, randomUUID()],
  );
};

test('governed signup maps the Auth subject to the assignment principal', async () => {
  const authenticated = await account('1');
  const assignmentPrincipal = await account('2');
  await insertGovernedSignup(authenticated.user.id, assignmentPrincipal.user.id);

  assert.deepEqual(
    await resolveConsultantApplicationIdentity(authenticated.user.id, `ext_${authenticated.user.id}`),
    { status: 'RESOLVED', applicationUserId: assignmentPrincipal.user.id, source: 'EXTERNAL_CONSULTANT_SIGNUP' },
  );
});

test('inactive governed identities fail closed and duplicate Auth mappings are rejected', async () => {
  const authenticated = await account('3');
  const inactive = await account('4');
  await pool.query("update users set status='inactive' where id=$1", [inactive.user.id]);
  await insertGovernedSignup(authenticated.user.id, inactive.user.id);
  assert.equal((await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id)).status, 'INACTIVE');

  await pool.query('delete from external_consultant_signups');
  const first = await account('5');
  const second = await account('6');
  await insertGovernedSignup(authenticated.user.id, first.user.id);
  await assert.rejects(
    insertGovernedSignup(authenticated.user.id, second.user.id),
    (error: { code?: string }) => error.code === '23505',
  );
  assert.deepEqual(
    await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id),
    { status: 'RESOLVED', applicationUserId: first.user.id, source: 'EXTERNAL_CONSULTANT_SIGNUP' },
  );
});
