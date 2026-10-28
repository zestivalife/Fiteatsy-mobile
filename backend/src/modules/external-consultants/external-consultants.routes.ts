import { type NextFunction, type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { ExternalConsultantError, requestExternalConsultantApi } from './external-consultants.service.js';

// Accept legacy eight-character invitations while all newly generated PINs are six numeric digits.
const pinSchema = z.string().trim().transform((value) => value.replace(/\s/g, '').toUpperCase()).pipe(z.string().min(6).max(32).regex(/^[A-Z0-9]+$/));
const previewSchema = z.object({ pin: pinSchema }).strict();
const redeemSchema = z.object({
  pin: pinSchema,
  consentVersion: z.literal('external-consultant-v1'),
  acceptedScopes: z.array(z.enum(['PROFILE', 'HEALTH_SUMMARY', 'MEASUREMENTS', 'BIOMARKERS', 'DIET_PLANS', 'APPOINTMENTS'])).min(1),
  idempotencyKey: z.string().uuid(),
}).strict();
const activePlanSchema = z.object({ publicationId: z.string().uuid() }).strict();

export const externalConsultantsRouter = Router();
externalConsultantsRouter.use(requireAuthenticatedAccount);

const handle = (res: Response, next: NextFunction, error: unknown) => {
  if (error instanceof ExternalConsultantError) {
    return res.status(error.status).json({ error: error.code, message: error.message, retryable: error.retryable });
  }
  return next(error);
};

externalConsultantsRouter.get('/feature-status', (_req, res) => {
  return res.status(200).json({ enabled: env.externalConsultantsEnabled });
});

externalConsultantsRouter.post('/preview', async (req, res, next) => {
  const parsed = previewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_PIN_FORMAT', message: 'Enter the complete Connection PIN.' });
  try {
    const data = await requestExternalConsultantApi(getAuthenticatedAccount(req), '/api/v1/fiteatsy-connections/preview', {
      method: 'POST',
      body: { pin: parsed.data.pin, purpose: 'CONSULTANT_CONNECTION_PIN' },
    });
    return res.status(200).json(data);
  } catch (error) { return handle(res, next, error); }
});

externalConsultantsRouter.post('/redeem', async (req, res, next) => {
  const parsed = redeemSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_CONNECTION_REQUEST', message: 'Review the PIN and consent selections.' });
  try {
    const data = await requestExternalConsultantApi(getAuthenticatedAccount(req), '/api/v1/fiteatsy-connections/redeem', {
      method: 'POST',
      idempotencyKey: parsed.data.idempotencyKey,
      body: {
        pin: parsed.data.pin,
        purpose: 'CONSULTANT_CONNECTION_PIN',
        consent_version: parsed.data.consentVersion,
        accepted_scopes: parsed.data.acceptedScopes,
      },
    });
    return res.status(201).json(data);
  } catch (error) { return handle(res, next, error); }
});

externalConsultantsRouter.get('/', async (req, res, next) => {
  try { return res.status(200).json(await requestExternalConsultantApi(getAuthenticatedAccount(req), '/api/v1/fiteatsy-connections')); }
  catch (error) { return handle(res, next, error); }
});

for (const child of ['', '/diet-plans', '/appointments']) {
  externalConsultantsRouter.get(`/:connectionId${child}`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = encodeURIComponent(String(req.params.connectionId));
      return res.status(200).json(await requestExternalConsultantApi(getAuthenticatedAccount(req), `/api/v1/fiteatsy-connections/${id}${child}`));
    } catch (error) { return handle(res, next, error); }
  });
}

externalConsultantsRouter.put('/:connectionId/diet-plans/active', async (req, res, next) => {
  const parsed = activePlanSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_DIET_PLAN_SELECTION', message: 'Choose a valid published diet plan.' });
  try {
    const id = encodeURIComponent(String(req.params.connectionId));
    return res.status(200).json(await requestExternalConsultantApi(getAuthenticatedAccount(req), `/api/v1/fiteatsy-connections/${id}/diet-plans/active`, {
      method: 'PUT', body: { publication_id: parsed.data.publicationId }
    }));
  } catch (error) { return handle(res, next, error); }
});

externalConsultantsRouter.delete('/:connectionId', async (req, res, next) => {
  try {
    const id = encodeURIComponent(String(req.params.connectionId));
    return res.status(200).json(await requestExternalConsultantApi(getAuthenticatedAccount(req), `/api/v1/fiteatsy-connections/${id}`, { method: 'DELETE' }));
  } catch (error) { return handle(res, next, error); }
});
