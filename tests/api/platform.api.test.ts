import test from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, patchJson, postJson } from '../helpers/http.js';
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

test('platform endpoints return 404 before health profile exists', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const profile = await getJson(server.baseUrl, '/v1/platform/health-profile?userId=no-profile', {
    headers: authHeaders(session.token)
  });
  assert.equal(profile.response.status, 404);

  const careCase = await getJson(server.baseUrl, '/v1/platform/care-cases/current?userId=no-profile', {
    headers: authHeaders(session.token)
  });
  assert.equal(careCase.response.status, 404);
});

test('PATCH /v1/platform/health-profile creates bundle and GET endpoints return 200', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const patched = await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1990-04-12T00:00:00.000Z',
      gender: 'Female',
      heightCm: 164,
      currentWeightKg: 62,
      goalWeightKg: 58,
      activityLevel: 'Moderately active',
      dietType: 'Vegetarian',
      preferredCuisines: ['Maharashtrian'],
      sleepHours: 6.5,
      sleepGoalHours: 8,
      sleepQualityLabel: 'Fair',
      smokingStatus: 'Never',
      alcoholFrequency: 'Never',
      exerciseFrequency: '3-4x/week',
      stressLevelLabel: 'Moderate',
      previousConditions: ['Vitamin Deficiency'],
      familyHistoryConditions: ['Diabetes'],
      medicalNotes: 'Prefers vegetarian meals.',
      pcosStatus: 'No',
      thyroidStatus: 'No',
      diabetesStatus: 'No',
      hypertensionStatus: 'No',
      cholesterolStatus: 'Borderline',
      heartConditionStatus: 'No',
      previousSurgeries: ['None'],
      wellnessGoals: ['Weight Loss'],
    },
    { headers: authHeaders(session.token) }
  );
  assert.equal(patched.response.status, 200);
  assert.equal(patched.body.profile.userId, session.current.body.accountId);
  assert.deepEqual(patched.body.profile.preferredCuisines, ['Maharashtrian']);
  assert.equal(patched.body.profile.sleepHours, 6.5);
  assert.equal(patched.body.profile.sleepQualityLabel, 'Fair');
  assert.deepEqual(patched.body.profile.familyHistoryConditions, ['Diabetes']);
  assert.equal(patched.body.profile.medicalNotes, 'Prefers vegetarian meals.');
  assert.equal(patched.body.profile.cholesterolStatus, 'Borderline');
  assert.deepEqual(patched.body.profile.previousSurgeries, ['None']);
  assert.equal('clientId' in patched.body.profile, false);
  assert.equal('clientId' in patched.body.nutrition, false);
  assert.equal('clientId' in patched.body.careCase, false);

  const profile = await getJson(server.baseUrl, '/v1/platform/health-profile?userId=platform-user', {
    headers: authHeaders(session.token)
  });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.profile.userId, session.current.body.accountId);
  assert.deepEqual(profile.body.profile.preferredCuisines, ['Maharashtrian']);
  assert.equal(profile.body.profile.sleepHours, 6.5);
  assert.equal(profile.body.profile.sleepGoalHours, 8);
  assert.equal(profile.body.profile.sleepQualityLabel, 'Fair');
  assert.equal(profile.body.profile.smokingStatus, 'Never');
  assert.equal(profile.body.profile.alcoholFrequency, 'Never');
  assert.equal(profile.body.profile.exerciseFrequency, '3-4x/week');
  assert.equal(profile.body.profile.stressLevelLabel, 'Moderate');
  assert.deepEqual(profile.body.profile.previousConditions, ['Vitamin Deficiency']);
  assert.deepEqual(profile.body.profile.familyHistoryConditions, ['Diabetes']);
  assert.equal(profile.body.profile.medicalNotes, 'Prefers vegetarian meals.');
  assert.equal(profile.body.profile.pcosStatus, 'No');
  assert.equal(profile.body.profile.thyroidStatus, 'No');
  assert.equal(profile.body.profile.diabetesStatus, 'No');
  assert.equal(profile.body.profile.hypertensionStatus, 'No');
  assert.equal(profile.body.profile.cholesterolStatus, 'Borderline');
  assert.equal(profile.body.profile.heartConditionStatus, 'No');
  assert.deepEqual(profile.body.profile.previousSurgeries, ['None']);
  assert.equal('clientId' in profile.body.profile, false);

  const completion = await getJson(server.baseUrl, '/v1/platform/health-profile/completion?userId=platform-user', {
    headers: authHeaders(session.token)
  });
  assert.equal(completion.response.status, 200);

  const careCase = await getJson(server.baseUrl, '/v1/platform/care-cases/current?userId=platform-user', {
    headers: authHeaders(session.token)
  });
  assert.equal(careCase.response.status, 200);
});

test('PATCH /v1/platform/health-profile returns 400 for invalid body', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const { response, body } = await patchJson(server.baseUrl, '/v1/platform/health-profile', {
    heightCm: 92,
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'INVALID_INPUT');
});

test('PATCH /v1/platform/health-profile rejects unrealistic age and weight ranges', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const { response, body } = await patchJson(server.baseUrl, '/v1/platform/health-profile', {
    dateOfBirthISO: '2022-01-01T00:00:00.000Z',
    currentWeightKg: 12,
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'INVALID_INPUT');
});

test('platform ticket, timeline, events, assignment, and notifications flow works', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const seeded = await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1992-06-21T00:00:00.000Z',
      gender: 'Male',
      heightCm: 175,
      currentWeightKg: 79,
    },
    { headers: authHeaders(session.token) }
  );
  const careCaseId = seeded.body.careCase.id;

  const missing = await postJson(
    server.baseUrl,
    '/v1/platform/health-profile/request-missing-information',
    { userId: 'spoofed-user', requestedBy: 'consultant-9', fields: ['blood_reports'] },
    { headers: authHeaders(session.token) }
  );
  assert.equal(missing.response.status, 201);

  const assign = await postJson(server.baseUrl, `/v1/platform/care-cases/${careCaseId}/assign-consultant`, {
    consultantId: 'consultant-42',
    mentorId: 'mentor-4',
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(assign.response.status, 200);

  const timeline = await getJson(server.baseUrl, `/v1/platform/care-cases/${careCaseId}/timeline`, {
    headers: authHeaders(session.token)
  });
  const events = await getJson(server.baseUrl, `/v1/platform/care-cases/${careCaseId}/events`, {
    headers: authHeaders(session.token)
  });
  const tickets = await getJson(server.baseUrl, `/v1/platform/care-cases/${careCaseId}/tickets`, {
    headers: authHeaders(session.token)
  });
  const notifications = await getJson(server.baseUrl, '/v1/platform/notifications?userId=care-user', {
    headers: authHeaders(session.token)
  });

  assert.equal(timeline.response.status, 200);
  assert.equal(events.response.status, 200);
  assert.equal(tickets.response.status, 200);
  assert.equal(notifications.response.status, 200);
  assert.ok(timeline.body.items.length > 0);
  assert.ok(tickets.body.items.length > 0);
  assert.ok(notifications.body.items.length > 0);
  assert.equal('clientId' in assign.body, false);
  assert.equal('clientId' in notifications.body.items[0], false);
});

test('platform assignment returns 404 for missing care case', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const { response } = await postJson(server.baseUrl, '/v1/platform/care-cases/missing-case/assign-consultant', {
    consultantId: 'consultant-42',
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(response.status, 404);
});

test('platform routes reject missing tokens and forbid cross-client care-case access', async () => {
  const missing = await getJson(server.baseUrl, '/v1/platform/health-profile');
  assert.equal(missing.response.status, 401);

  const owner = await createAuthenticatedSession(server.baseUrl, {
    email: 'owner@example.com',
    mobileNumber: '+919876543230'
  });
  const attacker = await createAuthenticatedSession(server.baseUrl, {
    email: 'attacker@example.com',
    mobileNumber: '+919876543231'
  });
  const seeded = await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1992-06-21T00:00:00.000Z',
      gender: 'Male',
      heightCm: 175,
      currentWeightKg: 79
    },
    { headers: authHeaders(owner.token) }
  );

  const stolenTimeline = await getJson(
    server.baseUrl,
    `/v1/platform/care-cases/${seeded.body.careCase.id}/timeline`,
    { headers: authHeaders(attacker.token) }
  );
  assert.equal(stolenTimeline.response.status, 403);
  assert.equal(stolenTimeline.body.error, 'CARE_CASE_FORBIDDEN');
});
