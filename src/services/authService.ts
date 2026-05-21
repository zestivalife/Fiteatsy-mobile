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
  | 'OTP_RESEND_NOT_READY'
  | 'OTP_TOO_MANY_ATTEMPTS'
  | 'NETWORK_OFFLINE'
  | 'SERVER_ERROR';

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

type OfflineChallenge = {
  challengeId: string;
  name: string;
  email: string;
  mobileNumber: string;
  otp: string;
  expiresAtISO: string;
  resendAvailableAtISO: string;
  attemptsRemaining: number;
};

const offlineChallenges = new Map<string, OfflineChallenge>();

const maskEmail = (email: string) => {
  const [name, domain] = email.toLowerCase().split('@');
  if (!name || !domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

const maskMobile = (mobileNumber: string) => {
  const digits = mobileNumber.replace(/\D/g, '');
  if (digits.length < 4) return mobileNumber;
  return `+${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const createOfflineChallenge = (params: SignupRequestParams): SignupOtpResponse => {
  const now = Date.now();
  const challengeId = `offline-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
  const expiresAtISO = new Date(now + 5 * 60 * 1000).toISOString();
  const resendAvailableAtISO = new Date(now + 30 * 1000).toISOString();
  offlineChallenges.set(challengeId, {
    challengeId,
    name: params.name.trim(),
    email: params.email.trim().toLowerCase(),
    mobileNumber: params.mobileNumber.trim(),
    otp,
    expiresAtISO,
    resendAvailableAtISO,
    attemptsRemaining: 5
  });
  return {
    challengeId,
    expiresAtISO,
    resendAvailableAtISO,
    attemptsRemaining: 5,
    deliveryChannel: {
      emailMasked: maskEmail(params.email),
      mobileMasked: maskMobile(params.mobileNumber)
    },
    debugOtp: otp
  };
};

const resendOfflineChallenge = (challengeId: string): SignupOtpResponse => {
  const existing = offlineChallenges.get(challengeId);
  if (!existing) {
    throw new AuthServiceError('OTP_NOT_FOUND', 'OTP challenge not found. Please request a new OTP.');
  }
  const now = Date.now();
  const nextResendAt = new Date(existing.resendAvailableAtISO).getTime();
  if (now < nextResendAt) {
    throw new AuthServiceError('OTP_RESEND_NOT_READY', 'Please wait before requesting another OTP.', Math.ceil((nextResendAt - now) / 1000));
  }
  const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
  const expiresAtISO = new Date(now + 5 * 60 * 1000).toISOString();
  const resendAvailableAtISO = new Date(now + 30 * 1000).toISOString();
  const updated: OfflineChallenge = {
    ...existing,
    otp,
    expiresAtISO,
    resendAvailableAtISO,
    attemptsRemaining: 5
  };
  offlineChallenges.set(challengeId, updated);
  return {
    challengeId,
    expiresAtISO,
    resendAvailableAtISO,
    attemptsRemaining: 5,
    deliveryChannel: {
      emailMasked: maskEmail(updated.email),
      mobileMasked: maskMobile(updated.mobileNumber)
    },
    debugOtp: otp
  };
};

const verifyOfflineChallenge = (challengeId: string, otp: string) => {
  const challenge = offlineChallenges.get(challengeId);
  if (!challenge) {
    throw new AuthServiceError('OTP_NOT_FOUND', 'OTP challenge not found. Please request a new OTP.');
  }
  const now = Date.now();
  if (now > new Date(challenge.expiresAtISO).getTime()) {
    throw new AuthServiceError('OTP_EXPIRED', 'OTP expired. Please request a new OTP.');
  }
  if (challenge.attemptsRemaining <= 0) {
    throw new AuthServiceError('OTP_TOO_MANY_ATTEMPTS', 'Too many failed attempts. Please resend OTP.');
  }
  if (challenge.otp !== otp.trim()) {
    const updated: OfflineChallenge = {
      ...challenge,
      attemptsRemaining: challenge.attemptsRemaining - 1
    };
    offlineChallenges.set(challengeId, updated);
    throw new AuthServiceError('OTP_INVALID', 'Invalid OTP. Please try again.');
  }
  offlineChallenges.delete(challengeId);
  return {
    sessionToken: `offline-session-${Date.now()}`,
    user: {
      name: challenge.name,
      email: challenge.email,
      mobileNumber: challenge.mobileNumber
    }
  };
};

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

const post = async <T>(path: string, body: Record<string, string>): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new AuthServiceError('NETWORK_OFFLINE', 'You appear to be offline. Please check internet and retry.');
  }
  if (!response.ok) {
    return parseError(response);
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
  debugOtp?: string;
};

export const requestSignupOtp = (params: SignupRequestParams) =>
  post<SignupOtpResponse>('/v1/auth/signup/request-otp', params).catch((err) => {
    if (err instanceof AuthServiceError && err.code === 'NETWORK_OFFLINE') {
      return createOfflineChallenge(params);
    }
    throw err;
  });

export const resendSignupOtp = (challengeId: string) =>
  post<SignupOtpResponse>('/v1/auth/signup/resend-otp', { challengeId }).catch((err) => {
    if (err instanceof AuthServiceError && err.code === 'NETWORK_OFFLINE' && challengeId.startsWith('offline-')) {
      return resendOfflineChallenge(challengeId);
    }
    throw err;
  });

export const verifySignupOtp = (challengeId: string, otp: string) =>
  post<{ sessionToken: string; user: { name: string; email: string; mobileNumber: string } }>('/v1/auth/signup/verify-otp', {
    challengeId,
    otp
  }).catch((err) => {
    if (err instanceof AuthServiceError && err.code === 'NETWORK_OFFLINE' && challengeId.startsWith('offline-')) {
      return verifyOfflineChallenge(challengeId, otp);
    }
    throw err;
  });
