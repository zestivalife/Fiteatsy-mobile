import { NativeModules } from 'react-native';
import {
  EntitlementCode, PremiumSource, PriceBreakup, SubscriptionPlan,
  createSubscriptionCheckout, verifyRazorpayPayment
} from './subscriptionService';

type RazorpaySuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCheckoutModule = { open(options: {
  key: string; amount: number; currency: string; name: string; description: string;
  order_id: string; prefill: Record<string, unknown>; notes: Record<string, unknown>; theme: { color: string };
}): Promise<unknown> };

export type VerifiedCheckoutResult = { alreadyEntitled: boolean; priceBreakup?: PriceBreakup };
export const RAZORPAY_RUNTIME_UNAVAILABLE_MESSAGE = 'Payment checkout is unavailable in this development build.';

export const getRazorpayCheckout = (): RazorpayCheckoutModule | null => {
  if (!NativeModules.RNRazorpayCheckout || !NativeModules.RazorpayEventEmitter) return null;
  try {
    const module = require('react-native-razorpay') as { default?: RazorpayCheckoutModule; open?: RazorpayCheckoutModule['open'] };
    const checkout = module.default ?? (typeof module.open === 'function' ? module as RazorpayCheckoutModule : null);
    return checkout && typeof checkout.open === 'function' ? checkout : null;
  } catch {
    return null;
  }
};

export const runVerifiedSubscriptionCheckout = async ({ plan, source, requiredEntitlement, returnDestination, idempotencyKey }: {
  plan: SubscriptionPlan; source: PremiumSource; requiredEntitlement?: EntitlementCode | null;
  returnDestination?: string | null; idempotencyKey: string;
}): Promise<VerifiedCheckoutResult> => {
  const RazorpayCheckout = getRazorpayCheckout();
  if (!RazorpayCheckout) throw new Error(RAZORPAY_RUNTIME_UNAVAILABLE_MESSAGE);
  const response = await createSubscriptionCheckout({ planId: plan.id, source, requiredEntitlement, returnDestination: returnDestination ?? null, idempotencyKey });
  if (response.alreadyEntitled) return { alreadyEntitled: true };
  if (!response.checkout) throw new Error('Payment provider did not return checkout details.');
  const checkout = response.checkout;
  const payment = await RazorpayCheckout.open({
    key: checkout.keyId, amount: checkout.amount, currency: checkout.currency, name: 'Fiteatsy',
    description: checkout.description, order_id: checkout.orderId, prefill: checkout.prefill,
    notes: checkout.notes, theme: { color: '#64D900' }
  }) as RazorpaySuccess;
  const verification = await verifyRazorpayPayment(payment);
  return { alreadyEntitled: false, priceBreakup: verification.priceBreakup };
};
