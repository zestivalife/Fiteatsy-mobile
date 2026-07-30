import test from 'node:test';
import assert from 'node:assert/strict';
import { getJson, postJson } from '../helpers/http.js';
import { authHeaders } from '../helpers/auth.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;
const originalOtpDebugFlag = process.env.OTP_DEBUG_RESPONSE_ENABLED;
const originalNodeEnv = process.env.NODE_ENV;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  if (server) {
    await server.close();
  }
  if (originalOtpDebugFlag === undefined) delete process.env.OTP_DEBUG_RESPONSE_ENABLED;
  else process.env.OTP_DEBUG_RESPONSE_ENABLED = originalOtpDebugFlag;

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test.beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  process.env.OTP_DEBUG_RESPONSE_ENABLED = 'true';
  await resetTestState();
});

test('POST /v1/auth/signup/request-otp returns 201 with debug OTP when explicitly enabled outside production', async () => {
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

test('POST /v1/auth/signup/verify-otp issues a persisted session and GET /v1/auth/me returns the server account', async () => {
  const created = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Asha Sharma',
    email: 'asha@example.com',
    mobileNumber: '+919876543210',
  });

  const invalid = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: '000000',
  });
  assert.equal(invalid.response.status, 401);

  const verified = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: created.body.debugOtp,
  });
  assert.equal(verified.response.status, 200);
  assert.match(verified.body.sessionToken, /^[-a-z0-9]+$/i);
  assert.match(verified.body.user.id, /^[0-9a-f-]{36}$/i);
  assert.notEqual(verified.body.user.id, 'asha@example.com');

  const me = await getJson(server.baseUrl, '/v1/auth/me', {
    headers: authHeaders(verified.body.sessionToken)
  });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.accountId, verified.body.user.id);
  assert.equal(me.body.user.email, 'asha@example.com');
});

test('GET /v1/auth/me rejects missing and invalid bearer tokens', async () => {
  const missing = await getJson(server.baseUrl, '/v1/auth/me');
  assert.equal(missing.response.status, 401);

  const invalid = await getJson(server.baseUrl, '/v1/auth/me', {
    headers: authHeaders('invalid-token')
  });
  assert.equal(invalid.response.status, 401);
});

test('POST /v1/auth/logout revokes the session token', async () => {
  const created = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Revoked User',
    email: 'revoked@example.com',
    mobileNumber: '+919876543211',
  });
  const verified = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: created.body.debugOtp,
  });

  const logout = await postJson(server.baseUrl, '/v1/auth/logout', {}, {
    headers: authHeaders(verified.body.sessionToken)
  });
  assert.equal(logout.response.status, 204);

  const me = await getJson(server.baseUrl, '/v1/auth/me', {
    headers: authHeaders(verified.body.sessionToken)
  });
  assert.equal(me.response.status, 401);
});

test('verified signup resolves the same persisted account when the same contact signs in again', async () => {
  const identity = {
    name: 'Repeat User',
    email: 'repeat@example.com',
    mobileNumber: '+919876543212'
  };
  const firstRequest = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', identity);
  const firstVerify = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: firstRequest.body.challengeId,
    otp: firstRequest.body.debugOtp
  });
  const secondRequest = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', identity);
  const secondVerify = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: secondRequest.body.challengeId,
    otp: secondRequest.body.debugOtp
  });

  assert.equal(firstVerify.body.user.id, secondVerify.body.user.id);
});
