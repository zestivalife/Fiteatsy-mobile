import { OnboardingProfile, PublishedNutritionPlan, WearableSyncPayload } from '../types';

export type SupportPreference = 'self_guided' | 'one_consult' | 'regular_support' | null;
export type DurationPreference = 'one_month' | 'three_months' | 'six_months_plus' | 'not_sure' | null;
export type PlanPriority = 'tracking' | 'expert_guidance' | 'nutrition_lifestyle' | 'accountability' | null;

export type PlanId =
  | 'wellness_tracking_6m'
  | 'wellness_tracking_12m'
  | 'lifestyle_modification_consult'
  | 'clinical_care_1m'
  | 'clinical_transformation_3m'
  | 'deep_healing_6m';

export type PlanCatalogItem = {
  id: PlanId;
  name: string;
  category: 'tracking' | 'consult' | 'clinical';
  durationLabel: string;
  priceLabel: string;
  priceInRupees: number;
  dailyCostLabel?: string;
  valueLabel?: string;
  benefits: string[];
};

export type PlanRecommendationContext = {
  onboarding: OnboardingProfile | null;
  wearableSyncData: WearableSyncPayload[];
  publishedNutritionPlan: PublishedNutritionPlan | null;
  supportPreference?: SupportPreference;
  durationPreference?: DurationPreference;
  priority?: PlanPriority;
};

export type RecommendedPlanResult = {
  primary: PlanCatalogItem;
  secondary: PlanCatalogItem | null;
  confidenceLabel: 'Strong match' | 'Good match' | 'Starter match';
  reason: string;
  signals: string[];
};

export const fiteatsyPlanCatalog: PlanCatalogItem[] = [
  {
    id: 'wellness_tracking_6m',
    name: '6 Month Wellness Tracking',
    category: 'tracking',
    durationLabel: '6 months',
    priceLabel: '₹2,999',
    priceInRupees: 2999,
    dailyCostLabel: '₹17/day',
    benefits: ['Health trend tracking', 'Report history view', 'Recovery signals', 'Progress reminders']
  },
  {
    id: 'wellness_tracking_12m',
    name: '12 Month Wellness Tracking',
    category: 'tracking',
    durationLabel: '12 months',
    priceLabel: '₹4,999',
    priceInRupees: 4999,
    dailyCostLabel: '₹14/day',
    valueLabel: 'Best Value · Save ₹999 vs two 6-month plans',
    benefits: ['Year-long health timeline', 'Best tracking value', 'Wearable trend context', 'Report comparison history']
  },
  {
    id: 'lifestyle_modification_consult',
    name: 'Lifestyle Modification Consult',
    category: 'consult',
    durationLabel: 'One expert consult',
    priceLabel: '₹999',
    priceInRupees: 999,
    benefits: ['One expert review', 'Lifestyle direction', 'Report discussion', 'No ongoing commitment']
  },
  {
    id: 'clinical_care_1m',
    name: '1 Month Clinical Care',
    category: 'clinical',
    durationLabel: '1 month',
    priceLabel: '₹2,999',
    priceInRupees: 2999,
    dailyCostLabel: '₹100/day',
    benefits: ['Expert-guided starter plan', 'Weekly care check-ins', 'Nutrition direction', 'Lower-commitment trial']
  },
  {
    id: 'clinical_transformation_3m',
    name: '3 Month Clinical Transformation',
    category: 'clinical',
    durationLabel: '3 months',
    priceLabel: '₹5,999',
    priceInRupees: 5999,
    dailyCostLabel: '₹67/day',
    valueLabel: 'Save ₹2,998 vs three 1-month plans',
    benefits: ['Ongoing expert support', 'Nutrition and lifestyle coaching', 'Habit formation', 'Progress reviews']
  },
  {
    id: 'deep_healing_6m',
    name: '6 Month Deep Healing Program',
    category: 'clinical',
    durationLabel: '6 months',
    priceLabel: '₹6,999',
    priceInRupees: 6999,
    dailyCostLabel: '₹39/day',
    valueLabel: 'Save ₹10,995 vs six 1-month plans',
    benefits: ['Long-term expert support', 'Deep lifestyle accountability', 'Complex support planning', 'Extended progress tracking']
  }
];

const findPlan = (id: PlanId) => fiteatsyPlanCatalog.find((plan) => plan.id === id) ?? fiteatsyPlanCatalog[0];

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

  let primaryId: PlanId = 'wellness_tracking_6m';
  let secondaryId: PlanId | null = 'lifestyle_modification_consult';
  const signals: string[] = [];

  if (context.supportPreference === 'self_guided') {
    primaryId = context.durationPreference === 'six_months_plus' ? 'wellness_tracking_12m' : 'wellness_tracking_6m';
    secondaryId = 'lifestyle_modification_consult';
    signals.push('You selected independent tracking as your preferred support style.');
  } else if (context.supportPreference === 'one_consult') {
    primaryId = 'lifestyle_modification_consult';
    secondaryId = 'clinical_care_1m';
    signals.push('You selected one expert consultation without ongoing commitment.');
  } else if (context.supportPreference === 'regular_support') {
    if (context.durationPreference === 'six_months_plus' && context.priority === 'accountability') {
      primaryId = 'deep_healing_6m';
      secondaryId = 'clinical_transformation_3m';
    } else if (context.durationPreference === 'one_month') {
      primaryId = 'clinical_care_1m';
      secondaryId = 'clinical_transformation_3m';
    } else {
      primaryId = 'clinical_transformation_3m';
      secondaryId = 'clinical_care_1m';
    }
    signals.push('You selected regular expert support.');
  } else if (context.priority === 'tracking' || hasWearableSignals) {
    primaryId = context.durationPreference === 'six_months_plus' ? 'wellness_tracking_12m' : 'wellness_tracking_6m';
    secondaryId = 'lifestyle_modification_consult';
    signals.push(hasWearableSignals ? 'Your profile indicates wearable or tracking signals.' : 'Your priority is wellness pattern tracking.');
  } else if (context.priority === 'expert_guidance') {
    primaryId = 'lifestyle_modification_consult';
    secondaryId = 'clinical_care_1m';
    signals.push('Your priority is expert guidance.');
  } else if (context.priority === 'nutrition_lifestyle' || clinicalSupportSignal) {
    primaryId = context.durationPreference === 'one_month' ? 'clinical_care_1m' : 'clinical_transformation_3m';
    secondaryId = 'lifestyle_modification_consult';
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

  const primary = findPlan(primaryId);
  const secondary = secondaryId && secondaryId !== primaryId ? findPlan(secondaryId) : null;
  const reason =
    primary.category === 'tracking'
      ? 'This keeps the recommendation lower-commitment and focused on tracking until stronger expert-support intent is available.'
      : primary.category === 'consult'
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
