import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../backend/src/server.js';
import { postJson } from '../helpers/http.js';
import { startAppServer } from '../helpers/appServer.js';

const withEnv = async (
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>
) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const signupPayload = {
  name: 'Asha Sharma',
  email: 'asha@example.com',
  mobileNumber: '+919876543210'
};

test('production never exposes debug OTP even if explicitly enabled', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      OTP_DEBUG_RESPONSE_ENABLED: 'true'
    },
    async () => {
      const server = await startAppServer(createApp());
      const { response, body } = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', signupPayload);
      try {
        assert.equal(response.status, 201);
        assert.equal(body.debugOtp, undefined);
      } finally {
        await server.close();
      }
    }
  );
});

test('non-production does not expose debug OTP without explicit opt-in', async () => {
  await withEnv(
    {
      NODE_ENV: 'staging',
      OTP_DEBUG_RESPONSE_ENABLED: undefined
    },
    async () => {
      const server = await startAppServer(createApp());
      const { response, body } = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', signupPayload);
      try {
        assert.equal(response.status, 201);
        assert.equal(body.debugOtp, undefined);
      } finally {
        await server.close();
      }
    }
  );
});

test('non-production exposes debug OTP only when explicit opt-in is enabled', async () => {
  await withEnv(
    {
      NODE_ENV: 'staging',
      OTP_DEBUG_RESPONSE_ENABLED: 'true'
    },
    async () => {
      const server = await startAppServer(createApp());
      const { response, body } = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', signupPayload);
      try {
        assert.equal(response.status, 201);
        assert.match(body.debugOtp, /^[0-9]{6}$/);
      } finally {
        await server.close();
      }
    }
  );
});
