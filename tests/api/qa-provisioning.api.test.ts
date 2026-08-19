import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../backend/src/db/pool.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => { server = await startTestServer(); });
test.after(async () => { await server?.close(); });
test.beforeEach(async () => { await resetTestState(); });

test('admin provisions QA client and consultant, issues governed sessions, and records assignment lifecycle', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Provisioning Admin', email: `provisioning-admin-${Date.now()}@example.com`
  });
  await pool.query('update users set role = \'admin\' where id = $1', [admin.current.body.accountId]);
  const suffix = Date.now();

  const client = await postJson(server.baseUrl, '/v1/admin/qa-identities', {
    name: 'Fiteatsy QA Client', email: `fiteatsy-qa-client-${suffix}@example.com`, mobileNumber: '+919876543201', role: 'user', reason: 'Production acceptance QA'
  }, { headers: authHeaders(admin.token) });
  const consultant = await postJson(server.baseUrl, '/v1/admin/qa-identities', {
    name: 'Fiteatsy QA Consultant', email: `fiteatsy-qa-consultant-${suffix}@example.com`, mobileNumber: '+919876543202', role: 'consultant', reason: 'Production acceptance QA'
  }, { headers: authHeaders(admin.token) });

  assert.equal(client.response.status, 201);
  assert.equal(consultant.response.status, 201);
  assert.equal(client.body.user.accountPurpose, 'QA_TEST');
  assert.equal(consultant.body.user.role, 'consultant');

  const clientSession = await postJson(server.baseUrl, `/v1/admin/qa-identities/${client.body.user.id}/session`, { reason: 'Food preference acceptance' }, { headers: authHeaders(admin.token) });
  assert.equal(clientSession.response.status, 201);
  const me = await getJson(server.baseUrl, '/v1/auth/me', { headers: authHeaders(clientSession.body.token) });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.id, client.body.user.id);

  const assignment = await postJson(server.baseUrl, '/v1/admin/client-assignments', {
    consultantUserId: consultant.body.user.id, clientUserId: client.body.user.id, reason: 'Food preference acceptance'
  }, { headers: authHeaders(admin.token) });
  assert.equal(assignment.response.status, 201);
  assert.equal(assignment.body.assignment.status, 'active');

  const listed = await getJson(server.baseUrl, '/v1/admin/client-assignments', { headers: authHeaders(admin.token) });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.assignments[0].clientUserId, client.body.user.id);

  const revoked = await postJson(server.baseUrl, `/v1/admin/client-assignments/${assignment.body.assignment.id}/revoke`, { reason: 'Acceptance cleanup' }, { headers: authHeaders(admin.token) });
  assert.equal(revoked.response.status, 200);
  const deactivated = await postJson(server.baseUrl, `/v1/admin/qa-identities/${client.body.user.id}/deactivate`, { reason: 'Acceptance cleanup' }, { headers: authHeaders(admin.token) });
  assert.equal(deactivated.response.status, 200);

  const audit = await pool.query('select action from qa_provisioning_audit_events where target_user_id = $1 order by created_at', [client.body.user.id]);
  assert.deepEqual(audit.rows.map((row) => row.action), ['QAIdentityCreated', 'QAProfileProvisioned', 'QASessionIssued', 'ConsultantClientAssigned', 'ConsultantClientAssignmentRevoked', 'QAIdentityDeactivated']);
});

test('normal users cannot access QA provisioning endpoints', async () => {
  const user = await createAuthenticatedSession(server.baseUrl, { name: 'Normal User', email: `normal-${Date.now()}@example.com` });
  const response = await postJson(server.baseUrl, '/v1/admin/qa-identities', {
    name: 'Should Not Exist', email: `blocked-${Date.now()}@example.com`, mobileNumber: '+919876543299', role: 'user', reason: 'security test'
  }, { headers: authHeaders(user.token) });
  assert.equal(response.response.status, 403);
});
