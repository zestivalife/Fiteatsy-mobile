import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../backend/src/server.js';
import {
  buildOtpForTests,
  buildOtpHashForTests,
  expireOtpChallengeForTests,
  resetOtpChallengesForTests,
  setOtpGeneratorForTests
} from '../../backend/src/modules/auth/auth.service.js';
import { createPingMateProvider } from '../../backend/src/modules/notifications/pingmate.provider.js';
import { OtpDeliveryError } from '../../backend/src/modules/notifications/notification.types.js';
import { resetWhatsappProviderForTests, setWhatsappProviderForTests } from '../../backend/src/modules/notifications/notification.service.js';
import { postJson } from '../helpers/http.js';
import { startAppServer } from '../helpers/appServer.js';

const withEnv = async (overrides: Record<string, string | undefined>, run: () => Promise<void>) => {
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

const signupPayload = {
  name: 'Pingmate User',
  email: 'pingmate-user@example.com',
  mobileNumber: '+919876543210'
};

test('OTP generation returns six digits and OTP hashing is challenge scoped', async () => {
  await withEnv(
    {
      NODE_ENV: 'production'
    },
    async () => {
      const otp = buildOtpForTests();
      assert.match(otp, /^[0-9]{6}$/);
      assert.equal(buildOtpHashForTests('challenge-a', '123456'), buildOtpHashForTests('challenge-a', '123456'));
      assert.notEqual(buildOtpHashForTests('challenge-a', '123456'), buildOtpHashForTests('challenge-b', '123456'));
      assert.notEqual(buildOtpHashForTests('challenge-a', '123456'), '123456');
    }
  );
});

test('PingMate provider sends the required WhatsApp template payload without hardcoded credentials', async () => {
  await withEnv(
    {
      PINGMATE_API_KEY: 'test-pingmate-key',
      PINGMATE_BASE_URL: 'https://pingmate.test/api/v1',
      PINGMATE_TEMPLATE: 'auth_otp',
      PINGMATE_LANGUAGE: 'en'
    },
    async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;
      const capturedLogs: unknown[] = [];
      const originalInfo = console.info;
      console.info = (...args: unknown[]) => {
        capturedLogs.push(args);
      };
      const provider = createPingMateProvider(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify({ ok: true, id: 'provider-message-1' }), {
          status: 200,
          headers: { 'x-request-id': 'provider-request-1' }
        });
      });

      let result;
      try {
        result = await provider.sendOtp({
          challengeId: 'challenge-id',
          mobileNumber: '+91 98765 43210',
          otp: '123456'
        });
      } finally {
        console.info = originalInfo;
      }

      assert.equal(result.status, 'sent');
      assert.equal(result.providerResponseCode, 200);
      assert.equal(result.providerRequestId, 'provider-request-1');
      assert.equal(capturedUrl, 'https://pingmate.test/api/v1/messages/send');
      assert.equal((capturedInit?.headers as Record<string, string>)['X-API-Key'], 'test-pingmate-key');
      assert.equal((capturedInit?.headers as Record<string, string>)['Content-Type'], 'application/json');
      assert.equal(capturedInit?.method, 'POST');

      const body = JSON.parse(String(capturedInit?.body));
      assert.equal(body.to, '919876543210');
      assert.deepEqual(body.message.body_variables, ['123456']);
      assert.equal(body.message.message_type, 'template');
      assert.equal(body.message.template_name, 'auth_otp');
      assert.equal(body.message.template_language, 'en');
      assert.equal(body.message.buttons[0].button_payload, '123456');
      assert.deepEqual(body.message.buttons[0], {
        button_type: 'url',
        button_index: 0,
        button_payload: '123456'
      });

      const serializedLogs = JSON.stringify(capturedLogs);
      assert.match(serializedLogs, /PingMate OTP request/);
      assert.match(serializedLogs, /PingMate OTP response/);
      assert.match(serializedLogs, /sanitizedOutgoingPayload/);
      assert.match(serializedLogs, /body_variables_count/);
      assert.match(serializedLogs, /buttons_present/);
      assert.match(serializedLogs, /outboundRequestBody/);
      assert.match(serializedLogs, /provider-request-1/);
      assert.doesNotMatch(serializedLogs, /test-pingmate-key/);
      assert.doesNotMatch(serializedLogs, /123456/);
      assert.doesNotMatch(serializedLogs, /919876543210/);
    }
  );
});

test('PingMate provider accepts a configured full send endpoint without duplicating the path', async () => {
  await withEnv(
    {
      PINGMATE_API_KEY: 'test-pingmate-key',
      PINGMATE_BASE_URL: 'https://api.pingmate.app/api/v1/messages/send'
    },
    async () => {
      let capturedUrl = '';
      const provider = createPingMateProvider(async (url) => {
        capturedUrl = String(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      await provider.sendOtp({ challengeId: 'challenge-id', mobileNumber: '+919876543210', otp: '123456' });
      assert.equal(capturedUrl, 'https://api.pingmate.app/api/v1/messages/send');
    }
  );
});

test('PingMate provider logs sanitized provider rejection bodies for diagnostics', async () => {
  await withEnv(
    {
      PINGMATE_API_KEY: 'test-pingmate-key',
      PINGMATE_BASE_URL: 'https://pingmate.test/api/v1',
      PINGMATE_TEMPLATE: 'auth_otp',
      PINGMATE_LANGUAGE: 'en'
    },
    async () => {
      const capturedWarnings: unknown[] = [];
      const capturedInfo: unknown[] = [];
      const originalWarn = console.warn;
      const originalInfo = console.info;
      console.warn = (...args: unknown[]) => {
        capturedWarnings.push(args);
      };
      console.info = (...args: unknown[]) => {
        capturedInfo.push(args);
      };
      const provider = createPingMateProvider(async () =>
        new Response(
          JSON.stringify({
            error: 'Template auth_otp rejected for 919876543210 with otp 123456'
          }),
          {
            status: 422,
            headers: { 'x-request-id': 'provider-reject-1' }
          }
        )
      );

      try {
        await assert.rejects(
          () =>
            provider.sendOtp({
              challengeId: 'challenge-id',
              mobileNumber: '+91 98765 43210',
              otp: '123456'
            }),
          (error: unknown) =>
            error instanceof OtpDeliveryError &&
            error.providerResponseCode === 422 &&
            error.providerRequestId === 'provider-reject-1' &&
            error.providerResponseBody?.includes('[REDACTED_OTP]') === true &&
            error.providerResponseBody?.includes('[REDACTED_PHONE]') === true
        );
      } finally {
        console.warn = originalWarn;
        console.info = originalInfo;
      }

      const serializedLogs = JSON.stringify([...capturedInfo, ...capturedWarnings]);
      assert.match(serializedLogs, /provider-reject-1/);
      assert.match(serializedLogs, /\[REDACTED_OTP\]/);
      assert.match(serializedLogs, /\[REDACTED_PHONE\]/);
      assert.doesNotMatch(serializedLogs, /test-pingmate-key/);
      assert.doesNotMatch(serializedLogs, /123456/);
      assert.doesNotMatch(serializedLogs, /919876543210/);
    }
  );
});

test('PingMate provider fails closed when production credentials are missing', async () => {
  await withEnv(
    {
      PINGMATE_API_KEY: undefined
    },
    async () => {
      const provider = createPingMateProvider();
      await assert.rejects(
        () =>
          provider.sendOtp({
            challengeId: 'challenge-id',
            mobileNumber: '+919876543210',
            otp: '123456'
          }),
        (error: unknown) => error instanceof OtpDeliveryError && error.name === 'OTP_DELIVERY_FAILED'
      );
    }
  );
});

test('OTP request returns OTP_DELIVERY_FAILED when provider delivery fails', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      OTP_DEBUG_RESPONSE_ENABLED: undefined
    },
    async () => {
      setWhatsappProviderForTests({
        async sendOtp() {
          throw new OtpDeliveryError('provider failed', {
            provider: 'test-whatsapp',
            providerResponseCode: 503,
            latencyMs: 2
          });
        }
      });

      const server = await startAppServer(createApp());
      try {
        const { response, body } = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', signupPayload);
        assert.equal(response.status, 502);
        assert.equal(body.error, 'OTP_DELIVERY_FAILED');
        assert.equal(body.debugOtp, undefined);
      } finally {
        await server.close();
      }
    }
  );
});

test('OTP request invalid input returns safe validation details', async () => {
  await withEnv(
    {
      NODE_ENV: 'test'
    },
    async () => {
      const server = await startAppServer(createApp());
      try {
        const { response, body } = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
          name: 'A',
          email: 'not-an-email',
          mobileNumber: '123'
        });
        assert.equal(response.status, 400);
        assert.equal(body.error, 'INVALID_INPUT');
        assert.equal(body.message, 'Please check the highlighted fields and try again.');
        assert.equal(Array.isArray(body.details.fieldErrors.name), true);
        assert.equal(Array.isArray(body.details.fieldErrors.email), true);
        assert.equal(Array.isArray(body.details.fieldErrors.mobileNumber), true);
      } finally {
        await server.close();
      }
    }
  );
});

test('OTP expiry rejects verification without creating a session', async () => {
  await withEnv(
    {
      NODE_ENV: 'test'
    },
    async () => {
      setOtpGeneratorForTests(() => '654321');
      const server = await startAppServer(createApp());
      try {
        const requested = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', signupPayload);
        assert.equal(requested.response.status, 201);
        await expireOtpChallengeForTests(requested.body.challengeId);

        const verified = await postJson(server.baseUrl, '/v1/auth/signup/verify-otp', {
          challengeId: requested.body.challengeId,
          otp: '654321'
        });
        assert.equal(verified.response.status, 410);
        assert.equal(verified.body.error, 'OTP_EXPIRED');
      } finally {
        await server.close();
      }
    }
  );
});

test('OTP request rate limit allows five requests per hour per mobile number', async () => {
  await withEnv(
    {
      NODE_ENV: 'test'
    },
    async () => {
      const server = await startAppServer(createApp());
      try {
        for (let index = 0; index < 5; index += 1) {
          const requested = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
            ...signupPayload,
            email: `rate-limit-${index}@example.com`
          });
          assert.equal(requested.response.status, 201);
          await expireOtpChallengeForTests(requested.body.challengeId);
        }

        const limited = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
          ...signupPayload,
          email: 'rate-limit-final@example.com'
        });
        assert.equal(limited.response.status, 429);
        assert.equal(limited.body.error, 'OTP_RATE_LIMITED');
      } finally {
        await server.close();
      }
    }
  );
});

test('OTP request cooldown blocks duplicate WhatsApp sends for an active challenge', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      OTP_DEBUG_RESPONSE_ENABLED: undefined
    },
    async () => {
      let deliveryAttempts = 0;
      setWhatsappProviderForTests({
        async sendOtp() {
          deliveryAttempts += 1;
          return {
            status: 'sent',
            provider: 'test-whatsapp',
            providerResponseCode: 201,
            latencyMs: 1
          };
        }
      });

      const server = await startAppServer(createApp());
      try {
        const first = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', signupPayload);
        assert.equal(first.response.status, 201);
        assert.match(first.body.challengeId, /^[-a-z0-9]+$/i);

        const duplicate = await postJson(server.baseUrl, '/v1/auth/signup/request-otp', {
          ...signupPayload,
          email: 'duplicate-attempt@example.com'
        });
        assert.equal(duplicate.response.status, 429);
        assert.equal(duplicate.body.error, 'OTP_RESEND_NOT_READY');
        assert.equal(typeof duplicate.body.retryAfterSec, 'number');
        assert.equal(deliveryAttempts, 1);
      } finally {
        await server.close();
      }
    }
  );
});
