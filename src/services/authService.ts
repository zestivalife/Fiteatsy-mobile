import { apiBaseUrl } from './apiClient';

type SignupRequestParams = {
  name: string;
  email: string;
  mobileNumber: string;
};

type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'OTP_NOT_FOUND'
  | 'OTP_EXPIRED'
  | 'OTP_INVALID'
  | 'OTP_DELIVERY_FAILED'
  | 'OTP_RATE_LIMITED'
  | 'OTP_RESEND_NOT_READY'
  | 'OTP_TOO_MANY_ATTEMPTS'
  | 'AUTH_CONTACT_CONFLICT'
  | 'NETWORK_OFFLINE'
  | 'SERVER_ERROR';

export type AuthSessionResponse = {
  sessionToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    mobileNumber: string;
  };
};

export type CurrentAuthSession = {
  accountId: string;
  sessionId: string;
  sessionExpiresAtISO: string;
  client: {
    fiteatsyClientId: string;
    status: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    mobileNumber: string;
  };
};

export class AuthServiceError extends Error {
  code: ApiErrorCode;
  retryAfterSec?: number;

  constructor(code: ApiErrorCode, message: string, retryAfterSec?: number) {
    super(message);
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

const AUTH_LOG_PREFIX = '[AuthService]';
const REDACTED = '[REDACTED]';

const sanitizeAuthPayload = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuthPayload);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        const normalizedKey = key.toLowerCase();
        if (
          normalizedKey.includes('authorization') ||
          normalizedKey.includes('token') ||
          normalizedKey === 'otp' ||
          normalizedKey.includes('phonenumber') ||
          normalizedKey.includes('mobile')
        ) {
          return [key, REDACTED];
        }
        return [key, sanitizeAuthPayload(entry)];
      })
    );
  }

  return value;
};

const parseError = async (response: Response, url: string): Promise<never> => {
  let payload: { error?: ApiErrorCode; message?: string; retryAfterSec?: number } = {};
  let responseText = '';
  try {
    responseText = await response.text();
    payload = responseText ? (JSON.parse(responseText) as typeof payload) : {};
    console.warn(`${AUTH_LOG_PREFIX} ERROR RESPONSE`, {
      url,
      status: response.status,
      responseJson: sanitizeAuthPayload(payload)
    });
  } catch (error) {
    console.error(`${AUTH_LOG_PREFIX} ERROR RESPONSE PARSE FAILED`, {
      url,
      status: response.status,
      responseText,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    payload = {};
  }
  throw new AuthServiceError(
    payload.error ?? 'SERVER_ERROR',
    payload.message ?? 'Unable to complete authentication request.',
    payload.retryAfterSec
  );
};

const requestJson = async <T>(
  path: string,
  init: RequestInit & { skipJsonBody?: boolean } = {}
): Promise<T> => {
  let response: Response;
  const url = `${apiBaseUrl}${path}`;
  const method = init.method ?? 'GET';
  console.log(`${AUTH_LOG_PREFIX} REQUEST`, { apiBaseUrl, url, method });
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init.skipJsonBody ? {} : { 'Content-Type': 'application/json' }),
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    console.error(`${AUTH_LOG_PREFIX} FETCH FAILED`, {
      apiBaseUrl,
      url,
      method,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new AuthServiceError('NETWORK_OFFLINE', `Unable to reach the authentication service at ${apiBaseUrl}.`);
  }

  console.log(`${AUTH_LOG_PREFIX} RESPONSE STATUS`, { url, status: response.status });

  if (!response.ok) {
    return parseError(response, url);
  }

  if (response.status === 204) {
    console.log(`${AUTH_LOG_PREFIX} RESPONSE EMPTY`, { url, status: response.status });
    return undefined as T;
  }

  let responseText = '';
  try {
    responseText = await response.text();
    const payload = (responseText ? JSON.parse(responseText) : undefined) as T;
    console.log(`${AUTH_LOG_PREFIX} RESPONSE JSON`, {
      url,
      status: response.status,
      responseJson: sanitizeAuthPayload(payload)
    });
    return payload;
  } catch (error) {
    console.error(`${AUTH_LOG_PREFIX} RESPONSE PARSE FAILED`, {
      url,
      status: response.status,
      responseText,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new AuthServiceError('SERVER_ERROR', 'Authentication service returned an unreadable response.');
  }
};

export type SignupOtpResponse = {
  challengeId: string;
  expiresAtISO: string;
  resendAvailableAtISO: string;
  attemptsRemaining: number;
  deliveryChannel: {
    emailMasked: string;
    mobileMasked: string;
  };
};

export const requestSignupOtp = (params: SignupRequestParams) =>
  requestJson<SignupOtpResponse>('/v1/auth/signup/request-otp', {
    method: 'POST',
    body: JSON.stringify(params)
  });

export const resendSignupOtp = (challengeId: string) =>
  requestJson<SignupOtpResponse>('/v1/auth/signup/resend-otp', {
    method: 'POST',
    body: JSON.stringify({ challengeId })
  });

export const verifySignupOtp = (challengeId: string, otp: string) =>
  requestJson<AuthSessionResponse>('/v1/auth/signup/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ challengeId, otp })
  });

export const getCurrentAuthSession = (sessionToken: string) =>
  requestJson<CurrentAuthSession>('/v1/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`
    },
    skipJsonBody: true
  });

export const logoutAuthSession = (sessionToken: string) =>
  requestJson<void>('/v1/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify({})
  });
