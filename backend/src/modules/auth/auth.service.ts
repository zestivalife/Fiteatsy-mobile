import crypto from 'node:crypto';
import { createAuthSession, resolveVerifiedAccountIdentity } from './auth.repository.js';
import { NotificationService } from '../notifications/notification.service.js';
import { OtpDeliveryError } from '../notifications/notification.types.js';
import { normalizeCanonicalPhoneNumber } from '../../utils/phone.js';

type SignupInput = {
  name: string;
  email: string;
  mobileNumber: string;
};

type OtpChallenge = {
  challengeId: string;
  user: SignupInput;
  otpHash: string;
  expiresAtMs: number;
  resendAvailableAtMs: number;
  attemptsRemaining: number;
  verified: boolean;
};

export type OtpDomainError = {
  code:
    | 'OTP_NOT_FOUND'
    | 'OTP_EXPIRED'
    | 'OTP_INVALID'
    | 'OTP_DELIVERY_FAILED'
    | 'OTP_RATE_LIMITED'
    | 'OTP_RESEND_NOT_READY'
    | 'OTP_TOO_MANY_ATTEMPTS'
    | 'AUTH_CONTACT_CONFLICT';
  message: string;
  retryAfterSec?: number;
};

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const OTP_REQUEST_LIMIT_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const ACTIVE_CHALLENGE_LIMIT = 5_000;

const challengeStore = new Map<string, OtpChallenge>();
const otpRequestTimestampsByMobile = new Map<string, number[]>();

export const buildOtpHashForTests = (challengeId: string, otp: string) =>
  crypto.createHash('sha256').update(`${challengeId}:${otp}`).digest('hex');

let otpGenerator: () => string = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export const buildOtpForTests = () => otpGenerator();

export const setOtpGeneratorForTests = (generator: (() => string) | null) => {
  otpGenerator = generator ?? (() => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'));
};

const now = () => Date.now();

const pruneOldChallenges = () => {
  const current = now();
  for (const [key, challenge] of challengeStore.entries()) {
    if (challenge.verified || challenge.expiresAtMs + 10 * 60 * 1000 < current) {
      challengeStore.delete(key);
    }
  }
  if (challengeStore.size <= ACTIVE_CHALLENGE_LIMIT) return;
  const overflow = challengeStore.size - ACTIVE_CHALLENGE_LIMIT;
  const keys = Array.from(challengeStore.keys()).slice(0, overflow);
  for (const key of keys) challengeStore.delete(key);
};

const asDomainError = (error: OtpDomainError): OtpDomainError => error;

const createOrReplaceChallenge = (user: SignupInput) => {
  const challengeId = crypto.randomUUID();
  const otp = buildOtpForTests();
  const expiresAtMs = now() + OTP_TTL_MS;
  const resendAvailableAtMs = now() + RESEND_COOLDOWN_MS;
  const challenge: OtpChallenge = {
    challengeId,
    user,
    otpHash: buildOtpHashForTests(challengeId, otp),
    expiresAtMs,
    resendAvailableAtMs,
    attemptsRemaining: MAX_ATTEMPTS,
    verified: false
  };
  return { challenge, otp };
};

const normalizeRateLimitKey = (mobileNumber: string) => mobileNumber.replace(/\D/g, '');

const assertOtpRequestQuota = (mobileNumber: string) => {
  const current = now();
  const key = normalizeRateLimitKey(mobileNumber);
  const recentRequests = (otpRequestTimestampsByMobile.get(key) ?? []).filter(
    (timestamp) => current - timestamp < OTP_RATE_LIMIT_WINDOW_MS
  );
  if (recentRequests.length >= OTP_REQUEST_LIMIT_PER_HOUR) {
    otpRequestTimestampsByMobile.set(key, recentRequests);
    throw asDomainError({
      code: 'OTP_RATE_LIMITED',
      message: 'Too many OTP requests. Please try again later.',
      retryAfterSec: Math.ceil((OTP_RATE_LIMIT_WINDOW_MS - (current - recentRequests[0])) / 1000)
    });
  }
  recentRequests.push(current);
  otpRequestTimestampsByMobile.set(key, recentRequests);
};

const deliveryFailureToDomainError = (error: unknown): OtpDomainError => {
  if (error instanceof OtpDeliveryError) {
    return {
      code: 'OTP_DELIVERY_FAILED',
      message: 'Unable to deliver OTP. Please try again shortly.'
    };
  }
  throw error;
};

export const createOtpChallenge = async (input: SignupInput) => {
  pruneOldChallenges();
  const user = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    mobileNumber: normalizeCanonicalPhoneNumber(input.mobileNumber)
  };
  assertOtpRequestQuota(user.mobileNumber);
  const { challenge, otp } = createOrReplaceChallenge(user);
  try {
    await NotificationService.sendOTP({
      challengeId: challenge.challengeId,
      mobileNumber: user.mobileNumber,
      otp
    });
  } catch (error) {
    throw asDomainError(deliveryFailureToDomainError(error));
  }
  challengeStore.set(challenge.challengeId, challenge);
  return {
    challengeId: challenge.challengeId,
    expiresAtISO: new Date(challenge.expiresAtMs).toISOString(),
    resendAvailableAtISO: new Date(challenge.resendAvailableAtMs).toISOString(),
    attemptsRemaining: challenge.attemptsRemaining,
    deliveryChannel: {
      emailMasked: user.email.replace(/(^.).+(@.*$)/, '$1***$2'),
      mobileMasked: user.mobileNumber.replace(/.(?=.{4})/g, '*')
    }
  };
};

export const resendOtpChallenge = async (challengeId: string) => {
  pruneOldChallenges();
  const challenge = challengeStore.get(challengeId);
  if (!challenge) throw asDomainError({ code: 'OTP_NOT_FOUND', message: 'Challenge not found.' });

  const current = now();
  if (current > challenge.expiresAtMs) throw asDomainError({ code: 'OTP_EXPIRED', message: 'OTP expired. Please restart signup.' });
  if (current < challenge.resendAvailableAtMs) {
    throw asDomainError({
      code: 'OTP_RESEND_NOT_READY',
      message: 'Please wait before requesting another OTP.',
      retryAfterSec: Math.ceil((challenge.resendAvailableAtMs - current) / 1000)
    });
  }

  assertOtpRequestQuota(challenge.user.mobileNumber);
  const otp = buildOtpForTests();
  const nextOtpHash = buildOtpHashForTests(challenge.challengeId, otp);
  try {
    await NotificationService.sendOTP({
      challengeId: challenge.challengeId,
      mobileNumber: challenge.user.mobileNumber,
      otp
    });
  } catch (error) {
    throw asDomainError(deliveryFailureToDomainError(error));
  }

  challenge.otpHash = nextOtpHash;
  challenge.resendAvailableAtMs = current + RESEND_COOLDOWN_MS;
  challenge.expiresAtMs = current + OTP_TTL_MS;
  challenge.attemptsRemaining = MAX_ATTEMPTS;

  return {
    challengeId: challenge.challengeId,
    expiresAtISO: new Date(challenge.expiresAtMs).toISOString(),
    resendAvailableAtISO: new Date(challenge.resendAvailableAtMs).toISOString(),
    attemptsRemaining: challenge.attemptsRemaining
  };
};

export const verifyOtpChallenge = async (
  challengeId: string,
  otp: string,
  metadata: { userAgent?: string | null; ipAddress?: string | null } = {}
) => {
  pruneOldChallenges();
  const challenge = challengeStore.get(challengeId);
  if (!challenge) throw asDomainError({ code: 'OTP_NOT_FOUND', message: 'Challenge not found.' });

  const current = now();
  if (current > challenge.expiresAtMs) {
    challengeStore.delete(challengeId);
    throw asDomainError({ code: 'OTP_EXPIRED', message: 'OTP expired. Please request a new OTP.' });
  }

  if (challenge.attemptsRemaining <= 0) {
    throw asDomainError({
      code: 'OTP_TOO_MANY_ATTEMPTS',
      message: 'Too many invalid attempts. Please request a new OTP.',
      retryAfterSec: Math.ceil((challenge.resendAvailableAtMs - current) / 1000)
    });
  }

  const matches = buildOtpHashForTests(challengeId, otp) === challenge.otpHash;
  if (!matches) {
    challenge.attemptsRemaining -= 1;
    throw asDomainError({
      code: challenge.attemptsRemaining <= 0 ? 'OTP_TOO_MANY_ATTEMPTS' : 'OTP_INVALID',
      message:
        challenge.attemptsRemaining <= 0
          ? 'Too many invalid attempts. Please request a new OTP.'
          : 'Invalid OTP. Please try again.',
      retryAfterSec:
        challenge.attemptsRemaining <= 0 ? Math.ceil((challenge.resendAvailableAtMs - current) / 1000) : undefined
    });
  }

  challenge.verified = true;
  challengeStore.delete(challengeId);
  try {
    const { user } = await resolveVerifiedAccountIdentity({
      name: challenge.user.name,
      email: challenge.user.email,
      mobileNumber: challenge.user.mobileNumber
    });
    const { token } = await createAuthSession(user.id, metadata);

    return {
      sessionToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email ?? challenge.user.email,
        mobileNumber: user.mobileNumber ?? challenge.user.mobileNumber
      }
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AUTH_CONTACT_CONFLICT') {
      throw asDomainError({
        code: 'AUTH_CONTACT_CONFLICT',
        message: 'This email or mobile number is already linked to another account.'
      });
    }
    throw error;
  }
};

export const resetOtpChallengesForTests = () => {
  challengeStore.clear();
  otpRequestTimestampsByMobile.clear();
  setOtpGeneratorForTests(null);
};

export const expireOtpChallengeForTests = (challengeId: string) => {
  const challenge = challengeStore.get(challengeId);
  if (challenge) {
    challenge.expiresAtMs = now() - 1;
  }
};
