import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  createAuthEvent,
  createAuthSession,
  findUserByIdForPin,
  findUserByMobileNumberForPin,
  normalizeUserMobileNumber,
  recordPinFailure,
  resetPinFailureState,
  resolveVerifiedAccountIdentity,
  setUserPinHash
} from './auth.repository.js';
import { createOrResolveClientForAccount } from '../client/client.repository.js';
import { createOrUpdateHealthProfile } from '../platform/platform.store.js';
import { NotificationService } from '../notifications/notification.service.js';
import { OtpDeliveryError } from '../notifications/notification.types.js';
import { normalizeCanonicalPhoneNumber } from '../../utils/phone.js';
import { otpStore, type StoredOtpChallenge } from './otp-store.js';

type SignupInput = {
  name: string;
  email: string;
  mobileNumber: string;
};

type OtpChallenge = StoredOtpChallenge;

export type OtpDomainError = {
  code:
    | 'OTP_NOT_FOUND'
    | 'OTP_EXPIRED'
    | 'OTP_INVALID'
    | 'OTP_DELIVERY_FAILED'
    | 'OTP_RATE_LIMITED'
    | 'OTP_RESEND_NOT_READY'
    | 'OTP_TOO_MANY_ATTEMPTS'
    | 'AUTH_CONTACT_CONFLICT'
    | 'PIN_USER_NOT_FOUND'
    | 'PIN_INVALID'
    | 'PIN_LOCKED'
    | 'PIN_REUSE_NOT_ALLOWED';
  message: string;
  retryAfterSec?: number;
};

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const OTP_REQUEST_LIMIT_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const DEFAULT_PIN = '123456';
const PIN_LENGTH = 6;
const PIN_LOCK_MS = 15 * 60 * 1000;
const PIN_BCRYPT_ROUNDS = 12;

const ensureClientHealthProfile = async (userId: string, clientId: string) => {
  await createOrUpdateHealthProfile({ accountId: userId, clientId }, {});
};


export const buildOtpHashForTests = (challengeId: string, otp: string) =>
  crypto.createHash('sha256').update(`${challengeId}:${otp}`).digest('hex');

let otpGenerator: () => string = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export const buildOtpForTests = () => otpGenerator();

export const setOtpGeneratorForTests = (generator: (() => string) | null) => {
  otpGenerator = generator ?? (() => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'));
};

const now = () => Date.now();

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

const findActiveChallengeForMobile = async (mobileNumber: string) => {
  const id = await otpStore.getActiveId(normalizeRateLimitKey(mobileNumber));
  return id ? otpStore.get(id) : null;
};

const invalidateActiveChallengesForMobile = async (mobileNumber: string) => {
  await otpStore.invalidateMobile(normalizeRateLimitKey(mobileNumber));
};

const assertOtpRequestQuota = async (mobileNumber: string) => {
  const current = now();
  const key = normalizeRateLimitKey(mobileNumber);
  const recentRequests = (await otpStore.rateTimestamps(key)).filter(
    (timestamp) => current - timestamp < OTP_RATE_LIMIT_WINDOW_MS
  );
  if (recentRequests.length >= OTP_REQUEST_LIMIT_PER_HOUR) {
    throw asDomainError({
      code: 'OTP_RATE_LIMITED',
      message: 'Too many OTP requests. Please try again later.',
      retryAfterSec: Math.ceil((OTP_RATE_LIMIT_WINDOW_MS - (current - recentRequests[0])) / 1000)
    });
  }
  recentRequests.push(current);
  await otpStore.recordRateTimestamp(key, current, OTP_RATE_LIMIT_WINDOW_MS);
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

const assertPinShape = (pin: string) => {
  if (!new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin)) {
    throw asDomainError({ code: 'PIN_INVALID', message: 'PIN must be exactly 6 digits.' });
  }
};

const buildPinLockError = (lockedUntilISO: string): OtpDomainError => {
  const retryAfterSec = Math.max(1, Math.ceil((new Date(lockedUntilISO).getTime() - now()) / 1000));
  return {
    code: 'PIN_LOCKED',
    message: 'Too many attempts. Try again later.',
    retryAfterSec
  };
};

const recordFailedPinLogin = async (
  userId: string,
  metadata: { reason: string; userAgent?: string | null; ipAddress?: string | null }
) => {
  const lockUntilISO = new Date(now() + PIN_LOCK_MS).toISOString();
  const user = await recordPinFailure(userId, {
    maxAttempts: MAX_ATTEMPTS,
    lockUntilISO
  });
  await createAuthEvent({
    userId,
    event: 'PIN_LOGIN_FAILED',
    metadata: { reason: metadata.reason, failedAttempts: user.pinFailedAttempts },
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress
  });
  if (user.pinLockedUntilISO && new Date(user.pinLockedUntilISO).getTime() > now()) {
    throw asDomainError(buildPinLockError(user.pinLockedUntilISO));
  }
  throw asDomainError({ code: 'PIN_INVALID', message: 'Incorrect PIN. Please try again.' });
};

export const createOtpChallenge = async (input: SignupInput) => {
  const user = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    mobileNumber: normalizeCanonicalPhoneNumber(input.mobileNumber)
  };
  const activeChallenge = await findActiveChallengeForMobile(user.mobileNumber);
  const current = now();
  if (activeChallenge && current < activeChallenge.resendAvailableAtMs) {
    throw asDomainError({
      code: 'OTP_RESEND_NOT_READY',
      message: 'Please wait before requesting another OTP.',
      retryAfterSec: Math.ceil((activeChallenge.resendAvailableAtMs - current) / 1000)
    });
  }
  await invalidateActiveChallengesForMobile(user.mobileNumber);
  await assertOtpRequestQuota(user.mobileNumber);
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
  await otpStore.set(challenge, OTP_TTL_MS);
  await otpStore.setActiveId(user.mobileNumber, challenge.challengeId, OTP_TTL_MS);
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
  const challenge = await otpStore.get(challengeId);
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

  await assertOtpRequestQuota(challenge.user.mobileNumber);
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
  await otpStore.set(challenge, OTP_TTL_MS);
  await otpStore.setActiveId(challenge.user.mobileNumber, challenge.challengeId, OTP_TTL_MS);

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
  const challenge = await otpStore.get(challengeId);
  if (!challenge) throw asDomainError({ code: 'OTP_NOT_FOUND', message: 'Challenge not found.' });

  const current = now();
  if (current > challenge.expiresAtMs) {
    await otpStore.delete(challengeId);
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
    await otpStore.set(challenge, Math.max(1, challenge.expiresAtMs - current));
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
  await otpStore.delete(challengeId);
  try {
    const { user } = await resolveVerifiedAccountIdentity({
      name: challenge.user.name,
      email: challenge.user.email,
      mobileNumber: challenge.user.mobileNumber
    });
    const { token } = await createAuthSession(user.id, metadata);
    const client = await createOrResolveClientForAccount(user.id);
    await ensureClientHealthProfile(user.id, client.id);

    return {
      sessionToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email ?? challenge.user.email,
        mobileNumber: user.mobileNumber ?? challenge.user.mobileNumber
      },
      client: {
        fiteatsyClientId: client.fiteatsyClientId,
        status: client.status
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

export const loginWithPin = async (
  input: { mobile: string; pin: string },
  metadata: { userAgent?: string | null; ipAddress?: string | null } = {}
) => {
  const mobileNumber = normalizeCanonicalPhoneNumber(input.mobile);
  const pin = input.pin.trim();
  assertPinShape(pin);

  const user = await findUserByMobileNumberForPin(mobileNumber);
  if (!user) {
    throw asDomainError({ code: 'PIN_USER_NOT_FOUND', message: 'No existing account found for this mobile number.' });
  }
  if (user.mobileNumber !== mobileNumber) {
    await normalizeUserMobileNumber(user.id, mobileNumber);
  }

  if (user.pinLockedUntilISO && new Date(user.pinLockedUntilISO).getTime() > now()) {
    throw asDomainError(buildPinLockError(user.pinLockedUntilISO));
  }

  let pinUser = user;
  let requiresPinChange = user.forcePinChange;
  if (!user.pinHash) {
    if (pin !== DEFAULT_PIN) {
      await recordFailedPinLogin(user.id, { reason: 'default_pin_mismatch', ...metadata });
    }
    pinUser = await setUserPinHash(user.id, await bcrypt.hash(DEFAULT_PIN, PIN_BCRYPT_ROUNDS), {
      forcePinChange: true
    });
    requiresPinChange = true;
  } else {
    const matches = await bcrypt.compare(pin, user.pinHash);
    if (!matches) {
      await recordFailedPinLogin(user.id, { reason: 'pin_mismatch', ...metadata });
    }
  }

  await resetPinFailureState(pinUser.id);
  await createAuthEvent({
    userId: pinUser.id,
    event: 'PIN_LOGIN_SUCCESS',
    metadata: { requiresPinChange },
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress
  });
  const { token } = await createAuthSession(pinUser.id, metadata);
  const client = await createOrResolveClientForAccount(pinUser.id);
  await ensureClientHealthProfile(pinUser.id, client.id);

  return {
    sessionToken: token,
    requiresPinChange,
    user: {
      id: pinUser.id,
      name: pinUser.name,
      email: pinUser.email ?? '',
      mobileNumber: pinUser.mobileNumber ?? mobileNumber
    },
    client: {
      fiteatsyClientId: client.fiteatsyClientId,
      status: client.status
    }
  };
};

export const changePin = async (
  userId: string,
  input: { currentPin: string; newPin: string },
  metadata: { userAgent?: string | null; ipAddress?: string | null } = {}
) => {
  const currentPin = input.currentPin.trim();
  const newPin = input.newPin.trim();
  assertPinShape(currentPin);
  assertPinShape(newPin);

  const user = await findUserByIdForPin(userId);
  if (!user) {
    throw asDomainError({ code: 'PIN_USER_NOT_FOUND', message: 'Authenticated account was not found.' });
  }
  if (user.pinLockedUntilISO && new Date(user.pinLockedUntilISO).getTime() > now()) {
    throw asDomainError(buildPinLockError(user.pinLockedUntilISO));
  }

  const currentHash = user.pinHash ?? (await bcrypt.hash(DEFAULT_PIN, PIN_BCRYPT_ROUNDS));
  const currentMatches = user.pinHash ? await bcrypt.compare(currentPin, currentHash) : currentPin === DEFAULT_PIN;
  if (!currentMatches) {
    await recordFailedPinLogin(user.id, { reason: 'change_pin_current_mismatch', ...metadata });
  }

  if (user.pinHash && (await bcrypt.compare(newPin, user.pinHash))) {
    throw asDomainError({ code: 'PIN_REUSE_NOT_ALLOWED', message: 'Choose a new PIN you have not used before.' });
  }
  if (!user.pinHash && newPin === DEFAULT_PIN) {
    throw asDomainError({ code: 'PIN_REUSE_NOT_ALLOWED', message: 'Choose a new PIN you have not used before.' });
  }

  await setUserPinHash(user.id, await bcrypt.hash(newPin, PIN_BCRYPT_ROUNDS), {
    forcePinChange: false
  });
  await createAuthEvent({
    userId: user.id,
    event: 'PIN_CHANGED',
    metadata: {},
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress
  });

  return { ok: true };
};

export const resetOtpChallengesForTests = () => {
  otpStore.resetForTests();
  setOtpGeneratorForTests(null);
};

export const expireOtpChallengeForTests = async (challengeId: string) => {
  const challenge = await otpStore.get(challengeId);
  if (challenge) {
    challenge.expiresAtMs = now() - 1;
    await otpStore.set(challenge, 1);
  }
};
