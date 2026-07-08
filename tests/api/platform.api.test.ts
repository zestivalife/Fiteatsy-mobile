import test from 'node:test';
import assert from 'node:assert/strict';
import { getJson, patchJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server.close();
});

test.beforeEach(() => {
  resetTestState();
});

test('platform endpoints return 404 before health profile exists', async () => {
  const profile = await getJson(server.baseUrl, '/v1/platform/health-profile?userId=no-profile');
  assert.equal(profile.response.status, 404);

  const careCase = await getJson(server.baseUrl, '/v1/platform/care-cases/current?userId=no-profile');
  assert.equal(careCase.response.status, 404);
});

test('PATCH /v1/platform/health-profile creates bundle and GET endpoints return 200', async () => {
  const patched = await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1990-04-12T00:00:00.000Z',
      gender: 'Female',
      heightCm: 164,
      currentWeightKg: 62,
    },
    { headers: { 'x-user-id': 'platform-user' } }
  );
  assert.equal(patched.response.status, 200);
  assert.equal(patched.body.profile.userId, 'platform-user');

  const profile = await getJson(server.baseUrl, '/v1/platform/health-profile?userId=platform-user');
  assert.equal(profile.response.status, 200);

  const completion = await getJson(server.baseUrl, '/v1/platform/health-profile/completion?userId=platform-user');
  assert.equal(completion.response.status, 200);

  const careCase = await getJson(server.baseUrl, '/v1/platform/care-cases/current?userId=platform-user');
  assert.equal(careCase.response.status, 200);
});

test('PATCH /v1/platform/health-profile returns 400 for invalid body', async () => {
  const { response, body } = await patchJson(server.baseUrl, '/v1/platform/health-profile', {
    heightCm: -10,
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'INVALID_INPUT');
});

test('platform ticket, timeline, events, assignment, and notifications flow works', async () => {
  const seeded = await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1992-06-21T00:00:00.000Z',
      gender: 'Male',
      heightCm: 175,
      currentWeightKg: 79,
    },
    { headers: { 'x-user-id': 'care-user' } }
  );
  const careCaseId = seeded.body.careCase.id;

  const missing = await postJson(
    server.baseUrl,
    '/v1/platform/health-profile/request-missing-information',
    { userId: 'care-user', requestedBy: 'consultant-9', fields: ['blood_reports'] }
  );
  assert.equal(missing.response.status, 201);

  const assign = await postJson(server.baseUrl, `/v1/platform/care-cases/${careCaseId}/assign-consultant`, {
    consultantId: 'consultant-42',
    mentorId: 'mentor-4',
  });
  assert.equal(assign.response.status, 200);

  const timeline = await getJson(server.baseUrl, `/v1/platform/care-cases/${careCaseId}/timeline`);
  const events = await getJson(server.baseUrl, `/v1/platform/care-cases/${careCaseId}/events`);
  const tickets = await getJson(server.baseUrl, `/v1/platform/care-cases/${careCaseId}/tickets`);
  const notifications = await getJson(server.baseUrl, '/v1/platform/notifications?userId=care-user');

  assert.equal(timeline.response.status, 200);
  assert.equal(events.response.status, 200);
  assert.equal(tickets.response.status, 200);
  assert.equal(notifications.response.status, 200);
  assert.ok(timeline.body.items.length > 0);
  assert.ok(tickets.body.items.length > 0);
  assert.ok(notifications.body.items.length > 0);
});

test('platform assignment returns 404 for missing care case', async () => {
  const { response } = await postJson(server.baseUrl, '/v1/platform/care-cases/missing-case/assign-consultant', {
    consultantId: 'consultant-42',
  });
  assert.equal(response.status, 404);
});

test.skip('platform routes should return 401 and 403 once role-based authorization is enabled');
