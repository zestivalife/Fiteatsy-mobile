import { getFoundationPlan, getLatestPaymentState, getLatestSubscription, listEffectiveEntitlements, listFoundationPlans, listSubscriptionHistory } from './subscription-foundation.repository.js';
const daysRemaining = (expiresAtISO) => expiresAtISO ? Math.max(0, Math.ceil((new Date(expiresAtISO).getTime() - Date.now()) / 86400000)) : 0;
const entitlementContract = (items) => Object.fromEntries(items.map((item) => [item.code, {
        valueType: item.valueType,
        value: item.valueType === 'BOOLEAN' ? item.booleanValue : item.valueType === 'LIMIT' ? item.limitValue : item.enumValue
    }]));
export const getFoundationPlanList = async () => ({ plans: await listFoundationPlans() });
export const getFoundationPlanDetails = async (planId) => getFoundationPlan(planId);
export const getMySubscriptionFoundation = async (account) => {
    const [subscription, paymentState] = await Promise.all([
        getLatestSubscription(account.accountId),
        getLatestPaymentState(account.accountId)
    ]);
    const validUntil = Boolean(subscription?.expiresAtISO && new Date(subscription.expiresAtISO).getTime() > Date.now());
    const active = Boolean(subscription && validUntil && ['ACTIVE', 'CANCELLED'].includes(subscription.status));
    const status = !subscription
        ? paymentState === 'FAILED' ? 'PAYMENT_FAILED' : ['CREATED', 'ATTEMPTED'].includes(paymentState ?? '') ? 'PAYMENT_PENDING' : 'NONE'
        : active
            ? subscription.status === 'CANCELLED' ? 'CANCELLED' : (daysRemaining(subscription.expiresAtISO) <= 7 ? 'EXPIRING_SOON' : 'ACTIVE')
            : subscription.status === 'PENDING_PAYMENT' || subscription.status === 'PROCESSING'
                ? 'PENDING'
                : subscription.status === 'PAYMENT_FAILED' ? 'PAYMENT_FAILED' : subscription.status === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED';
    const entitlements = active ? await listEffectiveEntitlements(account.accountId) : [];
    return {
        status,
        subscription: subscription ? { ...subscription, daysRemaining: active ? daysRemaining(subscription.expiresAtISO) : 0 } : null,
        entitlements: entitlementContract(entitlements),
        entitlementsKnown: true
    };
};
export const getMyEntitlementFoundation = async (account) => {
    const current = await getMySubscriptionFoundation(account);
    return { status: current.entitlementsKnown ? 'KNOWN' : 'UNKNOWN', entitlements: current.entitlements };
};
export const getMySubscriptionHistoryFoundation = async (account) => ({ history: await listSubscriptionHistory(account.accountId) });
