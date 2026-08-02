import { getJson, postJson } from './http.js';
import { setOtpGeneratorForTests } from '../../backend/src/modules/auth/auth.service.js';

let authSequence = 0;

export const authHeaders = (token: string) => ({
  authorization: `Bearer ${token}`
});

export const createAuthenticatedSession = async (
  baseUrl: string,
  overrides: Partial<{ name: string; email: string; mobileNumber: string }> = {}
) => {
  authSequence += 1;
  const suffix = `${Date.now()}-${authSequence}`;
  const identity = {
    name: overrides.name ?? `Test User ${authSequence}`,
    email: overrides.email ?? `user-${suffix}@example.com`,
    mobileNumber: overrides.mobileNumber ?? `+9198765${String(10000 + authSequence).padStart(5, '0')}`
  };
  const otp = '654321';
  setOtpGeneratorForTests(() => otp);

  const requested = await postJson(baseUrl, '/v1/auth/signup/request-otp', identity);
  const verified = await postJson(baseUrl, '/v1/auth/signup/verify-otp', {
    challengeId: requested.body.challengeId,
    otp
  });
  const token = String(verified.body.sessionToken);
  const current = await getJson(baseUrl, '/v1/auth/me', {
    headers: authHeaders(token)
  });

  return {
    identity,
    token,
    current
  };
};
