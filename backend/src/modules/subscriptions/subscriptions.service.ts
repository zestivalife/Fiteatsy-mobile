import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import {
  activateSubscriptionFromPayment,
  attachProviderOrder,
  createOrReusePaymentOrder,
  findPaymentOrderByProviderOrderId,
  getActiveSubscriptionPlanById,
  getCurrentActiveSubscriptionForUser,
  listActiveEntitlementsForUser,
  listActiveSubscriptionPlans,
  listPaymentHistoryForUser,
  markPaymentOrderFailed,
  markWebhookEventFailed,
  markWebhookEventProcessed,
  recordSubscriptionAuditEvent,
  recordWebhookEvent
} from './subscriptions.repository.js';
import {
  CurrentSubscriptionDto,
  EntitlementCode,
  PREMIUM_SOURCE_ENTITLEMENTS
} from './subscriptions.types.js';
import {
  getRazorpayClient,
  sanitizeRazorpayError,
  verifyRazorpayPaymentSignature
} from './razorpay.provider.js';

const now = () => new Date();

export class SubscriptionDomainError extends Error {
  code: string;
  status: number;
  metadata?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, metadata?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.metadata = metadata;
  }
}

const daysRemaining = (expiresAtISO: string | null) => {
  if (!expiresAtISO) return 0;
  const diff = new Date(expiresAtISO).getTime() - now().getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
};

export const getSubscriptionPlans = async () => {
  const plans = await listActiveSubscriptionPlans();
  return { plans };
};

export const getCurrentSubscription = async (account: AuthenticatedAccount): Promise<CurrentSubscriptionDto> => {
  const [subscription, entitlements] = await Promise.all([
    getCurrentActiveSubscriptionForUser(account.accountId),
    listActiveEntitlementsForUser(account.accountId)
  ]);
  const remaining = daysRemaining(subscription?.expiresAtISO ?? null);
  return {
    hasActiveSubscription: Boolean(subscription),
    subscription: subscription
      ? {
          id: subscription.id,
          planCode: subscription.planCode,
          planName: subscription.planName,
          status: subscription.status,
          startsAt: subscription.startsAtISO,
          expiresAt: subscription.expiresAtISO,
          daysRemaining: remaining,
          expiringSoon: remaining > 0 && remaining <= env.subscriptionExpiryWarningDays
        }
      : null,
    entitlements
  };
};

export const hasEntitlement = async (account: AuthenticatedAccount, entitlement: EntitlementCode) => {
  if (['admin', 'consultant'].includes(account.user.role?.toLowerCase() ?? '')) return true;
  const entitlements = await listActiveEntitlementsForUser(account.accountId);
  return entitlements.includes(entitlement);
};

export const createCheckout = async (
  account: AuthenticatedAccount,
  input: {
    planId: string;
    source?: string | null;
    returnDestination?: string | null;
    idempotencyKey?: string | null;
  }
) => {
  const plan = await getActiveSubscriptionPlanById(input.planId);
  if (!plan) {
    throw new SubscriptionDomainError('PLAN_NOT_FOUND', 'Subscription plan is not available.', 404);
  }

  const requiredEntitlement = input.source ? PREMIUM_SOURCE_ENTITLEMENTS[input.source] ?? null : null;
  if (requiredEntitlement && await hasEntitlement(account, requiredEntitlement)) {
    return {
      alreadyEntitled: true,
      requiredEntitlement,
      subscription: await getCurrentSubscription(account),
      checkout: null
    };
  }

  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new SubscriptionDomainError('PAYMENT_PROVIDER_NOT_CONFIGURED', 'Payment provider is not configured.', 503);
  }

  const idempotencyKey = input.idempotencyKey?.trim() || crypto.randomUUID();
  const order = await createOrReusePaymentOrder({
    userId: account.accountId,
    plan,
    source: input.source ?? null,
    requiredEntitlement,
    returnDestination: input.returnDestination ?? null,
    idempotencyKey
  });

  if (order.providerOrderId) {
    return {
      alreadyEntitled: false,
      requiredEntitlement,
      subscription: null,
      checkout: {
        provider: 'razorpay',
        checkoutId: order.id,
        keyId: env.razorpayKeyId,
        orderId: order.providerOrderId,
        amount: order.amountMinor,
        currency: order.currency,
        name: 'Fiteatsy',
        description: plan.name,
        prefill: {
          name: account.user.name,
          email: account.user.email,
          contact: account.user.mobileNumber
        },
        notes: {
          checkout_id: order.id,
          plan_code: plan.code,
          source: input.source ?? ''
        },
        plan: {
          id: plan.id,
          code: plan.code,
          name: plan.name
        },
        priceBreakup: {
          baseAmountMinor: order.baseAmountMinor,
          cgstRatePercent: order.cgstRatePercent,
          cgstAmountMinor: order.cgstAmountMinor,
          sgstRatePercent: order.sgstRatePercent,
          sgstAmountMinor: order.sgstAmountMinor,
          totalTaxMinor: order.totalTaxMinor,
          totalAmountMinor: order.totalAmountMinor
        }
      }
    };
  }

  try {
    const providerOrder = await getRazorpayClient().createOrder({
      amount: plan.totalAmountMinor,
      currency: plan.currency,
      receipt: order.id,
      notes: {
        checkout_id: order.id,
        user_id: account.accountId,
        plan_code: plan.code
      }
    });
    const updatedOrder = await attachProviderOrder({
      paymentOrderId: order.id,
      providerOrderId: providerOrder.id,
      providerResponse: {
        id: providerOrder.id,
        amount: providerOrder.amount,
        currency: providerOrder.currency,
        status: providerOrder.status
      }
    });
    await recordSubscriptionAuditEvent({
      userId: account.accountId,
      paymentOrderId: updatedOrder.id,
      eventType: 'CHECKOUT_CREATED',
      metadata: {
        provider: 'RAZORPAY',
        planCode: plan.code,
        source: input.source ?? null,
        requiredEntitlement
      }
    });
    console.info('SUBSCRIPTION_CHECKOUT_CREATED', {
      userId: account.accountId,
      checkoutId: updatedOrder.id,
      provider: 'RAZORPAY',
      planCode: plan.code,
      amountMinor: plan.totalAmountMinor,
      currency: plan.currency
    });
    return {
      alreadyEntitled: false,
      requiredEntitlement,
      subscription: null,
      checkout: {
        provider: 'razorpay',
        checkoutId: updatedOrder.id,
        keyId: env.razorpayKeyId,
        orderId: updatedOrder.providerOrderId,
        amount: updatedOrder.amountMinor,
        currency: updatedOrder.currency,
        name: 'Fiteatsy',
        description: plan.name,
        prefill: {
          name: account.user.name,
          email: account.user.email,
          contact: account.user.mobileNumber
        },
        notes: {
          checkout_id: updatedOrder.id,
          plan_code: plan.code,
          source: input.source ?? ''
        },
        plan: {
          id: plan.id,
          code: plan.code,
          name: plan.name
        },
        priceBreakup: {
          baseAmountMinor: updatedOrder.baseAmountMinor,
          cgstRatePercent: updatedOrder.cgstRatePercent,
          cgstAmountMinor: updatedOrder.cgstAmountMinor,
          sgstRatePercent: updatedOrder.sgstRatePercent,
          sgstAmountMinor: updatedOrder.sgstAmountMinor,
          totalTaxMinor: updatedOrder.totalTaxMinor,
          totalAmountMinor: updatedOrder.totalAmountMinor
        }
      }
    };
  } catch (error) {
    await markPaymentOrderFailed(order.id);
    await recordSubscriptionAuditEvent({
      userId: account.accountId,
      paymentOrderId: order.id,
      eventType: 'CHECKOUT_FAILED',
      metadata: sanitizeRazorpayError(error) as Record<string, unknown>
    });
    throw new SubscriptionDomainError('PAYMENT_PROVIDER_ERROR', 'Unable to create payment order.', 502, sanitizeRazorpayError(error));
  }
};

export const verifyRazorpayPayment = async (
  account: AuthenticatedAccount,
  input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }
) => {
  if (!verifyRazorpayPaymentSignature({
    providerOrderId: input.razorpayOrderId,
    providerPaymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature
  })) {
    throw new SubscriptionDomainError('PAYMENT_SIGNATURE_INVALID', 'Payment signature verification failed.', 400);
  }

  const order = await findPaymentOrderByProviderOrderId(input.razorpayOrderId);
  if (!order || order.userId !== account.accountId) {
    throw new SubscriptionDomainError('PAYMENT_ORDER_NOT_FOUND', 'Payment order not found for this account.', 404);
  }

  const payment = await getRazorpayClient().fetchPayment(input.razorpayPaymentId);
  if (payment.order_id !== input.razorpayOrderId || payment.amount !== order.amountMinor || payment.currency !== order.currency) {
    throw new SubscriptionDomainError('PAYMENT_MISMATCH', 'Payment details do not match the checkout order.', 409);
  }
  if (payment.status !== 'captured') {
    throw new SubscriptionDomainError('PAYMENT_NOT_AUTHORITATIVE', 'Payment has not been confirmed by the provider.', 409, {
      providerStatus: payment.status
    });
  }

  const subscription = await activateSubscriptionFromPayment({
    paymentOrder: order,
    providerPaymentId: input.razorpayPaymentId,
    paymentStatus: payment.status,
    paymentMethod: payment.method ?? null
  });
  return {
    verified: true,
    subscription,
    current: await getCurrentSubscription(account),
    priceBreakup: {
      baseAmountMinor: order.baseAmountMinor,
      cgstRatePercent: order.cgstRatePercent,
      cgstAmountMinor: order.cgstAmountMinor,
      sgstRatePercent: order.sgstRatePercent,
      sgstAmountMinor: order.sgstAmountMinor,
      totalTaxMinor: order.totalTaxMinor,
      totalAmountMinor: order.totalAmountMinor
    }
  };
};

export const processRazorpayWebhook = async (input: {
  payload: Record<string, unknown>;
  payloadHash: string;
}) => {
  const eventId = typeof input.payload.id === 'string' ? input.payload.id : null;
  const eventType = typeof input.payload.event === 'string' ? input.payload.event : 'unknown';
  const created = await recordWebhookEvent({
    providerEventId: eventId,
    eventType,
    payloadHash: input.payloadHash
  });
  if (!created) {
    return { processed: false, duplicate: true };
  }

  try {
    const entity = (((input.payload.payload as Record<string, unknown> | undefined)?.payment as Record<string, unknown> | undefined)?.entity ??
      ((input.payload.payload as Record<string, unknown> | undefined)?.order as Record<string, unknown> | undefined)?.entity) as
      | Record<string, unknown>
      | undefined;
    const orderId = typeof entity?.order_id === 'string' ? entity.order_id : typeof entity?.id === 'string' && eventType === 'order.paid' ? entity.id : null;
    const paymentId = typeof entity?.id === 'string' && eventType.startsWith('payment.') ? entity.id : null;

    if ((eventType === 'payment.captured' || eventType === 'order.paid') && orderId && paymentId) {
      const order = await findPaymentOrderByProviderOrderId(orderId);
      if (order) {
        await activateSubscriptionFromPayment({
          paymentOrder: order,
          providerPaymentId: paymentId,
          paymentStatus: 'captured',
          paymentMethod: typeof entity?.method === 'string' ? entity.method : null
        });
      }
    }

    await markWebhookEventProcessed(input.payloadHash);
    return { processed: true, duplicate: false };
  } catch (error) {
    await markWebhookEventFailed(input.payloadHash, error instanceof Error ? error.message : 'Webhook processing failed.');
    throw error;
  }
};

export const getPaymentHistory = async (account: AuthenticatedAccount) => ({
  payments: await listPaymentHistoryForUser(account.accountId)
});
