export const ENTITLEMENT_CODES = [
  'AI_ASSIST',
  'EXPERT_ASSISTANCE',
  'EXPERT_CONSULTATION',
  'CARE_CHAT',
  'DIET_PLAN_ACCESS',
  'REPORT_INTELLIGENCE',
  'APPOINTMENT_BOOKING'
] as const;

export type EntitlementCode = (typeof ENTITLEMENT_CODES)[number];

export const PREMIUM_SOURCE_ENTITLEMENTS: Record<string, EntitlementCode> = {
  assist: 'AI_ASSIST',
  talk_to_expert: 'EXPERT_ASSISTANCE',
  get_assistance: 'EXPERT_ASSISTANCE',
  consultation: 'EXPERT_CONSULTATION',
  consultant_booking: 'EXPERT_CONSULTATION',
  book_consultation: 'EXPERT_CONSULTATION'
};

export type SubscriptionStatus =
  | 'PENDING_PAYMENT'
  | 'PROCESSING'
  | 'ACTIVE'
  | 'PAYMENT_FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'REVOKED';

export type PaymentOrderStatus = 'CREATED' | 'ATTEMPTED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export type SubscriptionPlanDto = {
  id: string;
  code: string;
  name: string;
  description: string;
  durationDays: number;
  durationMonths: number;
  priceMinor: number;
  cgstRatePercent: number;
  cgstAmountMinor: number;
  sgstRatePercent: number;
  sgstAmountMinor: number;
  totalTaxMinor: number;
  totalAmountMinor: number;
  currency: string;
  isActive: boolean;
  isFeatured: boolean;
  badge: string | null;
  displayOrder: number;
  benefits: string[];
  entitlements: EntitlementCode[];
};

export type CurrentSubscriptionDto = {
  hasActiveSubscription: boolean;
  subscription: {
    id: string;
    planCode: string;
    planName: string;
    status: SubscriptionStatus;
    startsAt: string | null;
    expiresAt: string | null;
    daysRemaining: number;
    expiringSoon: boolean;
  } | null;
  entitlements: EntitlementCode[];
};
