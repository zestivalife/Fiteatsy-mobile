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

  assert.equal(client.response.status, 201, JSON.stringify(client.body));
  assert.equal(consultant.response.status, 201, JSON.stringify(consultant.body));
  assert.equal(client.body.user.accountPurpose, 'QA_TEST');
  assert.equal(consultant.body.user.role, 'consultant');

  const arbitraryAdmin = await postJson(server.baseUrl, '/v1/admin/qa-identities', {
    name: 'Forbidden Generic Admin', email: `forbidden-admin-${suffix}@example.com`, mobileNumber: '+919876543298', role: 'admin', reason: 'Must remain delegated-only'
  }, { headers: authHeaders(admin.token) });
  assert.equal(arbitraryAdmin.response.status, 400);

  const clientSession = await postJson(server.baseUrl, `/v1/admin/qa-identities/${client.body.user.id}/session`, { reason: 'Food preference acceptance' }, { headers: authHeaders(admin.token) });
  assert.equal(clientSession.response.status, 201);
  const me = await getJson(server.baseUrl, '/v1/auth/me', { headers: authHeaders(clientSession.body.token) });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.id, client.body.user.id);
  assert.equal(me.body.user.role, 'user');
  assert.equal(me.body.user.accountPurpose, 'QA_TEST');

  const assignment = await postJson(server.baseUrl, '/v1/admin/client-assignments', {
    consultantUserId: consultant.body.user.id, clientUserId: client.body.user.id, reason: 'Food preference acceptance'
  }, { headers: authHeaders(admin.token) });
  assert.equal(assignment.response.status, 201, JSON.stringify(assignment.body));
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
  const reset = await postJson(server.baseUrl, `/v1/admin/qa-identities/${user.current.body.accountId}/onboarding/reset`, {
    reason: 'Ordinary clients cannot reset onboarding'
  }, { headers: authHeaders(user.token) });
  assert.equal(reset.response.status, 403);
});

test('admin resets only QA client onboarding state while preserving identity and session', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Reset Admin', email: `reset-admin-${Date.now()}@example.com`
  });
  await pool.query('update users set role = \'admin\' where id = $1', [admin.current.body.accountId]);
  const suffix = Date.now();
  const client = await postJson(server.baseUrl, '/v1/admin/qa-identities', {
    name: 'Resettable QA Client', email: `resettable-qa-${suffix}@example.com`, mobileNumber: '+919876543203', role: 'user', reason: 'Onboarding reset acceptance'
  }, { headers: authHeaders(admin.token) });
  assert.equal(client.response.status, 201, JSON.stringify(client.body));
  const userId = client.body.user.id;
  const createdProfile = await pool.query('select id from health_profiles where user_id = $1', [userId]);
  const healthProfileId = String(createdProfile.rows[0].id);
  await pool.query(
    `update health_profiles set gender = 'female', height_cm = 165, diet_type = 'vegetarian',
      preferred_cuisines = '["Maharashtrian"]'::jsonb, food_preference_profile = '{"dietType":"vegetarian"}'::jsonb
      where user_id = $1`, [userId]
  );
  const session = await postJson(server.baseUrl, `/v1/admin/qa-identities/${userId}/session`, { reason: 'Reset persistence verification' }, { headers: authHeaders(admin.token) });
  assert.equal(session.response.status, 201);
  const bundle = await getJson(server.baseUrl, '/v1/platform/health-profile', { headers: authHeaders(session.body.token) });
  assert.equal(bundle.response.status, 200);
  await pool.query(
    `update nutrition_profiles set completion_percent = 80, readiness_score = 75, ai_ready = true
      where user_id = $1`, [userId]
  );

  const reset = await postJson(server.baseUrl, `/v1/admin/qa-identities/${userId}/onboarding/reset`, { reason: 'Repeat onboarding acceptance' }, { headers: authHeaders(admin.token) });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.onboardingStatus, 'INCOMPLETE');
  assert.equal(reset.body.healthProfileId, healthProfileId);

  const identity = await pool.query('select account_purpose, status from users where id = $1', [userId]);
  assert.deepEqual(identity.rows[0], { account_purpose: 'QA_TEST', status: 'active' });
  const profile = await pool.query('select gender, height_cm, diet_type, preferred_cuisines, food_preference_profile from health_profiles where user_id = $1', [userId]);
  assert.equal(profile.rows[0].gender, null);
  assert.equal(profile.rows[0].height_cm, null);
  assert.equal(profile.rows[0].diet_type, null);
  assert.deepEqual(profile.rows[0].preferred_cuisines, []);
  assert.deepEqual(profile.rows[0].food_preference_profile, {});
  const nutrition = await pool.query('select completion_percent, readiness_score, ai_ready from nutrition_profiles where user_id = $1', [userId]);
  assert.deepEqual(nutrition.rows[0], { completion_percent: 0, readiness_score: 0, ai_ready: false });
  const me = await getJson(server.baseUrl, '/v1/auth/me', { headers: authHeaders(session.body.token) });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.id, userId);
  const audit = await pool.query("select action from qa_provisioning_audit_events where target_user_id = $1 and action = 'QAOnboardingReset'", [userId]);
  assert.equal(audit.rowCount, 1);
});

test('QA onboarding reset denies production identities and unauthenticated callers', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Reset Guard Admin', email: `reset-guard-admin-${Date.now()}@example.com`
  });
  await pool.query('update users set role = \'admin\' where id = $1', [admin.current.body.accountId]);
  const production = await createAuthenticatedSession(server.baseUrl, {
    name: 'Production Client', email: `production-client-${Date.now()}@example.com`
  });
  const denied = await postJson(server.baseUrl, `/v1/admin/qa-identities/${production.current.body.accountId}/onboarding/reset`, { reason: 'Must be denied' }, { headers: authHeaders(admin.token) });
  assert.equal(denied.response.status, 404);
  const unauthenticated = await postJson(server.baseUrl, `/v1/admin/qa-identities/${production.current.body.accountId}/onboarding/reset`, { reason: 'Must be denied' });
  assert.equal(unauthenticated.response.status, 401);
  const sessionDenied = await postJson(server.baseUrl, `/v1/admin/qa-identities/${production.current.body.accountId}/session`, { reason: 'Production sessions are forbidden' }, { headers: authHeaders(admin.token) });
  assert.equal(sessionDenied.response.status, 404);
});

test('admin provisions a QA senior consultant with canonical role and governed session', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Senior Provisioning Admin', email: `senior-provisioning-admin-${Date.now()}@example.com`
  });
  await pool.query('update users set role = \'admin\' where id = $1', [admin.current.body.accountId]);
  const senior = await postJson(server.baseUrl, '/v1/admin/qa-identities', {
    name: 'Fiteatsy QA Senior Consultant', email: `fiteatsy-qa-senior-${Date.now()}@example.com`, mobileNumber: '+919876543204', role: 'senior_consultant', reason: 'Review workflow acceptance'
  }, { headers: authHeaders(admin.token) });
  assert.equal(senior.response.status, 201, JSON.stringify(senior.body));
  assert.equal(senior.body.user.accountPurpose, 'QA_TEST');
  assert.equal(senior.body.user.role, 'senior_consultant');
  const session = await postJson(server.baseUrl, `/v1/admin/qa-identities/${senior.body.user.id}/session`, { reason: 'Senior review acceptance' }, { headers: authHeaders(admin.token) });
  assert.equal(session.response.status, 201);
  const me = await getJson(server.baseUrl, '/v1/auth/me', { headers: authHeaders(session.body.token) });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.id, senior.body.user.id);
  const persisted = await pool.query('select role, account_purpose from users where id = $1', [senior.body.user.id]);
  assert.deepEqual(persisted.rows[0], { role: 'senior_consultant', account_purpose: 'QA_TEST' });
});
