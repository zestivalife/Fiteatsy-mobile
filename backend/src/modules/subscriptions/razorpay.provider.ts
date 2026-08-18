import crypto from 'node:crypto';
import { env } from '../../config/env.js';

type RazorpayOrderRequest = {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
};

export type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

export type RazorpayPaymentResponse = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
  captured?: boolean;
};

export type RazorpayClient = {
  createOrder: (request: RazorpayOrderRequest) => Promise<RazorpayOrderResponse>;
  fetchPayment: (paymentId: string) => Promise<RazorpayPaymentResponse>;
};

class RazorpayProviderError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

let testClient: RazorpayClient | null = null;

export const setRazorpayClientForTests = (client: RazorpayClient | null) => {
  testClient = client;
};

const requireCredentials = () => {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new Error('RAZORPAY_NOT_CONFIGURED');
  }
  return {
    keyId: env.razorpayKeyId,
    keySecret: env.razorpayKeySecret
  };
};

const requestRazorpay = async <T>(path: string, init: RequestInit): Promise<T> => {
  const credentials = requireCredentials();
  const auth = Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) {
    throw new RazorpayProviderError('Razorpay request failed.', response.status, payload);
  }
  return payload as T;
};

export const getRazorpayClient = (): RazorpayClient => testClient ?? {
  createOrder: (request) =>
    requestRazorpay<RazorpayOrderResponse>('/orders', {
      method: 'POST',
      body: JSON.stringify(request)
    }),
  fetchPayment: (paymentId) =>
    requestRazorpay<RazorpayPaymentResponse>(`/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET'
    })
};

export const verifyRazorpayPaymentSignature = (input: {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}) => {
  if (!env.razorpayKeySecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${input.providerOrderId}|${input.providerPaymentId}`)
    .digest('hex');
  const actual = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
};

export const verifyRazorpayWebhookSignature = (body: Buffer, signature: string | undefined) => {
  if (!env.razorpayWebhookSecret || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpayWebhookSecret)
    .update(body)
    .digest('hex');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
};

export const sanitizeRazorpayError = (error: unknown) => {
  if (error instanceof RazorpayProviderError) {
    return {
      status: error.status,
      payload: error.payload
    };
  }
  return {
    status: null,
    payload: error instanceof Error ? error.message : 'Unknown Razorpay error'
  };
};
