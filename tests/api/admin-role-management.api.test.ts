import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../backend/src/db/pool.js';
import { bootstrapInitialAdminFromEnvironment } from '../../backend/src/modules/admin/admin.service.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server?.close();
});

test.beforeEach(async () => {
  delete process.env.INITIAL_ADMIN_PHONE;
  await resetTestState();
});

const promoteRole = async (userId: string, role: 'admin' | 'consultant' | 'user') => {
  await pool.query('update users set role = $2 where id = $1', [userId, role]);
};

test('INITIAL_ADMIN_PHONE bootstraps the first admin from an existing verified user', async () => {
  const candidate = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Bootstrap Admin',
    email: `qa-bootstrap-admin-${Date.now()}@example.com`,
    mobileNumber: '+919876500001'
  });
  process.env.INITIAL_ADMIN_PHONE = '9876500001';

  const bootstrap = await bootstrapInitialAdminFromEnvironment();

  assert.equal(bootstrap.status, 'bootstrapped');
  assert.equal(bootstrap.enabled, true);
  assert.equal(bootstrap.adminUserFound, true);
  assert.equal(bootstrap.completed, true);

  const user = await pool.query('select role from users where id = $1', [candidate.current.body.accountId]);
  assert.equal(user.rows[0].role, 'admin');

  const audit = await pool.query(
    'select old_role, new_role, reason from role_audit_events where target_user_id = $1',
    [candidate.current.body.accountId]
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].old_role, null);
  assert.equal(audit.rows[0].new_role, 'admin');
  assert.equal(audit.rows[0].reason, 'initial_admin_bootstrap');
});

test('INITIAL_ADMIN_PHONE does not run when an active admin already exists', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Existing Admin',
    email: `existing-admin-${Date.now()}@example.com`,
    mobileNumber: '+919876500002'
  });
  const candidate = await createAuthenticatedSession(server.baseUrl, {
    name: 'Skipped Bootstrap Candidate',
    email: `skipped-bootstrap-${Date.now()}@example.com`,
    mobileNumber: '+919876500003'
  });
  await promoteRole(admin.current.body.accountId, 'admin');
  process.env.INITIAL_ADMIN_PHONE = '9876500003';

  const bootstrap = await bootstrapInitialAdminFromEnvironment();

  assert.equal(bootstrap.status, 'skipped');
  assert.equal(bootstrap.reason, 'admin_exists');
  const skipped = await pool.query('select role from users where id = $1', [candidate.current.body.accountId]);
  assert.equal(skipped.rows[0].role, null);
  const audit = await pool.query('select count(*)::int as count from role_audit_events');
  assert.equal(audit.rows[0].count, 0);
});

test('admin assigns consultant role and creates an audit event', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Admin',
    email: `qa-admin-${Date.now()}@example.com`
  });
  const target = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Consultant Candidate',
    email: `qa-consultant-${Date.now()}@example.com`
  });
  await promoteRole(admin.current.body.accountId, 'admin');

  const assigned = await postJson(
    server.baseUrl,
    `/v1/admin/users/${target.current.body.accountId}/role`,
    {
      role: 'consultant',
      reason: 'M1.1 QA validation'
    },
    { headers: authHeaders(admin.token) }
  );

  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.body.user.id, target.current.body.accountId);
  assert.equal(assigned.body.user.role, 'consultant');
  assert.equal(assigned.body.auditEvent.performedByUserId, admin.current.body.accountId);
  assert.equal(assigned.body.auditEvent.targetUserId, target.current.body.accountId);
  assert.equal(assigned.body.auditEvent.newRole, 'consultant');

  const audit = await pool.query(
    'select old_role, new_role, reason from role_audit_events where target_user_id = $1',
    [target.current.body.accountId]
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].new_role, 'consultant');
  assert.equal(audit.rows[0].reason, 'M1.1 QA validation');

  const status = await getJson(server.baseUrl, '/v1/admin/status', {
    headers: authHeaders(admin.token)
  });
  assert.equal(status.response.status, 200);
  assert.equal(status.body.role, 'admin');
  assert.deepEqual(status.body.permissions, ['role_management']);
  assert.equal(typeof status.body.bootstrapConfigured, 'boolean');
});

test('consultant cannot assign roles', async () => {
  const consultant = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Consultant',
    email: `qa-consultant-deny-${Date.now()}@example.com`
  });
  const target = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Target',
    email: `qa-target-${Date.now()}@example.com`
  });
  await promoteRole(consultant.current.body.accountId, 'consultant');

  const denied = await postJson(
    server.baseUrl,
    `/v1/admin/users/${target.current.body.accountId}/role`,
    { role: 'admin' },
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error, 'ROLE_NOT_ALLOWED');

  const statusDenied = await getJson(server.baseUrl, '/v1/admin/status', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(statusDenied.response.status, 403);
  assert.equal(statusDenied.body.error, 'ROLE_NOT_ALLOWED');
});

test('normal user cannot assign roles and cannot access consultant client API', async () => {
  const user = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Normal User',
    email: `qa-user-${Date.now()}@example.com`
  });
  const target = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Normal Target',
    email: `qa-normal-target-${Date.now()}@example.com`
  });

  const roleDenied = await postJson(
    server.baseUrl,
    `/v1/admin/users/${target.current.body.accountId}/role`,
    { role: 'consultant' },
    { headers: authHeaders(user.token) }
  );
  assert.equal(roleDenied.response.status, 403);
  assert.equal(roleDenied.body.error, 'ROLE_NOT_ALLOWED');

  const consultantDenied = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(user.token)
  });
  assert.equal(consultantDenied.response.status, 403);
  assert.equal(consultantDenied.body.error, 'ROLE_NOT_ALLOWED');
});

test('consultant can access client list after admin role assignment', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Admin Access',
    email: `qa-admin-access-${Date.now()}@example.com`
  });
  const consultant = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Consultant Access',
    email: `qa-consultant-access-${Date.now()}@example.com`
  });
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Real Client',
    email: `qa-real-client-${Date.now()}@example.com`
  });
  await promoteRole(admin.current.body.accountId, 'admin');

  const assigned = await postJson(
    server.baseUrl,
    `/v1/admin/users/${consultant.current.body.accountId}/role`,
    { role: 'consultant', reason: 'Grant consultant dashboard access' },
    { headers: authHeaders(admin.token) }
  );
  assert.equal(assigned.response.status, 200);

  const list = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(list.response.status, 200);
  assert.equal(list.body.clients.length, 1);
  assert.equal(list.body.clients[0].clientId, client.current.body.client.fiteatsyClientId);
  assert.equal(list.body.clients[0].name, 'QA Real Client');
});
