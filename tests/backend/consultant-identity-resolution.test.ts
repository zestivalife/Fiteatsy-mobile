import test from 'node:test';
import assert from 'node:assert/strict';
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
      tenant_id uuid,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query('truncate table external_consultant_signups');
});

const account = async (suffix: string) => resolveVerifiedAccountIdentity({
  name: `Identity ${suffix}`,
  email: `identity-${suffix}@example.com`,
  mobileNumber: `+9198200000${suffix.padStart(2, '0')}`,
});

test('governed signup maps the authenticated subject to its assignment identity', async () => {
  const authenticated = await account('1');
  const legacy = await account('2');
  const tenantId = '11111111-1111-4111-8111-111111111111';
  await pool.query(
    `insert into external_consultant_signups(id,auth_identity_id,fiteatsy_user_id,signup_state,tenant_id)
     values(gen_random_uuid(),$1,$2,'READY',$3)`,
    [authenticated.user.id, legacy.user.id, tenantId],
  );

  assert.deepEqual(
    await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id),
    { status: 'RESOLVED', applicationUserId: legacy.user.id, source: 'EXTERNAL_CONSULTANT_SIGNUP', tenantId },
  );
});

test('signed Auth application identity takes precedence without cross-service database access', async () => {
  const authenticated = await account('8');
  assert.deepEqual(
    await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id, 'ext-governed-consultant'),
    { status: 'RESOLVED', applicationUserId: 'ext-governed-consultant', source: 'AUTH_TOKEN', tenantId: null },
  );
});

test('native identity remains authoritative when no governed link exists', async () => {
  const authenticated = await account('3');
  assert.deepEqual(
    await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id),
    { status: 'RESOLVED', applicationUserId: authenticated.user.id, source: 'NATIVE_ACCOUNT', tenantId: null },
  );
});

test('inactive and ambiguous governed identities fail closed', async () => {
  const authenticated = await account('4');
  const inactive = await account('5');
  await pool.query("update users set status='inactive' where id=$1", [inactive.user.id]);
  await pool.query(
    `insert into external_consultant_signups(id,auth_identity_id,fiteatsy_user_id,signup_state)
     values(gen_random_uuid(),$1,$2,'READY')`,
    [authenticated.user.id, inactive.user.id],
  );
  assert.equal((await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id)).status, 'INACTIVE');

  await pool.query('truncate table external_consultant_signups');
  const first = await account('6');
  const second = await account('7');
  await pool.query(
    `insert into external_consultant_signups(id,auth_identity_id,fiteatsy_user_id,signup_state)
     values(gen_random_uuid(),$1,$2,'READY'),(gen_random_uuid(),$1,$3,'READY')`,
    [authenticated.user.id, first.user.id, second.user.id],
  );
  assert.equal((await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id)).status, 'AMBIGUOUS');
});
