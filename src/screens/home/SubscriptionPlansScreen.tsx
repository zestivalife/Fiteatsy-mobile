import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, NativeModules, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { ApiClientError } from '../../services/apiClient';
import { colors, getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import {
  DurationPreference,
  PlanPriority,
  SupportPreference,
  recommendPlan
} from '../../services/planRecommendationService';
import {
  EntitlementCode,
  PremiumSource,
  SubscriptionPlan,
  createSubscriptionCheckout,
  formatMinorPrice,
  formatPlanDuration,
  formatPlanPrice,
  getCurrentSubscription,
  getSubscriptionPlans,
  hasEntitlement,
  premiumSourceEntitlements,
  verifyRazorpayPayment
} from '../../services/subscriptionService';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionPlans'>;

type Choice<T extends string | null> = {
  label: string;
  value: T;
  helper: string;
};

type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutModule = {
  open(options: {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    prefill: Record<string, unknown>;
    notes: Record<string, unknown>;
    theme: {
      color: string;
    };
  }): Promise<unknown>;
};

const RAZORPAY_RUNTIME_UNAVAILABLE_MESSAGE = 'Payment checkout is unavailable in this development build.';

const getRazorpayCheckout = (): RazorpayCheckoutModule | null => {
  const hasNativeRazorpay =
    Boolean(NativeModules.RNRazorpayCheckout) &&
    Boolean(NativeModules.RazorpayEventEmitter);

  if (!hasNativeRazorpay) {
    return null;
  }

  try {
    const razorpayModule = require('react-native-razorpay') as {
      default?: RazorpayCheckoutModule;
      open?: RazorpayCheckoutModule['open'];
    };
    const checkoutModule = razorpayModule.default ?? (
      typeof razorpayModule.open === 'function' ? razorpayModule as RazorpayCheckoutModule : null
    );
    return checkoutModule && typeof checkoutModule.open === 'function' ? checkoutModule : null;
  } catch {
    return null;
  }
};

const supportChoices: Choice<SupportPreference>[] = [
  { label: 'Track independently', value: 'self_guided', helper: 'I want wellness tracking without regular calls.' },
  { label: 'One expert consult', value: 'one_consult', helper: 'I need a focused review and direction.' },
  { label: 'Regular expert support', value: 'regular_support', helper: 'I want ongoing guidance and accountability.' }
];

const durationChoices: Choice<DurationPreference>[] = [
  { label: 'Up to 1 month', value: 'one_month', helper: 'Start small and decide later.' },
  { label: 'Around 3 months', value: 'three_months', helper: 'Enough time for habit change.' },
  { label: '6 months+', value: 'six_months_plus', helper: 'Long-term accountability.' },
  { label: 'Not sure', value: 'not_sure', helper: 'Let Fiteatsy recommend.' }
];

const priorityChoices: Choice<PlanPriority>[] = [
  { label: 'Track wellness patterns', value: 'tracking', helper: 'Reports, wearables, and trends.' },
  { label: 'Expert guidance', value: 'expert_guidance', helper: 'Understand what to do next.' },
  { label: 'Nutrition & lifestyle', value: 'nutrition_lifestyle', helper: 'Meal and routine support.' },
  { label: 'Long-term accountability', value: 'accountability', helper: 'Stay consistent over time.' }
];

const generateIdempotencyKey = (planId: string) => `${planId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const planDailyCostLabel = (plan: SubscriptionPlan) => {
  if (plan.durationDays <= 0) return null;
  const dailyMinor = Math.ceil(plan.priceMinor / plan.durationDays);
  return `${formatPlanPrice({ ...plan, priceMinor: dailyMinor })}/day`;
};

export const SubscriptionPlansScreen = ({ navigation, route }: Props) => {
  const { onboarding, publishedNutritionPlan, themeMode, wearableSyncData } = useAppContext();
  const palette = getThemeColors(themeMode);
  const source = (route.params?.source ?? 'subscription_management') as PremiumSource;
  const requiredEntitlement = (route.params?.requiredEntitlement ?? premiumSourceEntitlements[source]) as EntitlementCode | null;
  const returnDestination = route.params?.returnDestination;
  const [supportPreference, setSupportPreference] = useState<SupportPreference>(null);
  const [durationPreference, setDurationPreference] = useState<DurationPreference>(null);
  const [priority, setPriority] = useState<PlanPriority>(null);
  const [whyVisible, setWhyVisible] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [activeEntitlements, setActiveEntitlements] = useState<EntitlementCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [plansResponse, subscription] = await Promise.all([
        getSubscriptionPlans(),
        getCurrentSubscription().catch(() => null)
      ]);
      setPlans(plansResponse.plans);
      setActiveEntitlements(subscription?.entitlements ?? []);
    } catch (error) {
      setErrorMessage(error instanceof ApiClientError ? error.message : 'Unable to load subscription plans right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const recommendation = useMemo(
    () =>
      recommendPlan({
        onboarding,
        publishedNutritionPlan,
        wearableSyncData,
        planCatalog: plans,
        supportPreference,
        durationPreference,
        priority
      }),
    [durationPreference, onboarding, plans, priority, publishedNutritionPlan, supportPreference, wearableSyncData]
  );

  const navigateAfterActivation = useCallback(() => {
    navigation.replace('PaymentSuccess', { returnDestination });
  }, [navigation, returnDestination]);

  const startCheckout = async (plan: SubscriptionPlan) => {
    setCheckoutPlanId(plan.id);
    setErrorMessage(null);
    try {
      const RazorpayCheckout = getRazorpayCheckout();
      if (!RazorpayCheckout) {
        throw new Error(RAZORPAY_RUNTIME_UNAVAILABLE_MESSAGE);
      }

      const checkoutResponse = await createSubscriptionCheckout({
        planId: plan.id,
        source,
        requiredEntitlement,
        returnDestination: returnDestination ?? null,
        idempotencyKey: generateIdempotencyKey(plan.id)
      });

      if (checkoutResponse.alreadyEntitled) {
        navigateAfterActivation();
        return;
      }

      if (!checkoutResponse.checkout) {
        throw new Error('Payment provider did not return checkout details.');
      }

      const checkout = checkoutResponse.checkout;
      const result = await RazorpayCheckout.open({
        key: checkout.keyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: 'Fiteatsy',
        description: checkout.description,
        order_id: checkout.orderId,
        prefill: checkout.prefill,
        notes: checkout.notes,
        theme: {
          color: '#64D900'
        }
      }) as RazorpaySuccess;

      const verification = await verifyRazorpayPayment(result);
      navigation.replace('PaymentSuccess', { returnDestination, priceBreakup: verification.priceBreakup });
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Payment could not be completed.';
      setErrorMessage(message);
    } finally {
      setCheckoutPlanId(null);
    }
  };

  const selectPlanForCheckout = (plan: SubscriptionPlan) => setSelectedPlan(plan);

  const entitledForRequiredFeature = requiredEntitlement ? activeEntitlements.includes(requiredEntitlement) : false;
  const recommendedPlan = recommendation.primary;

  return (
    <Screen scroll contentStyle={styles.screen}>
      <AppBackButton onPress={() => navigation.goBack()} />

      <View style={[styles.hero, { backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0E120F', borderColor: palette.stroke }]}>
        <Text style={styles.eyebrow}>Fiteatsy subscriptions</Text>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Choose support that matches your health journey.</Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>
          Plans and entitlements come from the Fiteatsy backend. Premium features unlock only after server-verified payment.
        </Text>
        {requiredEntitlement ? (
          <View style={[styles.entitlementPill, entitledForRequiredFeature ? styles.entitlementPillActive : null]}>
            <Ionicons name={entitledForRequiredFeature ? 'checkmark-circle' : 'lock-closed'} size={16} color={entitledForRequiredFeature ? '#0D2503' : '#FFFFFF'} />
            <Text style={[styles.entitlementText, entitledForRequiredFeature ? styles.entitlementTextActive : null]}>
              {entitledForRequiredFeature ? 'Required access active' : `Requires ${requiredEntitlement.replace(/_/g, ' ')}`}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={[styles.stateCard, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}>
          <ActivityIndicator color="#64D900" />
          <Text style={[styles.stateText, { color: palette.textSecondary }]}>Loading live plans...</Text>
        </View>
      ) : null}

      {!loading && errorMessage ? (
        <View style={[styles.errorCard, { borderColor: '#B83B4B' }]}>
          <Text style={styles.errorTitle}>Unable to load plans</Text>
          <Text style={styles.errorBody}>{errorMessage}</Text>
          <PrimaryButton title="Retry" onPress={() => { void loadPlans(); }} />
        </View>
      ) : null}

      {!loading && !errorMessage && recommendedPlan ? (
        <View style={[styles.recommendationCard, { backgroundColor: '#111A12', borderColor: '#2D5226' }]}>
          <View style={styles.badgeRow}>
            <Text style={styles.badge}>{recommendedPlan.badge ?? 'Recommended for you'}</Text>
            <Text style={styles.confidence}>{recommendation.confidenceLabel}</Text>
          </View>
            <Text style={styles.planName}>{recommendedPlan.name}</Text>
            <Text style={styles.planReason}>{recommendation.reason}</Text>
            <Text style={styles.taxNote}>Base price + applicable GST at checkout</Text>
          <View style={styles.planMetaRow}>
            <Text style={styles.planMeta}>{formatPlanDuration(recommendedPlan.durationDays)}</Text>
            <Text style={styles.planPrice}>{formatPlanPrice(recommendedPlan)}</Text>
            {planDailyCostLabel(recommendedPlan) ? <Text style={styles.planMeta}>{planDailyCostLabel(recommendedPlan)}</Text> : null}
          </View>
          <View style={styles.benefitList}>
            {recommendedPlan.benefits.slice(0, 4).map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={16} color="#64D900" />
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>
          <View style={styles.recommendationActions}>
            <PrimaryButton
              title={checkoutPlanId === recommendedPlan.id ? 'Opening secure checkout...' : 'Subscribe & Continue'}
              onPress={() => selectPlanForCheckout(recommendedPlan)}
              disabled={Boolean(checkoutPlanId)}
              style={styles.chooseButton}
            />
            <Pressable onPress={() => setWhyVisible(true)} style={styles.whyButton} accessibilityRole="button">
              <Text style={styles.whyText}>Why this plan?</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!loading && !errorMessage && recommendation.secondary ? (
        <View style={[styles.secondaryCard, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}>
          <Text style={[styles.secondaryLabel, { color: palette.textSecondary }]}>Also worth considering</Text>
          <Text style={[styles.secondaryName, { color: palette.textPrimary }]}>{recommendation.secondary.name}</Text>
          <Text style={[styles.secondaryCopy, { color: palette.textSecondary }]}>
            {formatPlanDuration(recommendation.secondary.durationDays)} · {formatPlanPrice(recommendation.secondary)} + applicable GST
          </Text>
          <Pressable
            onPress={() => selectPlanForCheckout(recommendation.secondary as SubscriptionPlan)}
            disabled={Boolean(checkoutPlanId)}
            style={styles.secondaryAction}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryActionText}>Choose this plan</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.helpCard, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Help me choose</Text>
        <ChoiceGroup title="What kind of support do you want?" choices={supportChoices} value={supportPreference} onSelect={setSupportPreference} />
        <ChoiceGroup title="How long do you want support?" choices={durationChoices} value={durationPreference} onSelect={setDurationPreference} />
        <ChoiceGroup title="What matters most right now?" choices={priorityChoices} value={priority} onSelect={setPriority} />
      </View>

      {!loading && !errorMessage ? (
        <View style={styles.catalogSection}>
          <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>All live plans</Text>
          {plans.map((plan) => (
            <Pressable
              key={plan.id}
              onPress={() => selectPlanForCheckout(plan)}
              disabled={Boolean(checkoutPlanId)}
              style={[styles.catalogCard, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}
              accessibilityRole="button"
            >
              <View style={styles.catalogTop}>
                <Text style={[styles.catalogName, { color: palette.textPrimary }]}>{plan.name}</Text>
                <Text style={styles.catalogPrice}>{formatPlanPrice(plan)}</Text>
              </View>
              <Text style={[styles.catalogMeta, { color: palette.textSecondary }]}>
                {formatPlanDuration(plan.durationDays)}{planDailyCostLabel(plan) ? ` · ${planDailyCostLabel(plan)}` : ''}
              </Text>
              <Text style={[styles.catalogMeta, { color: palette.textSecondary }]}>Base price + applicable GST at checkout</Text>
              {plan.badge ? <Text style={styles.catalogValue}>{plan.badge}</Text> : null}
              <Text style={[styles.catalogMeta, { color: palette.textSecondary }]}>
                Unlocks {plan.entitlements.slice(0, 3).map((item) => item.replace(/_/g, ' ')).join(', ')}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Modal visible={whyVisible} transparent animationType="slide" onRequestClose={() => setWhyVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0D0F0D' }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>Why this plan?</Text>
            <Text style={[styles.sheetBody, { color: palette.textSecondary }]}>{recommendation.reason}</Text>
            {recommendation.signals.map((signal) => (
              <View key={signal} style={styles.signalRow}>
                <Ionicons name="ellipse" size={8} color="#64D900" />
                <Text style={[styles.signalText, { color: palette.textSecondary }]}>{signal}</Text>
              </View>
            ))}
            <PrimaryButton title="Close" onPress={() => setWhyVisible(false)} style={styles.closeButton} />
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(selectedPlan)} transparent animationType="slide" onRequestClose={() => setSelectedPlan(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0D0F0D' }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>Confirm payment</Text>
            <Text style={[styles.sheetBody, { color: palette.textSecondary }]}>{selectedPlan?.name}</Text>
            {selectedPlan ? <>
              <View style={styles.taxRow}><Text style={[styles.taxLabel, { color: palette.textSecondary }]}>Plan price</Text><Text style={[styles.taxValue, { color: palette.textPrimary }]}>{formatMinorPrice(selectedPlan.priceMinor, selectedPlan.currency)}</Text></View>
              <View style={styles.taxRow}><Text style={[styles.taxLabel, { color: palette.textSecondary }]}>CGST @ 9%</Text><Text style={[styles.taxValue, { color: palette.textPrimary }]}>{formatMinorPrice(selectedPlan.cgstAmountMinor ?? 0, selectedPlan.currency)}</Text></View>
              <View style={styles.taxRow}><Text style={[styles.taxLabel, { color: palette.textSecondary }]}>SGST @ 9%</Text><Text style={[styles.taxValue, { color: palette.textPrimary }]}>{formatMinorPrice(selectedPlan.sgstAmountMinor ?? 0, selectedPlan.currency)}</Text></View>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{formatMinorPrice(selectedPlan.totalAmountMinor ?? selectedPlan.priceMinor, selectedPlan.currency)}</Text></View>
              <PrimaryButton title={`Pay ${formatMinorPrice(selectedPlan.totalAmountMinor ?? selectedPlan.priceMinor, selectedPlan.currency)}`} onPress={() => { const plan = selectedPlan; setSelectedPlan(null); void startCheckout(plan); }} disabled={Boolean(checkoutPlanId)} />
            </> : null}
            <Pressable onPress={() => setSelectedPlan(null)} style={styles.closeButton} accessibilityRole="button"><Text style={styles.whyText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const ChoiceGroup = <T extends string | null>({
  title,
  choices,
  value,
  onSelect
}: {
  title: string;
  choices: Choice<T>[];
  value: T;
  onSelect: (value: T) => void;
}) => (
  <View style={styles.choiceGroup}>
    <Text style={styles.choiceTitle}>{title}</Text>
    {choices.map((choice) => {
      const selected = choice.value === value;
      return (
        <Pressable
          key={choice.label}
          onPress={() => onSelect(choice.value)}
          style={[styles.choiceRow, selected && styles.choiceRowSelected]}
          accessibilityRole="button"
          accessibilityState={{ selected }}
        >
          <View style={[styles.radio, selected && styles.radioSelected]} />
          <View style={styles.choiceCopy}>
            <Text style={styles.choiceLabel}>{choice.label}</Text>
            <Text style={styles.choiceHelper}>{choice.helper}</Text>
          </View>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  backText: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 15
  },
  hero: {
    borderWidth: 1,
    borderRadius: 28,
    gap: 10,
    padding: spacing.lg
  },
  eyebrow: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  title: {
    fontFamily: 'Exo_700Bold',
    fontSize: 29,
    lineHeight: 35
  },
  body: {
    fontFamily: 'Exo_400Regular',
    fontSize: 15,
    lineHeight: 22
  },
  entitlementPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#22282E',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  entitlementPillActive: {
    backgroundColor: '#64D900'
  },
  entitlementText: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 12,
    textTransform: 'uppercase'
  },
  entitlementTextActive: {
    color: '#0D2503'
  },
  stateCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 24,
    gap: spacing.sm,
    padding: spacing.xl
  },
  stateText: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 14
  },
  errorCard: {
    backgroundColor: '#32141A',
    borderWidth: 1,
    borderRadius: 24,
    gap: spacing.sm,
    padding: spacing.lg
  },
  errorTitle: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 18
  },
  errorBody: {
    color: '#F5B7C1',
    fontFamily: 'Exo_400Regular',
    fontSize: 14,
    lineHeight: 20
  },
  recommendationCard: {
    borderWidth: 1,
    borderRadius: 30,
    gap: spacing.md,
    padding: spacing.lg
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  badge: {
    backgroundColor: '#64D900',
    borderRadius: radius.pill,
    color: '#092104',
    fontFamily: 'Exo_700Bold',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  confidence: {
    backgroundColor: '#22301E',
    borderRadius: radius.pill,
    color: '#C9F6B7',
    fontFamily: 'Exo_700Bold',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  planName: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 26,
    lineHeight: 31
  },
  planReason: {
    color: '#D7E6D0',
    fontFamily: 'Exo_400Regular',
    fontSize: 15,
    lineHeight: 22
  },
  planMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  planMeta: {
    color: '#D8F3CC',
    fontFamily: 'Exo_600SemiBold',
    fontSize: 13
  },
  planPrice: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 22
  },
  benefitList: {
    gap: 8
  },
  benefitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  benefitText: {
    color: '#ECF7E7',
    flex: 1,
    fontFamily: 'Exo_400Regular',
    fontSize: 14
  },
  recommendationActions: {
    gap: 10
  },
  chooseButton: {
    marginTop: spacing.xs
  },
  whyButton: {
    alignItems: 'center',
    paddingVertical: 10
  },
  whyText: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 15
  },
  secondaryCard: {
    borderWidth: 1,
    borderRadius: 22,
    gap: 6,
    padding: spacing.md
  },
  secondaryLabel: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase'
  },
  secondaryName: {
    fontFamily: 'Exo_700Bold',
    fontSize: 19
  },
  secondaryCopy: {
    fontFamily: 'Exo_400Regular',
    fontSize: 14
  },
  secondaryAction: {
    alignSelf: 'flex-start',
    paddingVertical: 8
  },
  secondaryActionText: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 14
  },
  helpCard: {
    borderWidth: 1,
    borderRadius: 26,
    gap: spacing.lg,
    padding: spacing.lg
  },
  sectionTitle: {
    fontFamily: 'Exo_700Bold',
    fontSize: 21
  },
  choiceGroup: {
    gap: 10
  },
  choiceTitle: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 15
  },
  choiceRow: {
    alignItems: 'center',
    backgroundColor: '#161C18',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#26342B',
    flexDirection: 'row',
    gap: 12,
    padding: 13
  },
  choiceRowSelected: {
    borderColor: '#64D900',
    backgroundColor: '#1A3313'
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#7D8B7B'
  },
  radioSelected: {
    borderColor: '#64D900',
    backgroundColor: '#64D900'
  },
  choiceCopy: {
    flex: 1,
    gap: 3
  },
  choiceLabel: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 14
  },
  choiceHelper: {
    color: '#AEB9AD',
    fontFamily: 'Exo_400Regular',
    fontSize: 12,
    lineHeight: 17
  },
  catalogSection: {
    gap: spacing.sm
  },
  catalogCard: {
    borderWidth: 1,
    borderRadius: 20,
    gap: 6,
    padding: spacing.md
  },
  catalogTop: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between'
  },
  catalogName: {
    flex: 1,
    fontFamily: 'Exo_700Bold',
    fontSize: 17
  },
  catalogPrice: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 17
  },
  catalogMeta: {
    fontFamily: 'Exo_400Regular',
    fontSize: 13,
    lineHeight: 18
  },
  catalogValue: {
    color: '#F0B44C',
    fontFamily: 'Exo_700Bold',
    fontSize: 12
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.58)'
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: spacing.md,
    padding: spacing.lg
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#7C847B',
    borderRadius: radius.pill,
    height: 5,
    width: 54
  },
  sheetTitle: {
    fontFamily: 'Exo_700Bold',
    fontSize: 24
  },
  sheetBody: {
    fontFamily: 'Exo_400Regular',
    fontSize: 15,
    lineHeight: 22
  },
  signalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  signalText: {
    flex: 1,
    fontFamily: 'Exo_400Regular',
    fontSize: 14,
    lineHeight: 20
  },
  closeButton: {
    marginTop: spacing.sm
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6
  },
  taxLabel: {
    fontFamily: 'Exo_400Regular',
    fontSize: 15
  },
  taxValue: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 15
  },
  totalRow: {
    borderTopColor: '#39433A',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 12
  },
  totalLabel: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 18
  },
  totalValue: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 20
  },
  taxNote: {
    ...typography.subtext,
    color: '#8F9690'
  }
});
