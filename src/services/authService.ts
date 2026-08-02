import Constants from 'expo-constants';

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

const getApiBaseUrl = () => {
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) return fromExtra;

  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (!host) return 'http://localhost:4001';
  return `http://${host}:4001`;
};

const apiBaseUrl = getApiBaseUrl();

const parseError = async (response: Response): Promise<never> => {
  let payload: { error?: ApiErrorCode; message?: string; retryAfterSec?: number } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
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
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.skipJsonBody ? {} : { 'Content-Type': 'application/json' }),
        ...(init.headers ?? {})
      }
    });
  } catch {
    throw new AuthServiceError('NETWORK_OFFLINE', 'Unable to reach the authentication service.');
  }

  if (!response.ok) {
    return parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
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
