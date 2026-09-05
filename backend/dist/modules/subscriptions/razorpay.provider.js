import crypto from 'node:crypto';
import { env } from '../../config/env.js';
class RazorpayProviderError extends Error {
    status;
    payload;
    constructor(message, status, payload) {
        super(message);
        this.status = status;
        this.payload = payload;
    }
}
let testClient = null;
export const setRazorpayClientForTests = (client) => {
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
const requestRazorpay = async (path, init) => {
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
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
        throw new RazorpayProviderError('Razorpay request failed.', response.status, payload);
    }
    return payload;
};
export const getRazorpayClient = () => testClient ?? {
    createOrder: (request) => requestRazorpay('/orders', {
        method: 'POST',
        body: JSON.stringify(request)
    }),
    fetchPayment: (paymentId) => requestRazorpay(`/payments/${encodeURIComponent(paymentId)}`, {
        method: 'GET'
    })
};
export const verifyRazorpayPaymentSignature = (input) => {
    if (!env.razorpayKeySecret)
        return false;
    const expected = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${input.providerOrderId}|${input.providerPaymentId}`)
        .digest('hex');
    const actual = Buffer.from(input.signature);
    const expectedBuffer = Buffer.from(expected);
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
};
export const verifyRazorpayWebhookSignature = (body, signature) => {
    if (!env.razorpayWebhookSecret || !signature)
        return false;
    const expected = crypto
        .createHmac('sha256', env.razorpayWebhookSecret)
        .update(body)
        .digest('hex');
    const actual = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
};
export const sanitizeRazorpayError = (error) => {
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
