import { Router } from 'express';
import { z } from 'zod';
import {
  createOtpChallenge,
  resendOtpChallenge,
  verifyOtpChallenge,
  type OtpDomainError
} from './auth.service.js';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from './auth.middleware.js';
import { revokeAuthSession } from './auth.repository.js';

const signupRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(180),
  mobileNumber: z.string().trim().regex(/^\+?[0-9]{10,15}$/)
});

const otpResendSchema = z.object({
  challengeId: z.string().trim().min(10).max(120)
});

const otpVerifySchema = z.object({
  challengeId: z.string().trim().min(10).max(120),
  otp: z.string().trim().regex(/^[0-9]{6}$/)
});

const toHttpStatus = (code: OtpDomainError['code']): number => {
  if (code === 'OTP_NOT_FOUND') return 404;
  if (code === 'OTP_EXPIRED') return 410;
  if (code === 'OTP_INVALID') return 401;
  if (code === 'OTP_DELIVERY_FAILED') return 502;
  if (code === 'AUTH_CONTACT_CONFLICT') return 409;
  if (code === 'OTP_RESEND_NOT_READY' || code === 'OTP_TOO_MANY_ATTEMPTS' || code === 'OTP_RATE_LIMITED') return 429;
  return 400;
};

export const authRouter = Router();

authRouter.post('/signup/request-otp', async (req, res) => {
  const parsed = signupRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      details: parsed.error.flatten()
    });
  }

  try {
    const result = await createOtpChallenge(parsed.data);
    return res.status(201).json(result);
  } catch (error) {
    const domainError = error as OtpDomainError;
    return res.status(toHttpStatus(domainError.code)).json({
      error: domainError.code,
      message: domainError.message,
      retryAfterSec: domainError.retryAfterSec ?? undefined
    });
  }
});

authRouter.post('/signup/resend-otp', async (req, res) => {
  const parsed = otpResendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      details: parsed.error.flatten()
    });
  }

  try {
    const result = await resendOtpChallenge(parsed.data.challengeId);
    return res.status(200).json(result);
  } catch (error) {
    const domainError = error as OtpDomainError;
    return res.status(toHttpStatus(domainError.code)).json({
      error: domainError.code,
      message: domainError.message,
      retryAfterSec: domainError.retryAfterSec ?? undefined
    });
  }
});

authRouter.post('/signup/verify-otp', async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      details: parsed.error.flatten()
    });
  }

  try {
    const result = await verifyOtpChallenge(parsed.data.challengeId, parsed.data.otp, {
      userAgent: req.header('user-agent') ?? null,
      ipAddress: req.ip || null
    });
    return res.status(200).json(result);
  } catch (error) {
    const domainError = error as OtpDomainError;
    return res.status(toHttpStatus(domainError.code)).json({
      error: domainError.code,
      message: domainError.message,
      retryAfterSec: domainError.retryAfterSec ?? undefined
    });
  }
});

authRouter.get('/me', requireAuthenticatedAccount, (req, res) => {
  const account = getAuthenticatedAccount(req);
  return res.status(200).json({
    accountId: account.accountId,
    sessionId: account.sessionId,
    sessionExpiresAtISO: account.sessionExpiresAtISO,
    client: {
      fiteatsyClientId: account.client.fiteatsyClientId,
      status: account.client.status
    },
    user: {
      id: account.user.id,
      name: account.user.name,
      email: account.user.email,
      mobileNumber: account.user.mobileNumber
    }
  });
});

authRouter.post('/logout', requireAuthenticatedAccount, async (req, res) => {
  const account = getAuthenticatedAccount(req);
  await revokeAuthSession(account.sessionId);
  return res.status(204).send();
});
