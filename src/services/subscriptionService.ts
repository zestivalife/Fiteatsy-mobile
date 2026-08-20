import { apiFetch, postJson } from './apiClient';

export type EntitlementCode =
  | 'health_tracking'
  | 'wearable_sync'
  | 'medication_tracker'
  | 'medication_reminders'
  | 'stress_test'
  | 'stress_recovery'
  | 'health_reports'
  | 'progress_tracking'
  | 'diet_plan'
  | 'consultant_access'
  | 'consultations_per_month'
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
  cgstRatePercent?: number;
  cgstAmountMinor?: number;
  sgstRatePercent?: number;
  sgstAmountMinor?: number;
  totalTaxMinor?: number;
  totalAmountMinor?: number;
  currency: string;
  badge: string | null;
  isActive: boolean;
  developmentOnly?: boolean;
  recommended?: boolean;
  displayOrder?: number;
  dailyCostMinor?: number;
  version?: {
    id: string;
    number: number;
    effectiveFromISO: string;
    effectiveToISO: string | null;
    termsText: string;
  };
  entitlements: EntitlementCode[];
  entitlementValues?: Array<{ code: string; valueType: string; booleanValue?: boolean | null; limitValue?: number | null; enumValue?: string | null }>;
  benefits: string[];
};

export type FoundationSubscription = {
  status: 'NONE' | 'PENDING' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELLED' | 'PAYMENT_PENDING' | 'PROCESSING' | 'PAYMENT_FAILED' | string;
  subscription: (CurrentSubscription['subscription'] & {
    planId: string;
    planVersionId: string | null;
    durationDays: number;
    amountMinor: number;
    currency: string;
    autoRenew: boolean;
  }) | null;
  entitlements: Record<string, { valueType: string; value: boolean | number | string | null }>;
  entitlementsKnown: boolean;
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
    priceBreakup: PriceBreakup;
  } | null;
};

export type PriceBreakup = {
  baseAmountMinor: number;
  cgstRatePercent: number;
  cgstAmountMinor: number;
  sgstRatePercent: number;
  sgstAmountMinor: number;
  totalTaxMinor: number;
  totalAmountMinor: number;
};

export type RazorpayPaymentResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type PaymentHistoryItem = {
  id: string;
  provider: string;
  dateISO?: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  planName: string | null;
  paymentReference: string | null;
  priceBreakup?: PriceBreakup;
};

export const formatPlanPrice = (plan: { priceMinor?: number; amountMinor?: number; currency: string }) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: plan.currency,
    maximumFractionDigits: 0
  }).format((plan.priceMinor ?? plan.amountMinor ?? 0) / 100);

export const formatMinorPrice = (amountMinor: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amountMinor / 100);

export const formatPlanDuration = (durationDays: number) => {
  if (durationDays >= 360) return '12 months';
  if (durationDays >= 180) return '6 months';
  if (durationDays >= 90) return '3 months';
  if (durationDays >= 28) return '1 month';
  return `${durationDays} days`;
};

export const getSubscriptionPlans = () =>
  apiFetch<{ plans: SubscriptionPlan[] }>('/v1/subscriptions/plans');

export const getSubscriptionPlan = (planId: string) =>
  apiFetch<{ plan: SubscriptionPlan }>(`/v1/subscriptions/plans/${encodeURIComponent(planId)}`);

export const getMySubscription = () => apiFetch<FoundationSubscription>('/v1/subscriptions/me');

export const getMyEntitlements = () => apiFetch<Pick<FoundationSubscription, 'entitlements' | 'entitlementsKnown'> & { status: 'KNOWN' | 'UNKNOWN' }>('/v1/subscriptions/me/entitlements');

export const getMySubscriptionHistory = () => apiFetch<{ history: FoundationSubscription['subscription'][] }>('/v1/subscriptions/me/history');

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
  postJson<{ subscription: CurrentSubscription; priceBreakup: PriceBreakup }>('/v1/payments/razorpay/verify', body);

export const getPaymentHistory = () =>
  apiFetch<{ payments: PaymentHistoryItem[] }>('/v1/payments/history');

export const hasEntitlement = (subscription: CurrentSubscription | null, entitlement: EntitlementCode) =>
  Boolean(subscription?.hasActiveSubscription && subscription.entitlements.includes(entitlement));
