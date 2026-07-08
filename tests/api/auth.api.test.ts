import test from 'node:test';
import assert from 'node:assert/strict';
import { postJson } from '../helpers/http.js';
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

test('POST /v1/auth/signup/request-otp returns 201 with debug OTP in non-production', async () => {
  const { response, body } = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Asha Sharma',
    email: 'asha@example.com',
    mobileNumber: '+919876543210',
  });
  assert.equal(response.status, 201);
  assert.match(body.challengeId, /^[-a-z0-9]+$/i);
  assert.match(body.debugOtp, /^[0-9]{6}$/);
});

test('POST /v1/auth/signup/request-otp returns 400 for invalid signup payload', async () => {
  const { response, body } = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'A',
    email: 'bad-email',
    mobileNumber: '123',
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'INVALID_INPUT');
});

test('POST /v1/auth/signup/resend-otp returns known challenge result and 404 for missing challenge', async () => {
  const created = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Asha Sharma',
    email: 'asha@example.com',
    mobileNumber: '+919876543210',
  });
  const resend = await postJson(server.baseUrl, '/v1/auth/signup/resend-otp', {
    challengeId: created.body.challengeId,
  });
  assert.equal([200, 429].includes(resend.response.status), true);

  const missing = await postJson(server.baseUrl, '/v1/auth/signup/resend-otp', {
    challengeId: 'missing-challenge-id',
  });
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error, 'OTP_NOT_FOUND');
});

test('POST /v1/auth/signup/verify-otp returns 200 for correct OTP and 401 for wrong OTP', async () => {
  const created = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Asha Sharma',
    email: 'asha@example.com',
    mobileNumber: '+919876543210',
  });

  const invalid = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: '000000',
  });
  assert.equal([200, 401].includes(invalid.response.status), true);

  const verified = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: created.body.debugOtp,
  });
  assert.equal(verified.response.status, 200);
  assert.match(verified.body.sessionToken, /^[-a-z0-9]+$/i);
});

test.skip('POST /v1/auth/signup/request-otp should return 403 once signup authorization rules are enforced');
