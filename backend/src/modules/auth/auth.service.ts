import crypto from 'node:crypto';

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
    | 'OTP_RESEND_NOT_READY'
    | 'OTP_TOO_MANY_ATTEMPTS';
  message: string;
  retryAfterSec?: number;
};

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const ACTIVE_CHALLENGE_LIMIT = 5_000;

const challengeStore = new Map<string, OtpChallenge>();

const buildOtpHash = (challengeId: string, otp: string) =>
  crypto.createHash('sha256').update(`${challengeId}:${otp}`).digest('hex');

const buildOtp = () => {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
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
  const otp = buildOtp();
  const expiresAtMs = now() + OTP_TTL_MS;
  const resendAvailableAtMs = now() + RESEND_COOLDOWN_MS;
  const challenge: OtpChallenge = {
    challengeId,
    user,
    otpHash: buildOtpHash(challengeId, otp),
    expiresAtMs,
    resendAvailableAtMs,
    attemptsRemaining: MAX_ATTEMPTS,
    verified: false
  };
  challengeStore.set(challengeId, challenge);
  return { challenge, otp };
};

export const createOtpChallenge = (input: SignupInput) => {
  pruneOldChallenges();
  const user = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    mobileNumber: input.mobileNumber.trim()
  };
  const { challenge, otp } = createOrReplaceChallenge(user);
  return {
    challengeId: challenge.challengeId,
    expiresAtISO: new Date(challenge.expiresAtMs).toISOString(),
    resendAvailableAtISO: new Date(challenge.resendAvailableAtMs).toISOString(),
    attemptsRemaining: challenge.attemptsRemaining,
    deliveryChannel: {
      emailMasked: user.email.replace(/(^.).+(@.*$)/, '$1***$2'),
      mobileMasked: user.mobileNumber.replace(/.(?=.{4})/g, '*')
    },
    debugOtp: process.env.NODE_ENV === 'production' ? undefined : otp
  };
};

export const resendOtpChallenge = (challengeId: string) => {
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

  const otp = buildOtp();
  challenge.otpHash = buildOtpHash(challenge.challengeId, otp);
  challenge.resendAvailableAtMs = current + RESEND_COOLDOWN_MS;
  challenge.expiresAtMs = current + OTP_TTL_MS;
  challenge.attemptsRemaining = MAX_ATTEMPTS;

  return {
    challengeId: challenge.challengeId,
    expiresAtISO: new Date(challenge.expiresAtMs).toISOString(),
    resendAvailableAtISO: new Date(challenge.resendAvailableAtMs).toISOString(),
    attemptsRemaining: challenge.attemptsRemaining,
    debugOtp: process.env.NODE_ENV === 'production' ? undefined : otp
  };
};

export const verifyOtpChallenge = (challengeId: string, otp: string) => {
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

  const matches = buildOtpHash(challengeId, otp) === challenge.otpHash;
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

  return {
    sessionToken: crypto.randomUUID(),
    user: {
      name: challenge.user.name,
      email: challenge.user.email,
      mobileNumber: challenge.user.mobileNumber
    }
  };
};
