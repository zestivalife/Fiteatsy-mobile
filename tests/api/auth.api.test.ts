import test from 'node:test';
import assert from 'node:assert/strict';
import { countClients } from '../../backend/src/modules/client/client.repository.js';
import { setOtpGeneratorForTests } from '../../backend/src/modules/auth/auth.service.js';
import { getJson, postJson } from '../helpers/http.js';
import { authHeaders } from '../helpers/auth.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;
const originalNodeEnv = process.env.NODE_ENV;
const TEST_OTP = '654321';

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  if (server) {
    await server.close();
  }
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test.beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  await resetTestState();
  setOtpGeneratorForTests(() => TEST_OTP);
});

test('POST /v1/auth/signup/request-otp returns 201 without exposing OTP debug material', async () => {
  const { response, body } = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Asha Sharma',
    email: 'asha@example.com',
    mobileNumber: '+919876543210',
  });
  assert.equal(response.status, 201);
  assert.match(body.challengeId, /^[-a-z0-9]+$/i);
  assert.equal(body.debugOtp, undefined);
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
    otp: TEST_OTP,
  });
  assert.equal(verified.response.status, 200);
  assert.match(verified.body.sessionToken, /^[-_a-z0-9]+$/i);
  assert.match(verified.body.user.id, /^[0-9a-f-]{36}$/i);
  assert.notEqual(verified.body.user.id, 'asha@example.com');

  const me = await getJson(server.baseUrl, '/v1/auth/me', {
    headers: authHeaders(verified.body.sessionToken)
  });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.accountId, verified.body.user.id);
  assert.equal(me.body.user.name, 'Asha Sharma');
  assert.equal(me.body.user.email, 'asha@example.com');
  assert.match(me.body.user.createdAtISO, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(me.body.client.fiteatsyClientId, /^fc_[a-f0-9]{32}$/i);
  assert.equal(me.body.client.status, 'active');
  assert.equal('id' in me.body.client, false);
});

test('PIN login bootstraps existing OTP users with default PIN and requires PIN change', async () => {
  const created = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Pin Bootstrap User',
    email: 'pin-bootstrap@example.com',
    mobileNumber: '+919876543214',
  });
  const otpSession = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: TEST_OTP,
  });
  assert.equal(otpSession.response.status, 200);

  const pinSession = await postJson(server.baseUrl, '/v1/auth/login/pin', {
    mobile: '919876543214',
    pin: '123456',
  });
  assert.equal(pinSession.response.status, 200);
  assert.equal(pinSession.body.requiresPinChange, true);
  assert.match(pinSession.body.sessionToken, /^[-_a-z0-9]+$/i);
  assert.equal(pinSession.body.user.id, otpSession.body.user.id);
  assert.match(pinSession.body.client.fiteatsyClientId, /^fc_[a-f0-9]{32}$/i);
});

test('PIN change rejects old PIN reuse and then allows login only with the new PIN', async () => {
  const created = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Pin Change User',
    email: 'pin-change@example.com',
    mobileNumber: '+919876543215',
  });
  await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: TEST_OTP,
  });

  const pinSession = await postJson(server.baseUrl, '/v1/auth/login/pin', {
    mobile: '919876543215',
    pin: '123456',
  });
  assert.equal(pinSession.response.status, 200);

  const reuse = await getJson(server.baseUrl, '/v1/auth/change-pin', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(pinSession.body.sessionToken)
    },
    body: JSON.stringify({
      currentPin: '123456',
      newPin: '123456',
      confirmNewPin: '123456'
    })
  });
  assert.equal(reuse.response.status, 409);
  assert.equal(reuse.body.error, 'PIN_REUSE_NOT_ALLOWED');

  const changed = await getJson(server.baseUrl, '/v1/auth/change-pin', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(pinSession.body.sessionToken)
    },
    body: JSON.stringify({
      currentPin: '123456',
      newPin: '654321',
      confirmNewPin: '654321'
    })
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.ok, true);

  const oldPin = await postJson(server.baseUrl, '/v1/auth/login/pin', {
    mobile: '919876543215',
    pin: '123456',
  });
  assert.equal(oldPin.response.status, 401);

  const newPin = await postJson(server.baseUrl, '/v1/auth/login/pin', {
    mobile: '919876543215',
    pin: '654321',
  });
  assert.equal(newPin.response.status, 200);
  assert.equal(newPin.body.requiresPinChange, false);
});

test('PIN login locks after five failed attempts', async () => {
  const created = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Pin Lock User',
    email: 'pin-lock@example.com',
    mobileNumber: '+919876543216',
  });
  await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: TEST_OTP,
  });

  for (let index = 0; index < 4; index += 1) {
    const failed = await postJson(server.baseUrl, '/v1/auth/login/pin', {
      mobile: '919876543216',
      pin: '000000',
    });
    assert.equal(failed.response.status, 401);
    assert.equal(failed.body.error, 'PIN_INVALID');
  }

  const locked = await postJson(server.baseUrl, '/v1/auth/login/pin', {
    mobile: '919876543216',
    pin: '000000',
  });
  assert.equal(locked.response.status, 423);
  assert.equal(locked.body.error, 'PIN_LOCKED');
  assert.equal(typeof locked.body.retryAfterSec, 'number');
});

test('GET /v1/auth/me rejects missing and invalid bearer tokens', async () => {
  const missing = await getJson(server.baseUrl, '/v1/auth/me');
  assert.equal(missing.response.status, 401);

  const invalid = await getJson(server.baseUrl, '/v1/auth/me', {
    headers: authHeaders('invalid-token')
  });
  assert.equal(invalid.response.status, 401);
});

test('GET /v1/auth/me does not expose the internal client primary key after M3B.1 schema changes', async () => {
  const created = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Private Client Id User',
    email: 'private-client-id@example.com',
    mobileNumber: '+919876543213',
  });

  const verified = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: TEST_OTP,
  });
  assert.equal(verified.response.status, 200);

  const me = await getJson(server.baseUrl, '/v1/auth/me', {
    headers: authHeaders(verified.body.sessionToken)
  });
  assert.equal(me.response.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(me.body.client, 'id'), false);
  assert.match(me.body.client.fiteatsyClientId, /^fc_[a-f0-9]{32}$/i);
});

test('POST /v1/auth/logout revokes the session token', async () => {
  const created = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Revoked User',
    email: 'revoked@example.com',
    mobileNumber: '+919876543211',
  });
  const verified = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: created.body.challengeId,
    otp: TEST_OTP,
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
    otp: TEST_OTP
  });
  const secondRequest = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', identity);
  const secondVerify = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: secondRequest.body.challengeId,
    otp: TEST_OTP
  });

  assert.equal(firstVerify.body.user.id, secondVerify.body.user.id);
  assert.equal(await countClients(), 1);
});

test('failed verification does not create a client and successful verification creates exactly one client', async () => {
  const requested = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
    name: 'Client Gate User',
    email: 'client-gate@example.com',
    mobileNumber: '+919876543299',
  });

  const invalid = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: requested.body.challengeId,
    otp: '111111',
  });
  assert.equal(invalid.response.status, 401);
  assert.equal(await countClients(), 0);

  const verified = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: requested.body.challengeId,
    otp: TEST_OTP,
  });
  assert.equal(verified.response.status, 200);
  assert.equal(await countClients(), 1);

  const me = await getJson(server.baseUrl, '/v1/auth/me', {
    headers: authHeaders(verified.body.sessionToken)
  });
  assert.equal(me.response.status, 200);
  assert.match(me.body.client.fiteatsyClientId, /^fc_[a-f0-9]{32}$/i);
});
