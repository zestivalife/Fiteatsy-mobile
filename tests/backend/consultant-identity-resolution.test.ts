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

test('production-shaped governed identity takes precedence over the same-subject JWT application identity', async () => {
  const authenticatedSubject = 'b1fe3d8e-ebba-4326-9e5a-e18c94e6d055';
  const assignmentPrincipal = 'ext_330a4fa0-731b-4162-bcb9-bf4e21e6a014';
  const assignmentId = 'da89a376-04ac-406e-b5d1-137e8ddf0fa0';
  const clientId = '773fcfff-c3c4-49a2-8b38-7d424403bdc2';
  const tenantId = 'ae871d83-f5ae-484f-8def-1ff7d4b5880c';
  await pool.query(
    `insert into users(id,name,role,status)
     values($1,'External Test','consultant','active'),($2,'Legacy assignment principal','consultant','active'),($3,'Kirti fixture','client','active')`,
    [authenticatedSubject, assignmentPrincipal, clientId],
  );
  await pool.query(
    `insert into external_consultant_signups(id,auth_identity_id,fiteatsy_user_id,signup_state,tenant_id)
     values(gen_random_uuid(),$1,$2,'READY',$3)`,
    [authenticatedSubject, assignmentPrincipal, tenantId],
  );
  await pool.query(
    `insert into consultant_client_assignments(
       id,consultant_user_id,client_user_id,status,scope,product,professional_type,relationship_type
     ) values($1,$2,$3,'active','client_care','FITEATSY','CONSULTANT','CLIENT_CARE')`,
    [assignmentId, assignmentPrincipal, clientId],
  );

  const resolved = await resolveConsultantApplicationIdentity(authenticatedSubject, authenticatedSubject, authenticatedSubject, tenantId);
  assert.deepEqual(
    resolved,
    { status: 'RESOLVED', applicationUserId: assignmentPrincipal, source: 'EXTERNAL_CONSULTANT_SIGNUP', tenantId },
  );
  const assignment = await pool.query(
    `select id from consultant_client_assignments
      where id=$1 and consultant_user_id=$2 and client_user_id=$3 and status='active'`,
    [assignmentId, resolved.applicationUserId, clientId],
  );
  assert.equal(assignment.rowCount, 1);
});

test('a valid JWT application identity is used only when no governed mapping exists', async () => {
  const authenticated = await account('8');
  assert.deepEqual(
    await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id, authenticated.user.id),
    { status: 'RESOLVED', applicationUserId: authenticated.user.id, source: 'AUTH_TOKEN', tenantId: null },
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

test('revoked, tenant-mismatched and invalid JWT identities fail closed', async () => {
  const authenticated = await account('9');
  const linked = await account('10');
  const tenantId = '22222222-2222-4222-8222-222222222222';
  await pool.query(
    `insert into external_consultant_signups(id,auth_identity_id,fiteatsy_user_id,signup_state,tenant_id)
     values(gen_random_uuid(),$1,$2,'REVOKED',$3)`,
    [authenticated.user.id, linked.user.id, tenantId],
  );
  assert.equal(
    (await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id, authenticated.user.id, tenantId)).status,
    'INACTIVE',
  );

  await pool.query('truncate table external_consultant_signups');
  await pool.query(
    `insert into external_consultant_signups(id,auth_identity_id,fiteatsy_user_id,signup_state,tenant_id)
     values(gen_random_uuid(),$1,$2,'READY',$3)`,
    [authenticated.user.id, linked.user.id, tenantId],
  );
  assert.equal(
    (await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id, authenticated.user.id, '33333333-3333-4333-8333-333333333333')).status,
    'TENANT_MISMATCH',
  );

  await pool.query('truncate table external_consultant_signups');
  assert.equal(
    (await resolveConsultantApplicationIdentity(authenticated.user.id, authenticated.user.id, 'missing-application-principal')).status,
    'INACTIVE',
  );
});
