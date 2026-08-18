import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setRazorpayClientForTests,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature
} from '../../backend/src/modules/subscriptions/razorpay.provider.js';

test.afterEach(() => {
  setRazorpayClientForTests(null);
});

test('Razorpay payment signature verification accepts only server-signed order/payment pairs', () => {
  const previousSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = 'server_secret_for_tests';
  try {
    const signature = crypto
      .createHmac('sha256', 'server_secret_for_tests')
      .update('order_123|pay_123')
      .digest('hex');

    assert.equal(
      verifyRazorpayPaymentSignature({
        providerOrderId: 'order_123',
        providerPaymentId: 'pay_123',
        signature
      }),
      true
    );
    assert.equal(
      verifyRazorpayPaymentSignature({
        providerOrderId: 'order_123',
        providerPaymentId: 'pay_456',
        signature
      }),
      false
    );
  } finally {
    if (previousSecret == null) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousSecret;
  }
});

test('Razorpay webhook signature verification uses the raw request body', () => {
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret_for_tests';
  try {
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } }));
    const signature = crypto
      .createHmac('sha256', 'webhook_secret_for_tests')
      .update(body)
      .digest('hex');

    assert.equal(verifyRazorpayWebhookSignature(body, signature), true);
    assert.equal(verifyRazorpayWebhookSignature(Buffer.from(`${body.toString()} `), signature), false);
    assert.equal(verifyRazorpayWebhookSignature(body, 'bad-signature'), false);
  } finally {
    if (previousSecret == null) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});
