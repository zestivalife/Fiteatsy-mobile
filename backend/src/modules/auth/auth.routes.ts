import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  createOtpChallenge,
  changePin,
  loginWithPin,
  resendOtpChallenge,
  verifyOtpChallenge,
  type OtpDomainError
} from './auth.service.js';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from './auth.middleware.js';
import { revokeAuthSession } from './auth.repository.js';
import {
  assertQaHandoffExchangeRate,
  exchangeQaAdminSessionHandoff,
  QA_ADMIN_HANDOFF_PURPOSE
} from './qa-session-handoff.js';
import { exchangeQaBrowserHandoff, QA_DIET_HYDRATION_PURPOSE } from './qa-browser-handoff.js';

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

const pinLoginSchema = z.object({
  mobile: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
  pin: z.string().trim().regex(/^[0-9]{6}$/)
});

const changePinSchema = z.object({
  currentPin: z.string().trim().regex(/^[0-9]{6}$/),
  newPin: z.string().trim().regex(/^[0-9]{6}$/),
  confirmNewPin: z.string().trim().regex(/^[0-9]{6}$/)
}).refine((value) => value.newPin === value.confirmNewPin, {
  message: 'PIN confirmation does not match.',
  path: ['confirmNewPin']
});

const qaSessionHandoffExchangeSchema = z.object({
  code: z.string().trim().min(40).max(120),
  targetUserId: z.string().uuid(),
  purpose: z.literal(QA_ADMIN_HANDOFF_PURPOSE)
}).strict();
const qaBrowserHandoffExchangeSchema = z.object({
  code: z.string().trim().min(40).max(120),
  fixtureSetId: z.string().uuid(),
  role: z.enum(['consultant', 'senior_consultant']),
  purpose: z.literal(QA_DIET_HYDRATION_PURPOSE)
}).strict();

const toHttpStatus = (code: OtpDomainError['code']): number => {
  if (code === 'OTP_NOT_FOUND') return 404;
  if (code === 'OTP_EXPIRED') return 410;
  if (code === 'OTP_INVALID') return 401;
  if (code === 'OTP_DELIVERY_FAILED') return 502;
  if (code === 'AUTH_CONTACT_CONFLICT') return 409;
  if (code === 'PIN_USER_NOT_FOUND' || code === 'PIN_INVALID') return 401;
  if (code === 'PIN_LOCKED') return 423;
  if (code === 'PIN_REUSE_NOT_ALLOWED') return 409;
  if (code === 'OTP_RESEND_NOT_READY' || code === 'OTP_TOO_MANY_ATTEMPTS' || code === 'OTP_RATE_LIMITED') return 429;
  return 400;
};

const validationErrorResponse = (error: z.ZodError) => ({
  error: 'INVALID_INPUT',
  message: 'Please check the highlighted fields and try again.',
  details: error.flatten()
});

export const authRouter = Router();

authRouter.post('/qa-browser-handoff/exchange', async (req, res) => {
  const expectedSecret = process.env.QA_BROWSER_BOOTSTRAP_SHARED_SECRET;
  const suppliedSecret = req.header('x-qa-bootstrap-secret');
  if (!expectedSecret || !suppliedSecret || suppliedSecret.length !== expectedSecret.length
    || !crypto.timingSafeEqual(Buffer.from(suppliedSecret), Buffer.from(expectedSecret))) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  const parsed = qaBrowserHandoffExchangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(validationErrorResponse(parsed.error));
  try {
    const result = await exchangeQaBrowserHandoff({ ...parsed.data, userAgent: req.header('user-agent') ?? null, ipAddress: req.ip || null });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.status(200).json(result);
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return res.status(typed.status ?? 401).json({ error: typed.code ?? 'QA_HANDOFF_DENIED', message: 'The QA browser handoff is invalid.' });
  }
});

authRouter.post('/qa-session-handoff/exchange', async (req, res) => {
  const parsed = qaSessionHandoffExchangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(validationErrorResponse(parsed.error));
  try {
    await assertQaHandoffExchangeRate(req.ip || 'unknown');
    const result = await exchangeQaAdminSessionHandoff({
      ...parsed.data,
      userAgent: req.header('user-agent') ?? null,
      ipAddress: req.ip || null
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.status(200).json(result);
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string; retryAfterSec?: number };
    if (typed.retryAfterSec) res.setHeader('Retry-After', String(typed.retryAfterSec));
    return res.status(typed.status ?? 401).json({
      error: typed.code ?? 'QA_HANDOFF_DENIED',
      message: typed.status === 429 ? typed.message : 'The QA session handoff is invalid.',
      retryAfterSec: typed.retryAfterSec
    });
  }
});

authRouter.post('/login/pin', async (req, res) => {
  const parsed = pinLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }

  try {
    const result = await loginWithPin(parsed.data, {
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

authRouter.post('/signup/request-otp', async (req, res) => {
  const parsed = signupRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
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
    return res.status(400).json(validationErrorResponse(parsed.error));
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
    return res.status(400).json(validationErrorResponse(parsed.error));
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
    qaSession: account.qaSession,
    client: {
      fiteatsyClientId: account.client.fiteatsyClientId,
      status: account.client.status
    },
    user: {
      id: account.user.id,
      name: account.user.name,
      email: account.user.email,
      mobileNumber: account.user.mobileNumber,
      role: account.user.role,
      accountPurpose: account.user.accountPurpose,
      createdAtISO: account.user.createdAtISO
    }
  });
});

authRouter.put('/change-pin', requireAuthenticatedAccount, async (req, res) => {
  const parsed = changePinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }

  try {
    const account = getAuthenticatedAccount(req);
    const result = await changePin(
      account.user.id,
      {
        currentPin: parsed.data.currentPin,
        newPin: parsed.data.newPin
      },
      {
        userAgent: req.header('user-agent') ?? null,
        ipAddress: req.ip || null
      }
    );
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

authRouter.post('/logout', requireAuthenticatedAccount, async (req, res) => {
  const account = getAuthenticatedAccount(req);
  await revokeAuthSession(account.sessionId);
  return res.status(204).send();
});
