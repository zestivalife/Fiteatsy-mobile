import { OnboardingProfile, PublishedNutritionPlan, WearableSyncPayload } from '../types';
import { SubscriptionPlan } from './subscriptionService';

export type SupportPreference = 'self_guided' | 'one_consult' | 'regular_support' | null;
export type DurationPreference = 'one_month' | 'three_months' | 'six_months_plus' | 'not_sure' | null;
export type PlanPriority = 'tracking' | 'expert_guidance' | 'nutrition_lifestyle' | 'accountability' | null;

export type PlanCode =
  | 'WELLNESS_TRACKING_6M'
  | 'WELLNESS_TRACKING_12M'
  | 'LIFESTYLE_MODIFICATION_CONSULT'
  | 'CLINICAL_CARE_1M'
  | 'CLINICAL_TRANSFORMATION_3M'
  | 'DEEP_HEALING_6M';

export type PlanCatalogItem = SubscriptionPlan & {
  category: 'tracking' | 'consult' | 'clinical';
};

export type PlanRecommendationContext = {
  onboarding: OnboardingProfile | null;
  wearableSyncData: WearableSyncPayload[];
  publishedNutritionPlan: PublishedNutritionPlan | null;
  planCatalog: SubscriptionPlan[];
  supportPreference?: SupportPreference;
  durationPreference?: DurationPreference;
  priority?: PlanPriority;
};

export type RecommendedPlanResult = {
  primary: PlanCatalogItem | null;
  secondary: PlanCatalogItem | null;
  confidenceLabel: 'Strong match' | 'Good match' | 'Starter match';
  reason: string;
  signals: string[];
};

const planCategory = (code: string): PlanCatalogItem['category'] => {
  if (code.includes('TRACKING')) return 'tracking';
  if (code.includes('CONSULT')) return 'consult';
  return 'clinical';
};

const withCategory = (plan: SubscriptionPlan): PlanCatalogItem => ({
  ...plan,
  category: planCategory(plan.code)
});

const findPlan = (plans: SubscriptionPlan[], code: PlanCode) => {
  const plan = plans.find((item) => item.code === code);
  return plan ? withCategory(plan) : null;
};

const includesAny = (values: Array<string | undefined | null>, needles: string[]) => {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  return needles.some((needle) => text.includes(needle));
};

export const recommendPlan = (context: PlanRecommendationContext): RecommendedPlanResult => {
  const onboarding = context.onboarding;
  const goals = [onboarding?.primaryGoal, onboarding?.wellnessGoal, ...(onboarding?.healthGoals ?? []), ...(onboarding?.secondaryGoals ?? [])];
  const conditions = [...(onboarding?.primaryConditions ?? []), ...(onboarding?.previousConditions ?? [])];
  const hasWearableSignals = context.wearableSyncData.length > 0 || onboarding?.wearablePreference === 'sync';
  const hasNutritionPlan = Boolean(context.publishedNutritionPlan);
  const longTermGoal = includesAny(goals, ['sustainable', 'recovery', 'diabetes', 'pcos', 'hormone', 'weight loss', 'muscle']);
  const clinicalSupportSignal = conditions.length > 0 || longTermGoal || hasNutritionPlan;

  let primaryCode: PlanCode = 'WELLNESS_TRACKING_6M';
  let secondaryCode: PlanCode | null = 'LIFESTYLE_MODIFICATION_CONSULT';
  const signals: string[] = [];

  if (context.supportPreference === 'self_guided') {
    primaryCode = context.durationPreference === 'six_months_plus' ? 'WELLNESS_TRACKING_12M' : 'WELLNESS_TRACKING_6M';
    secondaryCode = 'LIFESTYLE_MODIFICATION_CONSULT';
    signals.push('You selected independent tracking as your preferred support style.');
  } else if (context.supportPreference === 'one_consult') {
    primaryCode = 'LIFESTYLE_MODIFICATION_CONSULT';
    secondaryCode = 'CLINICAL_CARE_1M';
    signals.push('You selected one expert consultation without ongoing commitment.');
  } else if (context.supportPreference === 'regular_support') {
    if (context.durationPreference === 'six_months_plus' && context.priority === 'accountability') {
      primaryCode = 'DEEP_HEALING_6M';
      secondaryCode = 'CLINICAL_TRANSFORMATION_3M';
    } else if (context.durationPreference === 'one_month') {
      primaryCode = 'CLINICAL_CARE_1M';
      secondaryCode = 'CLINICAL_TRANSFORMATION_3M';
    } else {
      primaryCode = 'CLINICAL_TRANSFORMATION_3M';
      secondaryCode = 'CLINICAL_CARE_1M';
    }
    signals.push('You selected regular expert support.');
  } else if (context.priority === 'tracking' || hasWearableSignals) {
    primaryCode = context.durationPreference === 'six_months_plus' ? 'WELLNESS_TRACKING_12M' : 'WELLNESS_TRACKING_6M';
    secondaryCode = 'LIFESTYLE_MODIFICATION_CONSULT';
    signals.push(hasWearableSignals ? 'Your profile indicates wearable or tracking signals.' : 'Your priority is wellness pattern tracking.');
  } else if (context.priority === 'expert_guidance') {
    primaryCode = 'LIFESTYLE_MODIFICATION_CONSULT';
    secondaryCode = 'CLINICAL_CARE_1M';
    signals.push('Your priority is expert guidance.');
  } else if (context.priority === 'nutrition_lifestyle' || clinicalSupportSignal) {
    primaryCode = context.durationPreference === 'one_month' ? 'CLINICAL_CARE_1M' : 'CLINICAL_TRANSFORMATION_3M';
    secondaryCode = 'LIFESTYLE_MODIFICATION_CONSULT';
    signals.push('Your profile includes nutrition, lifestyle, or care-planning signals.');
  }

  if (goals.length > 0) {
    signals.push(`Goal context: ${goals.slice(0, 2).join(', ')}.`);
  }
  if (conditions.length > 0) {
    signals.push('Health history is present, so expert review may be useful.');
  }
  if (!onboarding) {
    signals.push('Complete your health profile to improve this recommendation.');
  }

  const primary = findPlan(context.planCatalog, primaryCode) ?? (context.planCatalog[0] ? withCategory(context.planCatalog[0]) : null);
  const secondary = secondaryCode && secondaryCode !== primaryCode ? findPlan(context.planCatalog, secondaryCode) : null;
  const reason =
    primary?.category === 'tracking'
      ? 'This keeps the recommendation lower-commitment and focused on tracking until stronger expert-support intent is available.'
      : primary?.category === 'consult'
        ? 'This gives you expert direction without committing to an ongoing clinical programme.'
        : 'This matches a need for repeated expert support, nutrition direction, and habit formation.';

  return {
    primary,
    secondary,
    confidenceLabel: context.supportPreference || context.priority ? 'Strong match' : onboarding ? 'Good match' : 'Starter match',
    reason,
    signals: signals.slice(0, 5)
  };
};
