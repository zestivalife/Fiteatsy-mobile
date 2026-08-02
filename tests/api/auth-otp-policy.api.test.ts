import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../backend/src/server.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { resetOtpChallengesForTests } from '../../backend/src/modules/auth/auth.service.js';
import { resetWhatsappProviderForTests, setWhatsappProviderForTests } from '../../backend/src/modules/notifications/notification.service.js';
import { authHeaders } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
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
    resetOtpChallengesForTests();
    resetWhatsappProviderForTests();
    await run();
  } finally {
    resetOtpChallengesForTests();
    resetWhatsappProviderForTests();
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const useSuccessfulOtpDeliveryProvider = () => {
  setWhatsappProviderForTests({
    async sendOtp() {
      return {
        status: 'sent',
        provider: 'test-whatsapp',
        providerResponseCode: 200,
        latencyMs: 1
      };
    }
  });
};

const signupPayload = {
  name: 'Asha Sharma',
  email: 'asha@example.com',
  mobileNumber: '+919876543210'
};

const isConnectionRefused = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === 'ECONNREFUSED') return true;
  if ('errors' in error && Array.isArray(error.errors)) {
    return error.errors.some((innerError) => isConnectionRefused(innerError));
  }
  return false;
};

test('production never exposes debug OTP even if explicitly enabled', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      OTP_DEBUG_RESPONSE_ENABLED: 'true'
    },
    async () => {
      useSuccessfulOtpDeliveryProvider();
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
      useSuccessfulOtpDeliveryProvider();
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
      useSuccessfulOtpDeliveryProvider();
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

test('local development issues fixed OTP 123456 and rejects any other OTP', async () => {
  await withEnv(
    {
      NODE_ENV: 'development',
      RAILWAY_PROJECT_ID: undefined,
      RAILWAY_SERVICE_ID: undefined,
      RAILWAY_ENVIRONMENT_ID: undefined,
      RAILWAY_ENVIRONMENT_NAME: undefined,
      RAILWAY_ENVIRONMENT: undefined,
      OTP_DEBUG_RESPONSE_ENABLED: 'true'
    },
    async () => {
      useSuccessfulOtpDeliveryProvider();
      const server = await startAppServer(createApp());
      const requested = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
        ...signupPayload,
        email: 'dev-fixed-otp@example.com',
        mobileNumber: '+919876543211'
      });

      try {
        assert.equal(requested.response.status, 201);
        assert.equal(requested.body.debugOtp, '123456');

        const invalid = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
          challengeId: requested.body.challengeId,
          otp: '654321'
        });
        assert.equal(invalid.response.status, 401);
        assert.equal(invalid.body.error, 'OTP_INVALID');
      } finally {
        await server.close();
      }
    }
  );
});

test('local development fixed OTP still creates a persisted session and current client', async (t) => {
  await withEnv(
    {
      NODE_ENV: 'development',
      RAILWAY_PROJECT_ID: undefined,
      RAILWAY_SERVICE_ID: undefined,
      RAILWAY_ENVIRONMENT_ID: undefined,
      RAILWAY_ENVIRONMENT_NAME: undefined,
      RAILWAY_ENVIRONMENT: undefined,
      OTP_DEBUG_RESPONSE_ENABLED: 'true'
    },
    async () => {
      try {
        await resetBackendStateForTests();
      } catch (error) {
        if (isConnectionRefused(error)) {
          t.skip('Local PostgreSQL is unavailable; session/client verification requires the test database.');
          return;
        }
        throw error;
      }

      const server = await startAppServer(createApp());
      const requested = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
        ...signupPayload,
        email: 'dev-fixed-session@example.com',
        mobileNumber: '+919876543213'
      });

      try {
        assert.equal(requested.response.status, 201);
        assert.equal(requested.body.debugOtp, '123456');
        const verified = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
          challengeId: requested.body.challengeId,
          otp: '123456'
        });
        assert.equal(verified.response.status, 200);
        assert.match(verified.body.sessionToken, /^[-a-z0-9]+$/i);

        const me = await getJson(server.baseUrl, '/v1/auth/me', {
          headers: authHeaders(verified.body.sessionToken)
        });
        assert.equal(me.response.status, 200);
        assert.equal(me.body.user.email, 'dev-fixed-session@example.com');
        assert.match(me.body.client.fiteatsyClientId, /^fc_[a-f0-9]{32}$/i);
        assert.equal(me.body.client.status, 'active');
      } finally {
        await server.close();
      }
    }
  );
});

test('production rejects development fixed OTP when it was not the generated challenge OTP', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      OTP_DEBUG_RESPONSE_ENABLED: 'true'
    },
    async () => {
      useSuccessfulOtpDeliveryProvider();
      const server = await startAppServer(createApp());
      const requested = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
        ...signupPayload,
        email: 'prod-no-fixed-otp@example.com',
        mobileNumber: '+919876543212'
      });

      try {
        assert.equal(requested.response.status, 201);
        assert.equal(requested.body.debugOtp, undefined);

        const verified = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
          challengeId: requested.body.challengeId,
          otp: '123456'
        });
        assert.equal(verified.response.status, 401);
        assert.equal(verified.body.error, 'OTP_INVALID');
      } finally {
        await server.close();
      }
    }
  );
});
