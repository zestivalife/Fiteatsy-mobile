import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
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

const createConsultantSession = async () => {
  const session = await createAuthenticatedSession(server.baseUrl, {
    name: 'Onboarding Consultant',
    email: `onboarding-consultant-${Date.now()}@example.test`
  });
  await pool.query('update users set role = $2 where id = $1', [session.current.body.accountId, 'consultant']);
  return session;
};

test('consultant onboarding routes require authentication and a consultant role', async () => {
  const unauthenticated = await getJson(server.baseUrl, '/v1/consultants/onboarding');
  assert.equal(unauthenticated.response.status, 401);

  const ordinaryUser = await createAuthenticatedSession(server.baseUrl);
  const forbidden = await getJson(server.baseUrl, '/v1/consultants/onboarding', {
    headers: authHeaders(ordinaryUser.token)
  });
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.body.error, 'ROLE_NOT_ALLOWED');
});

test('GET onboarding is registered and returns the governed repository error when no record exists', async () => {
  const consultant = await createConsultantSession();
  const response = await getJson(server.baseUrl, '/v1/consultants/onboarding', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 404);
  assert.equal(response.body.error, 'EXTERNAL_ONBOARDING_NOT_FOUND');
  assert.match(response.body.message, /onboarding was not found/i);
});

test('onboarding mutation routes reject invalid input before repository mutation', async () => {
  const consultant = await createConsultantSession();
  const headers = { headers: authHeaders(consultant.token) };

  const update = await patchJson(server.baseUrl, '/v1/consultants/onboarding', { version: 0 }, headers);
  assert.equal(update.response.status, 400);
  assert.equal(update.body.error, 'INVALID_ONBOARDING_INPUT');

  const completion = await postJson(
    server.baseUrl,
    '/v1/consultants/onboarding/complete',
    { version: 1, unexpected: true },
    headers
  );
  assert.equal(completion.response.status, 400);
  assert.equal(completion.body.error, 'INVALID_ONBOARDING_INPUT');
});
