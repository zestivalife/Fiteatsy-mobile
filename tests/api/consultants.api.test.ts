import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../backend/src/db/pool.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, patchJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server?.close();
});

test.beforeEach(async () => {
  await resetTestState();
});

const createConsultantSession = async () => {
  const session = await createAuthenticatedSession(server.baseUrl, {
    name: 'Consultant User',
    email: `consultant-${Date.now()}@example.com`
  });
  await pool.query('update users set role = $2 where id = $1', [session.current.body.accountId, 'consultant']);
  return session;
};

const ageFromDob = (dobISO: string) => {
  const dob = new Date(dobISO);
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
};

test('GET /v1/consultants/clients returns empty state when no registered clients exist', async () => {
  const consultant = await createConsultantSession();

  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.clients, []);
});

test('GET /v1/consultants/clients denies normal user sessions', async () => {
  const user = await createAuthenticatedSession(server.baseUrl);

  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(user.token)
  });

  assert.equal(response.response.status, 403);
  assert.equal(response.body.error, 'ROLE_NOT_ALLOWED');
});

test('registered Fiteatsy users appear in consultant client discovery without dummy data', async () => {
  const email = `real-client-${Date.now()}@example.com`;
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Real Client',
    email,
    mobileNumber: '+919900001234'
  });
  const consultant = await createConsultantSession();

  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.body.clients.length, 1);
  assert.equal(response.body.clients[0].name, 'Real Client');
  assert.equal(response.body.clients[0].clientId, client.current.body.client.fiteatsyClientId);
  assert.equal(response.body.clients[0].email, email);
  assert.equal(response.body.clients[0].mobile, '919900001234');
  assert.equal(response.body.clients[0].mobileNumberMasked, '******1234');
  assert.equal(response.body.clients[0].status, 'active');
  assert.equal(response.body.clients[0].accountStatus, 'active');
  assert.equal(response.body.clients[0].profileCompleted, false);
  assert.equal(response.body.clients[0].reportsCount, 0);
  assert.equal(response.body.clients[0].biomarkerStatus, null);
  assert.equal(response.body.clients[0].lastHealthUpdate, null);
  assert.equal(typeof response.body.clients[0].registeredAt, 'string');
  assert.equal(typeof response.body.clients[0].lastActiveAt, 'string');
});

test('consultant discovery backfills missing client records for registered users', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Legacy Client',
    email: `legacy-client-${Date.now()}@example.com`
  });
  await pool.query('delete from fiteatsy_clients where account_user_id = $1', [client.current.body.accountId]);

  const consultant = await createConsultantSession();
  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.body.clients.length, 1);
  assert.equal(response.body.clients[0].name, 'Legacy Client');
  const clientRow = await pool.query('select count(*)::int as total from fiteatsy_clients where account_user_id = $1', [client.current.body.accountId]);
  assert.equal(clientRow.rows[0].total, 1);
});

test('consultant discovery repairs inactive client mappings and preserves client ids', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Inactive Mapping Client',
    email: `inactive-client-${Date.now()}@example.com`
  });
  await pool.query(
    'update fiteatsy_clients set status = $2, deleted_at = now(), version = version + 1 where account_user_id = $1',
    [client.current.body.accountId, 'inactive']
  );

  const consultant = await createConsultantSession();
  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.body.clients.length, 1);
  assert.equal(response.body.clients[0].clientId, client.current.body.client.fiteatsyClientId);
  assert.equal(response.body.clients[0].name, 'Inactive Mapping Client');
  assert.equal(response.body.clients[0].status, 'active');

  const repaired = await pool.query(
    'select status, deleted_at from fiteatsy_clients where account_user_id = $1',
    [client.current.body.accountId]
  );
  assert.equal(repaired.rows[0].status, 'active');
  assert.equal(repaired.rows[0].deleted_at, null);
});

test('consultant client profile returns real onboarding fields only', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Onboarded Client',
    email: `onboarded-client-${Date.now()}@example.com`,
    mobileNumber: '+919811112222'
  });
  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1991-06-14T00:00:00.000Z',
      gender: 'Female',
      heightCm: 162,
      currentWeightKg: 61,
      waistCm: 78,
      hipCm: 94,
      neckCm: 32,
      wellnessGoals: ['Improve energy'],
      activityLevel: 'Moderate',
      dietType: 'Vegetarian',
      primaryConditions: ['Vitamin D deficiency']
    },
    { headers: authHeaders(client.token) }
  );
  const consultant = await createConsultantSession();

  const list = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(list.response.status, 200);
  assert.equal(list.body.clients[0].profileCompleted, true);
  assert.equal(list.body.clients[0].age, ageFromDob('1991-06-14T00:00:00.000Z'));
  assert.equal(list.body.clients[0].gender, 'Female');
  assert.equal(list.body.clients[0].height, 162);
  assert.equal(list.body.clients[0].weight, 61);
  assert.equal(list.body.clients[0].goal, 'Improve energy');
  assert.equal(list.body.clients[0].activityLevel, 'Moderate');
  assert.equal(list.body.clients[0].dietPreference, 'Vegetarian');
  assert.deepEqual(list.body.clients[0].medicalConditions, ['Vitamin D deficiency']);
  assert.equal(list.body.clients[0].onboarding.height, 162);
  assert.equal(list.body.clients[0].onboarding.weight, 61);
  assert.equal(list.body.clients[0].onboarding.goal, 'Improve energy');
  assert.equal(list.body.clients[0].onboarding.activityLevel, 'Moderate');
  assert.equal(list.body.clients[0].onboarding.dietPreference, 'Vegetarian');
  assert.deepEqual(list.body.clients[0].onboarding.medicalConditions, ['Vitamin D deficiency']);
  assert.equal(list.body.clients[0].healthProfile.reportsCount, 0);
  assert.equal(list.body.clients[0].healthProfile.profileCompleted, true);
  assert.equal(list.body.clients[0].reportsCount, 0);

  const profile = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.client.id, client.current.body.client.fiteatsyClientId);
  assert.equal(profile.body.client.name, 'Onboarded Client');
  assert.equal(profile.body.client.dob, '1991-06-14T00:00:00.000Z');
  assert.equal(profile.body.client.age, ageFromDob('1991-06-14T00:00:00.000Z'));
  assert.equal(profile.body.client.gender, 'Female');
  assert.equal(profile.body.client.mobile, '919811112222');
  assert.equal(profile.body.client.status, 'active');
  assert.equal(profile.body.client.accountStatus, 'active');
  assert.equal(profile.body.client.mobileNumberMasked, '******2222');
  assert.equal(profile.body.onboarding.height, 162);
  assert.equal(profile.body.onboarding.weight, 61);
  assert.equal(profile.body.onboarding.goal, 'Improve energy');
  assert.equal(profile.body.onboarding.activityLevel, 'Moderate');
  assert.equal(profile.body.onboarding.dietPreference, 'Vegetarian');
  assert.deepEqual(profile.body.onboarding.medicalConditions, ['Vitamin D deficiency']);
  assert.equal(profile.body.healthProfile.biomarkerStatus, null);
  assert.equal(profile.body.healthProfile.reportsCount, 0);
  assert.equal(profile.body.healthProfile.profileCompleted, true);
  assert.equal(profile.body.healthMetrics.bmi.status, 'AVAILABLE');
  assert.equal(profile.body.healthMetrics.bmi.value, 23.2);
  assert.equal(profile.body.healthMetrics.bmi.category, 'Normal');
  assert.equal(profile.body.healthMetrics.bmr.status, 'AVAILABLE');
  assert.equal(profile.body.healthMetrics.tdee.status, 'AVAILABLE');
  assert.equal(profile.body.healthMetrics.bodyFat.status, 'AVAILABLE');
  assert.equal(profile.body.healthMetrics.oneRepMax.status, 'NOT_AVAILABLE');
  assert.deepEqual(profile.body.biomarkers, []);
  assert.equal('recommendations' in profile.body, false);
});
