import { apiFetch, postJson } from './apiClient';

export type EntitlementCode =
  | 'AI_ASSIST'
  | 'EXPERT_ASSISTANCE'
  | 'EXPERT_CONSULTATION'
  | 'CARE_CHAT'
  | 'DIET_PLAN_ACCESS'
  | 'REPORT_INTELLIGENCE'
  | 'APPOINTMENT_BOOKING';

export type PremiumSource = 'assist' | 'talk_to_expert' | 'get_assistance' | 'book_consultation' | 'subscription_management';

export const premiumSourceEntitlements: Record<PremiumSource, EntitlementCode | null> = {
  assist: 'AI_ASSIST',
  talk_to_expert: 'EXPERT_ASSISTANCE',
  get_assistance: 'EXPERT_ASSISTANCE',
  book_consultation: 'EXPERT_CONSULTATION',
  subscription_management: null
};

export type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationDays: number;
  priceMinor: number;
  currency: string;
  badge: string | null;
  isActive: boolean;
  entitlements: EntitlementCode[];
  benefits: string[];
};

export type CurrentSubscription = {
  hasActiveSubscription: boolean;
  subscription: {
    id: string;
    planCode: string;
    planName: string;
    status: string;
    startsAt: string | null;
    expiresAt: string | null;
    daysRemaining: number;
    expiringSoon: boolean;
  } | null;
  entitlements: EntitlementCode[];
};

export type CheckoutResponse = {
  alreadyEntitled: boolean;
  subscription: CurrentSubscription | null;
  checkout: {
    provider: 'razorpay';
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    prefill: {
      name?: string | null;
      email?: string | null;
      contact?: string | null;
    };
    notes: Record<string, string>;
  } | null;
};

export type RazorpayPaymentResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type PaymentHistoryItem = {
  id: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  planName: string | null;
};

export const formatPlanPrice = (plan: Pick<SubscriptionPlan, 'priceMinor' | 'currency'>) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: plan.currency,
    maximumFractionDigits: 0
  }).format(plan.priceMinor / 100);

export const formatPlanDuration = (durationDays: number) => {
  if (durationDays >= 360) return '12 months';
  if (durationDays >= 180) return '6 months';
  if (durationDays >= 90) return '3 months';
  if (durationDays >= 28) return '1 month';
  return `${durationDays} days`;
};

export const getSubscriptionPlans = () =>
  apiFetch<{ plans: SubscriptionPlan[] }>('/v1/subscriptions/plans');

export const getCurrentSubscription = () =>
  apiFetch<CurrentSubscription>('/v1/subscriptions/current');

export const createSubscriptionCheckout = (body: {
  planId: string;
  source: PremiumSource;
  requiredEntitlement?: EntitlementCode | null;
  returnDestination?: string | null;
  idempotencyKey: string;
}) => postJson<CheckoutResponse>('/v1/subscriptions/checkout', body);

export const verifyRazorpayPayment = (body: RazorpayPaymentResult) =>
  postJson<{ subscription: CurrentSubscription }>('/v1/payments/razorpay/verify', body);

export const getPaymentHistory = () =>
  apiFetch<{ payments: PaymentHistoryItem[] }>('/v1/payments/history');

export const hasEntitlement = (subscription: CurrentSubscription | null, entitlement: EntitlementCode) =>
  Boolean(subscription?.hasActiveSubscription && subscription.entitlements.includes(entitlement));
