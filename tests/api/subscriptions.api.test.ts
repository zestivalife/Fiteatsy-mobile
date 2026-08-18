import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticatedSession, authHeaders } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';
import { setRazorpayClientForTests } from '../../backend/src/modules/subscriptions/razorpay.provider.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

const withPaymentEnv = async (run: () => Promise<void>) => {
  const previous = {
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'server_secret_for_tests';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret_for_tests';
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    setRazorpayClientForTests(null);
  }
};

const signPayment = (orderId: string, paymentId: string) =>
  crypto
    .createHmac('sha256', 'server_secret_for_tests')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  if (server) await server.close();
});

test.beforeEach(async () => {
  await resetTestState();
  setRazorpayClientForTests(null);
});

test('subscription checkout verifies Razorpay payment before activating entitlements', async () => {
  await withPaymentEnv(async () => {
    let providerOrderSequence = 0;
    setRazorpayClientForTests({
      createOrder: async (input) => {
        providerOrderSequence += 1;
        return {
          id: `order_test_${providerOrderSequence}`,
          amount: input.amount,
          currency: input.currency,
          status: 'created'
        };
      },
      fetchPayment: async (paymentId) => ({
        id: paymentId,
        order_id: 'order_test_1',
        amount: 99900,
        currency: 'INR',
        status: 'captured',
        method: 'upi'
      })
    });

    const session = await createAuthenticatedSession(server.baseUrl, {
      name: 'Subscription User',
      email: 'subscription-user@example.com',
      mobileNumber: '+919876543299'
    });

    const plans = await getJson(server.baseUrl, '/v1/subscriptions/plans');
    assert.equal(plans.response.status, 200);
    assert.equal(plans.body.plans.length >= 6, true);
    const consultationPlan = plans.body.plans.find((plan: { code: string }) => plan.code === 'LIFESTYLE_MODIFICATION_CONSULT');
    assert.ok(consultationPlan);
    assert.equal(consultationPlan.priceMinor, 99900);
    assert.equal(consultationPlan.entitlements.includes('EXPERT_CONSULTATION'), true);

    const emptyCurrent = await getJson(server.baseUrl, '/v1/subscriptions/current', {
      headers: authHeaders(session.token)
    });
    assert.equal(emptyCurrent.response.status, 200);
    assert.equal(emptyCurrent.body.hasActiveSubscription, false);
    assert.deepEqual(emptyCurrent.body.entitlements, []);

    const checkout = await postJson(
      server.baseUrl,
      '/v1/subscriptions/checkout',
      {
        planId: consultationPlan.id,
        source: 'book_consultation',
        returnDestination: 'ConsultantBooking',
        idempotencyKey: 'subscription-test-key'
      },
      { headers: authHeaders(session.token) }
    );
    assert.equal(checkout.response.status, 201);
    assert.equal(checkout.body.alreadyEntitled, false);
    assert.equal(checkout.body.checkout.provider, 'razorpay');
    assert.equal(checkout.body.checkout.keyId, 'rzp_test_key');
    assert.equal(checkout.body.checkout.orderId, 'order_test_1');
    assert.equal(checkout.body.checkout.amount, 99900);
    assert.equal(checkout.body.checkout.notes.source, 'book_consultation');

    const invalidSignature = await postJson(
      server.baseUrl,
      '/v1/payments/razorpay/verify',
      {
        razorpay_order_id: 'order_test_1',
        razorpay_payment_id: 'pay_test_1',
        razorpay_signature: 'bad-signature'
      },
      { headers: authHeaders(session.token) }
    );
    assert.equal(invalidSignature.response.status, 400);
    assert.equal(invalidSignature.body.error, 'PAYMENT_SIGNATURE_INVALID');

    const validSignature = signPayment('order_test_1', 'pay_test_1');
    const verified = await postJson(
      server.baseUrl,
      '/v1/payments/razorpay/verify',
      {
        razorpay_order_id: 'order_test_1',
        razorpay_payment_id: 'pay_test_1',
        razorpay_signature: validSignature
      },
      { headers: authHeaders(session.token) }
    );
    assert.equal(verified.response.status, 200);
    assert.equal(verified.body.verified, true);
    assert.equal(verified.body.current.hasActiveSubscription, true);
    assert.equal(verified.body.current.entitlements.includes('EXPERT_CONSULTATION'), true);

    const current = await getJson(server.baseUrl, '/v1/subscriptions/current', {
      headers: authHeaders(session.token)
    });
    assert.equal(current.response.status, 200);
    assert.equal(current.body.hasActiveSubscription, true);
    assert.equal(current.body.subscription.planCode, 'LIFESTYLE_MODIFICATION_CONSULT');
    assert.equal(current.body.entitlements.includes('APPOINTMENT_BOOKING'), true);

    const repeatedVerify = await postJson(
      server.baseUrl,
      '/v1/payments/razorpay/verify',
      {
        razorpay_order_id: 'order_test_1',
        razorpay_payment_id: 'pay_test_1',
        razorpay_signature: validSignature
      },
      { headers: authHeaders(session.token) }
    );
    assert.equal(repeatedVerify.response.status, 200);
    assert.equal(repeatedVerify.body.current.hasActiveSubscription, true);
  });
});

test('checkout fails closed when Razorpay credentials are not configured', async () => {
  const session = await createAuthenticatedSession(server.baseUrl, {
    name: 'No Provider User',
    email: 'no-provider@example.com',
    mobileNumber: '+919876543298'
  });
  const plans = await getJson(server.baseUrl, '/v1/subscriptions/plans');
  const plan = plans.body.plans[0];

  const checkout = await postJson(
    server.baseUrl,
    '/v1/subscriptions/checkout',
    {
      planId: plan.id,
      source: 'assist',
      idempotencyKey: 'missing-provider-test'
    },
    { headers: authHeaders(session.token) }
  );

  assert.equal(checkout.response.status, 503);
  assert.equal(checkout.body.error, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
});
