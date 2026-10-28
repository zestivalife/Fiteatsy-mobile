import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import type { AuthenticatedAccount } from '../auth/auth.repository.js';

const REQUEST_TIMEOUT_MS = 12_000;
const ASSERTION_TTL_SECONDS = 120;

export class ExternalConsultantError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

const base64Url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export const assertExternalConsultantConfiguration = () => {
  if (!env.externalConsultantsEnabled) {
    throw new ExternalConsultantError(404, 'FEATURE_DISABLED', 'External consultant connections are not enabled.');
  }
  if (!env.externalConsultantsBaseUrl || !env.externalConsultantsAssertionPrivateKey) {
    throw new ExternalConsultantError(503, 'INTEGRATION_NOT_CONFIGURED', 'External consultant connections are temporarily unavailable.', true);
  }
};

export const createFiteatsyIdentityAssertion = (account: AuthenticatedAccount, nowSeconds = Math.floor(Date.now() / 1000)) => {
  assertExternalConsultantConfiguration();
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(env.externalConsultantsAssertionKeyId ? { kid: env.externalConsultantsAssertionKeyId } : {}) }));
  const payload = base64Url(JSON.stringify({
    iss: env.externalConsultantsAssertionIssuer,
    aud: env.externalConsultantsAssertionAudience,
    sub: account.user.id,
    actor_type: 'FITEATSY_USER',
    purpose: 'consultant_connection',
    iat: nowSeconds,
    exp: nowSeconds + ASSERTION_TTL_SECONDS,
    jti: crypto.randomUUID(),
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), env.externalConsultantsAssertionPrivateKey);
  return `${unsigned}.${signature.toString('base64url')}`;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
};

export const requestExternalConsultantApi = async <T>(
  account: AuthenticatedAccount,
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const assertion = createFiteatsyIdentityAssertion(account);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${env.externalConsultantsBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${assertion}`,
        ...(options.body == null ? {} : { 'Content-Type': 'application/json' }),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      ...(options.body == null ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    throw new ExternalConsultantError(
      503,
      controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
      controller.signal.aborted ? 'The consultant service timed out. Please try again.' : 'The consultant service is unavailable.',
      true,
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; safe_message?: string; retryable?: boolean };
  } | null;
  if (!response.ok || !payload?.success) {
    throw new ExternalConsultantError(
      response.status,
      payload?.error?.code || 'UPSTREAM_ERROR',
      payload?.error?.safe_message || 'The consultant request could not be completed.',
      Boolean(payload?.error?.retryable),
    );
  }
  return payload.data as T;
};
