import crypto from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { verifyRazorpayWebhookSignature } from './razorpay.provider.js';
import {
  SubscriptionDomainError,
  createCheckout,
  getCurrentSubscription,
  getPaymentHistory,
  getSubscriptionPlans,
  processRazorpayWebhook,
  verifyRazorpayPayment
} from './subscriptions.service.js';

export const subscriptionsRouter = Router();
export const paymentsRouter = Router();
export const razorpayWebhookRouter = Router();

const checkoutSchema = z.object({
  planId: z.string().trim().min(1),
  source: z.string().trim().min(1).max(80).optional(),
  returnDestination: z.string().trim().min(1).max(120).optional(),
  idempotencyKey: z.string().trim().min(8).max(160).optional()
});

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().trim().min(1),
  razorpay_payment_id: z.string().trim().min(1),
  razorpay_signature: z.string().trim().min(1)
});

const handleDomainError = (res: express.Response, error: unknown) => {
  if (error instanceof SubscriptionDomainError) {
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
      metadata: error.metadata
    });
  }
  return res.status(500).json({
    error: 'SUBSCRIPTION_REQUEST_FAILED',
    message: error instanceof Error ? error.message : 'Subscription request failed.'
  });
};

subscriptionsRouter.get('/plans', async (_req, res) => {
  const plans = await getSubscriptionPlans();
  return res.status(200).json(plans);
});

subscriptionsRouter.use(requireAuthenticatedAccount);

subscriptionsRouter.get('/current', async (req, res) => {
  const current = await getCurrentSubscription(getAuthenticatedAccount(req));
  return res.status(200).json(current);
});

subscriptionsRouter.post('/checkout', async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }
  try {
    const checkout = await createCheckout(getAuthenticatedAccount(req), parsed.data);
    return res.status(201).json(checkout);
  } catch (error) {
    return handleDomainError(res, error);
  }
});

paymentsRouter.use(requireAuthenticatedAccount);

paymentsRouter.post('/razorpay/verify', async (req, res) => {
  const parsed = verifyPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }
  try {
    const result = await verifyRazorpayPayment(getAuthenticatedAccount(req), {
      razorpayOrderId: parsed.data.razorpay_order_id,
      razorpayPaymentId: parsed.data.razorpay_payment_id,
      razorpaySignature: parsed.data.razorpay_signature
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleDomainError(res, error);
  }
});

paymentsRouter.get('/history', async (req, res) => {
  const history = await getPaymentHistory(getAuthenticatedAccount(req));
  return res.status(200).json(history);
});

razorpayWebhookRouter.post(
  '/razorpay',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.header('x-razorpay-signature');
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyRazorpayWebhookSignature(body, signature)) {
      return res.status(400).json({ error: 'WEBHOOK_SIGNATURE_INVALID' });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    } catch {
      return res.status(400).json({ error: 'WEBHOOK_PAYLOAD_INVALID' });
    }

    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    try {
      const result = await processRazorpayWebhook({ payload, payloadHash });
      return res.status(200).json(result);
    } catch (error) {
      return handleDomainError(res, error);
    }
  }
);
