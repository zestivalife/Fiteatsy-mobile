import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import {
  getRegisteredConsultantClientProfileContext,
  getConsultantWearableSummaryForClient,
  listConsultantReportSummariesForClient,
  listConsultantTimelineForClient,
  listValidatedBiomarkerSummaryForClient,
  type ConsultantBiomarkerSummary,
} from '../consultants/consultants.repository.js';
import { calculateHealthMetrics } from '../health/health-calculations.service.js';
import { listLatestHealthScores } from '../intelligence/health-scores.repository.js';
import { getCareCaseByClientId, getHealthProfileByClientId, getNutritionProfileByClientId, listHealthEvents } from '../platform/platform.store.js';
import type {
  CareCaseRecord,
  ClientOwnershipContext,
  DietPlanVersionRecord,
  NutritionIntelligence,
  NutritionMealSection,
  NutritionMealSlot,
  NutritionPlanContent,
  NutritionPlanSourceSnapshot,
} from '../platform/platform.types.js';
import { transitionCareCaseStage } from '../platform/platform.lifecycle.js';
import { addHealthEvent } from '../platform/platform.store.js';
import {
  createOrUpdateDietPlanDraft,
  getDietPlanByCareCaseId,
  getCurrentDietPlanVersion,
  getDietPlanById,
  getDietPlanVersionById,
  getLatestPublishedDietPlanByClientId,
  updateDietPlanLifecycle,
  updateDietPlanVersionContent,
  updateDietPlanVersionExportPaths,
} from './nutrition.store.js';
import { generateDietPlanDocument } from './nutrition.document.js';
import { buildRecommendationSets, calculateMealNutritionTotals, classifyMealMatch, deriveMealTargets } from './meal-engine.js';
import { listMealLibrarySlotsForTarget } from './nutrition.library.store.js';
import { getFoodPreferenceProfile } from './food-preferences.service.js';

const TEMPLATE_VERSION = '2Zestiva_Premium_Personalised_Diet_Plan_Template_v0.2_Compact';
const MAX_MEAL_OPTIONS_PER_SECTION = 5;
const AVAILABLE_LIBRARY_MATCH_LIMIT = 18;

export class NutritionPlanWorkflowError extends Error {
  statusCode: number;
  code: string;

  constructor(code: string, message: string, statusCode = 409) {
    super(message);
    this.name = 'NutritionPlanWorkflowError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const CONSULTANT_DIET_WORKFLOW_ROLES = ['consultant', 'provider', 'dietician', 'senior_consultant'];

const isConsultantRole = (account: AuthenticatedAccount) =>
  CONSULTANT_DIET_WORKFLOW_ROLES.includes(account.user.role?.toLowerCase() ?? '');

const canApproveOrPublishDietPlan = (account: AuthenticatedAccount) =>
  CONSULTANT_DIET_WORKFLOW_ROLES.includes(account.user.role?.toLowerCase() ?? '');

const unique = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => (value ?? '').trim()).filter(Boolean)));

const round = (value: number | null, digits = 0) => {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const lower = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

const normalizeMealOptions = (options: NutritionMealSection['options'] | undefined) =>
  (options ?? [])
    .filter((option) => option && option.sourceType !== 'generated_template' && (option.id || option.meal || option.portion))
    .slice(0, MAX_MEAL_OPTIONS_PER_SECTION)
    .map((option, index) => ({
      ...option,
      slot: index + 1,
    }));

const dedupeMealOptions = (options: NutritionMealSection['options'] | undefined) => {
  const seen = new Set<string>();
  return (options ?? []).filter((option) => {
    const key = [
      option.id ?? '',
      lower(option.meal),
      lower(option.portion),
      option.sourceType ?? '',
    ].join('::');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeMealSection = (section: NutritionMealSection): NutritionMealSection => {
  const selectedOptions = normalizeMealOptions(section.options);
  const availableOptions = dedupeMealOptions([
    ...(section.availableOptions ?? []),
    ...selectedOptions,
  ])
    .filter((option) => option.sourceType !== 'generated_template')
    .map((option, index) => ({
    ...option,
    slot: index + 1,
  }));

  return {
    ...section,
    options: selectedOptions,
    availableOptions,
    recommendationSets: buildRecommendationSets(selectedOptions),
  };
};

const normalizeNutritionPlanContent = (content: NutritionPlanContent): NutritionPlanContent => ({
  ...content,
  mealPlan: {
    earlyMorning: normalizeMealSection(content.mealPlan.earlyMorning),
    breakfast: normalizeMealSection(content.mealPlan.breakfast),
    midMorningSnack: normalizeMealSection(content.mealPlan.midMorningSnack),
    lunch: normalizeMealSection(content.mealPlan.lunch),
    eveningSnack: normalizeMealSection(content.mealPlan.eveningSnack),
    dinner: normalizeMealSection(content.mealPlan.dinner),
    bedtimeNutrition: normalizeMealSection(content.mealPlan.bedtimeNutrition),
  },
});

const stripAvailableOptionsFromSection = (section: NutritionMealSection): NutritionMealSection => {
  const { availableOptions: _availableOptions, ...sectionWithoutAvailableOptions } = section;
  return {
    ...sectionWithoutAvailableOptions,
    options: normalizeMealOptions(section.options),
  };
};

export const sanitizePublishedNutritionPlanContent = (content: NutritionPlanContent): NutritionPlanContent => ({
  ...content,
  mealPlan: {
    earlyMorning: stripAvailableOptionsFromSection(content.mealPlan.earlyMorning),
    breakfast: stripAvailableOptionsFromSection(content.mealPlan.breakfast),
    midMorningSnack: stripAvailableOptionsFromSection(content.mealPlan.midMorningSnack),
    lunch: stripAvailableOptionsFromSection(content.mealPlan.lunch),
    eveningSnack: stripAvailableOptionsFromSection(content.mealPlan.eveningSnack),
    dinner: stripAvailableOptionsFromSection(content.mealPlan.dinner),
    bedtimeNutrition: stripAvailableOptionsFromSection(content.mealPlan.bedtimeNutrition),
  },
});

const getLatestDownloadableDietPlanVersion = async (plan: Awaited<ReturnType<typeof getDietPlanById>>) => {
  if (!plan) return null;
  const currentVersion = plan.currentVersionId ? await getCurrentDietPlanVersion(plan.id) : null;
  if (currentVersion && currentVersion.lifecycleStatus !== 'archived') {
    return currentVersion;
  }
  if (plan.latestPublishedVersionId) {
    return getDietPlanVersionById(plan.latestPublishedVersionId);
  }
  return currentVersion;
};

const summarizeLifestyle = (input: {
  occupation?: string | null;
  workMode?: string | null;
  wakeTime?: string | null;
  sleepTime?: string | null;
  activityLevel?: string | null;
}) => {
  const parts = [
    input.occupation,
    input.workMode,
    input.activityLevel ? `${input.activityLevel} activity` : null,
    input.wakeTime && input.sleepTime ? `wake ${input.wakeTime}, sleep ${input.sleepTime}` : null,
  ];
  return unique(parts).join(' • ') || 'Lifestyle details are still being completed.';
};

const inferRiskLevel = (signals: {
  bmi: number | null;
  biomarkers: ConsultantBiomarkerSummary[];
  activityLevel: string | null;
  sleepQuality: string | null;
}) => {
  let score = 0;
  if ((signals.bmi ?? 0) >= 30) score += 2;
  else if ((signals.bmi ?? 0) >= 25) score += 1;
  if (signals.biomarkers.some((item) => /b12|vitamin d|ferritin|hba1c|glucose|cholesterol|triglyceride/i.test(item.name))) score += 1;
  if (['sedentary', 'inactive', 'light'].includes(lower(signals.activityLevel))) score += 1;
  if (['poor', 'worst', 'fair', 'average'].includes(lower(signals.sleepQuality))) score += 1;
  if (score >= 4) return 'high' as const;
  if (score >= 2) return 'needs_attention' as const;
  return 'low' as const;
};

const buildFoodRecommendations = (input: {
  dietPreference: string | null;
  conditions: string[];
  biomarkers: ConsultantBiomarkerSummary[];
}) => {
  const suggestions = new Set<string>();
  if (input.biomarkers.some((item) => /b12/i.test(item.name))) {
    suggestions.add('Include B12-rich foods such as dairy, eggs, fish, or fortified options aligned to dietary preference.');
  }
  if (input.biomarkers.some((item) => /vitamin d/i.test(item.name))) {
    suggestions.add('Prioritise vitamin D supportive foods and daylight exposure routines alongside consultant review.');
  }
  if (input.conditions.some((item) => /diabetes|prediabetes|insulin/i.test(item))) {
    suggestions.add('Favor protein-first meals with high-fibre carbs and reduce long gaps between meals.');
  }
  if (input.conditions.some((item) => /cholesterol|heart/i.test(item))) {
    suggestions.add('Use more unsaturated fats, pulses, vegetables, and reduce deep-fried meal frequency.');
  }
  if (lower(input.dietPreference).includes('vegetarian')) {
    suggestions.add('Distribute paneer, curd, tofu, dals, and sprouts across meals to support daily protein goals.');
  } else {
    suggestions.add('Balance lean proteins, vegetables, and steady hydration across the day for easier adherence.');
  }
  return Array.from(suggestions).slice(0, 5);
};

const buildNutritionIntelligence = (input: {
  goal: string | null;
  age: number | null;
  gender: string | null;
  weightKg: number | null;
  bmi: number | null;
  dietPreference: string | null;
  activityLevel: string | null;
  sleepQuality: string | null;
  waterIntakeLiters: number | null;
  hydrationTargetLiters: number | null;
  proteinTargetGrams: number | null;
  carbohydrateTargetGrams: number | null;
  fatTargetGrams: number | null;
  caloriesTarget: number | null;
  conditions: string[];
  biomarkers: ConsultantBiomarkerSummary[];
  reportsCount: number;
  lifestyleSummary: string;
  wearableConnected: boolean;
  wellnessScores: NutritionIntelligence['wellnessScores'];
  stressAssessment: NutritionPlanSourceSnapshot['stressAssessment'];
}): NutritionIntelligence => {
  const observations: NutritionIntelligence['observations'] = [];
  const recommendations: NutritionIntelligence['recommendations'] = [];
  const nutritionFocus = new Set<string>();
  const consultantActions = new Set<string>();

  if ((input.bmi ?? 0) >= 25) {
    observations.push({
      title: 'Weight-management support required',
      detail: `BMI is ${input.bmi}, above the preferred range for this phase of recovery.`,
      sources: ['bodyMetrics.bmi'],
    });
    recommendations.push({
      title: 'Optimise energy density and portion rhythm',
      detail: 'Keep meals protein-anchored and reduce high-calorie convenience gaps before adjusting portions aggressively.',
      sources: ['bodyMetrics.bmi', 'nutritionProtocol.calorieTarget'],
      requiresConsultantReview: true,
    });
    nutritionFocus.add('weight management');
  }

  for (const biomarker of input.biomarkers) {
    const biomarkerName = biomarker.name.toLowerCase();
    if (/b12/.test(biomarkerName)) {
      observations.push({
        title: 'Vitamin B12 support required',
        detail: `${biomarker.name} is ${biomarker.value} ${biomarker.unit}.`,
        sources: [`biomarkers.${biomarker.name}`],
      });
      recommendations.push({
        title: 'Increase B12-rich food exposure',
        detail: 'Add consistent B12-supportive foods and review supplementation needs before publishing.',
        sources: [`biomarkers.${biomarker.name}`],
        requiresConsultantReview: true,
      });
      nutritionFocus.add('micronutrient repletion');
    }
    if (/vitamin d/.test(biomarkerName)) {
      observations.push({
        title: 'Vitamin D status may affect recovery readiness',
        detail: `${biomarker.name} is ${biomarker.value} ${biomarker.unit}.`,
        sources: [`biomarkers.${biomarker.name}`],
      });
      nutritionFocus.add('recovery readiness');
    }
    if (/hba1c|glucose/.test(biomarkerName)) {
      observations.push({
        title: 'Glucose regulation needs meal-structure support',
        detail: `${biomarker.name} is ${biomarker.value} ${biomarker.unit}.`,
        sources: [`biomarkers.${biomarker.name}`],
      });
      recommendations.push({
        title: 'Stabilise carb distribution',
        detail: 'Pair carbs with protein and fibre across the day rather than concentrating them in one meal window.',
        sources: [`biomarkers.${biomarker.name}`, 'nutritionProtocol.macroTargets'],
        requiresConsultantReview: true,
      });
      nutritionFocus.add('glucose stability');
    }
  }

  if (['sedentary', 'inactive', 'light'].includes(lower(input.activityLevel))) {
    observations.push({
      title: 'Activity pattern is below ideal for current goals',
      detail: `Current activity level is marked as ${input.activityLevel ?? 'not available'}.`,
      sources: ['healthProfile.activityLevel'],
    });
    consultantActions.add('Set a realistic movement target aligned to the recovery phase.');
    nutritionFocus.add('movement adherence');
  }

  if (['poor', 'worst', 'fair', 'average'].includes(lower(input.sleepQuality))) {
    observations.push({
      title: 'Sleep quality may limit recovery outcomes',
      detail: `Sleep quality is currently marked as ${input.sleepQuality}.`,
      sources: ['healthProfile.sleepQualityLabel'],
    });
    consultantActions.add('Keep dinner lighter and align bedtime nourishment with sleep quality goals.');
    nutritionFocus.add('sleep support');
  }

  if (
    input.waterIntakeLiters != null &&
    input.hydrationTargetLiters != null &&
    input.waterIntakeLiters < input.hydrationTargetLiters
  ) {
    observations.push({
      title: 'Hydration is below the calculated target',
      detail: `Current intake is ${input.waterIntakeLiters} L against a target of ${input.hydrationTargetLiters} L.`,
      sources: ['healthProfile.waterIntakeLiters', 'nutritionProtocol.hydrationTargetLiters'],
    });
    recommendations.push({
      title: 'Anchor hydration to routine cues',
      detail: 'Use wake, meal, and work-block anchors to distribute water intake instead of relying on late catch-up.',
      sources: ['healthProfile.waterIntakeLiters', 'nutritionProtocol.hydrationTargetLiters'],
      requiresConsultantReview: false,
    });
    nutritionFocus.add('hydration consistency');
  }

  if ((input.proteinTargetGrams ?? 0) > 0) {
    recommendations.push({
      title: 'Distribute protein across meal windows',
      detail: `Plan should spread approximately ${input.proteinTargetGrams} g across the full day instead of concentrating it at one meal.`,
      sources: ['nutritionProtocol.macroTargets.proteinGrams'],
      requiresConsultantReview: false,
    });
    nutritionFocus.add('protein distribution');
  }

  if (input.reportsCount === 0) {
    consultantActions.add('Request a recent lab report before locking long-term supplement recommendations.');
  }

  if (!observations.length) {
    observations.push({
      title: 'Baseline nutrition context is available',
      detail: 'Profile, target, and lifestyle inputs are sufficient to prepare a consultant-reviewed draft.',
      sources: ['healthProfile', 'nutritionProtocol'],
    });
  }

  const abnormalities = input.biomarkers
    .filter((item) => lower(item.status) !== 'normal')
    .map((item) => `${item.name} ${item.value} ${item.unit}`);

  const deficiencies = input.biomarkers
    .filter((item) => /b12|vitamin|ferritin|iron|folate/i.test(item.name) && lower(item.status) !== 'normal')
    .map((item) => item.name);

  return {
    riskLevel: inferRiskLevel({
      bmi: input.bmi,
      biomarkers: input.biomarkers,
      activityLevel: input.activityLevel,
      sleepQuality: input.sleepQuality,
    }),
    observations,
    recommendations: recommendations.slice(0, 6),
    nutritionFocus: Array.from(nutritionFocus).slice(0, 6),
    foodRecommendations: buildFoodRecommendations({
      dietPreference: input.dietPreference,
      conditions: input.conditions,
      biomarkers: input.biomarkers,
    }),
    consultantActions: Array.from(consultantActions).slice(0, 5),
    clientSummary: {
      goal: input.goal,
      age: input.age,
      gender: input.gender,
      weightKg: input.weightKg,
      bmi: input.bmi,
      activityLevel: input.activityLevel,
      sleepQuality: input.sleepQuality,
      stressBand: input.stressAssessment?.stressBand ?? null,
      stressPercent: input.stressAssessment?.stressPercent ?? null,
      hydrationTargetLiters: input.hydrationTargetLiters,
      waterIntakeLiters: input.waterIntakeLiters,
    },
    biomarkerSnapshot: input.biomarkers.map((item) => ({
      name: item.name,
      value: item.value,
      unit: item.unit,
      status: item.status,
      referenceRange: item.referenceRange,
      testDate: item.testDate,
    })),
    abnormalities: abnormalities.slice(0, 8),
    deficiencies: unique(deficiencies).slice(0, 6),
    wellnessScores: input.wellnessScores,
    generationInputs: {
      caloriesTarget: input.caloriesTarget,
      proteinTargetGrams: input.proteinTargetGrams,
      carbohydrateTargetGrams: input.carbohydrateTargetGrams,
      fatTargetGrams: input.fatTargetGrams,
      hydrationTargetLiters: input.hydrationTargetLiters,
      dietPreference: input.dietPreference,
      medicalConditions: input.conditions,
      lifestyleSummary: input.lifestyleSummary,
      wearableConnected: input.wearableConnected,
    },
    mealTargets: deriveMealTargets({
      caloriesTarget: input.caloriesTarget,
      proteinTargetGrams: input.proteinTargetGrams,
    }),
  };
};

const buildCanonicalMealComponent = (
  componentName: string,
  householdLabel: string,
  nutrition: {
    calories: number;
    proteinGrams: number;
    carbsGrams?: number;
    fatGrams?: number;
    fibreGrams?: number;
  },
) => ({
  componentName,
  quantity: 1,
  quantityUnit: 'serving',
  householdLabel,
  calories: nutrition.calories,
  proteinGrams: nutrition.proteinGrams,
  carbsGrams: nutrition.carbsGrams ?? null,
  fatGrams: nutrition.fatGrams ?? null,
  fibreGrams: nutrition.fibreGrams ?? null,
  locked: true,
});

const buildCanonicalMealSlot = (input: {
  mealKey: keyof NutritionPlanContent['mealPlan'];
  index: number;
  name: string;
  portion: string;
  prepNote: string;
  target: NutritionMealSection['target'];
  dietaryTags?: string[];
  cuisineTags?: string[];
  components: Array<ReturnType<typeof buildCanonicalMealComponent>>;
}) => {
  const totals = calculateMealNutritionTotals(input.components);
  return {
    id: `seed-${input.mealKey}-${input.index + 1}`,
    slot: input.index + 1,
    meal: input.name,
    portion: input.portion,
    prepNote: input.prepNote,
    approxKcal: totals.calories,
    proteinGrams: totals.proteinGrams,
    carbsGrams: totals.carbsGrams,
    fatGrams: totals.fatGrams,
    fibreGrams: totals.fibreGrams,
    matchClassification: input.target ? classifyMealMatch(input.target, totals) : 'good_match',
    sourceType: 'verified_library',
    recommendationReason: 'Canonical Fiteatsy meal-library option generated from structured nutrition components.',
    cuisineTags: input.cuisineTags ?? [],
    dietaryTags: input.dietaryTags ?? [],
    isApproved: false,
    components: input.components,
  } satisfies NutritionMealSlot;
};

const buildCanonicalMealLibraryFallback = (input: {
  mealKey: keyof NutritionPlanContent['mealPlan'];
  target: NutritionMealSection['target'];
  dietPreference: string | null;
}) => {
  const vegetarian = lower(input.dietPreference).includes('veg');
  const baseDietaryTags = vegetarian ? ['vegetarian'] : ['high-protein'];
  const definitions: Record<keyof NutritionPlanContent['mealPlan'], Array<{
    name: string;
    portion: string;
    prepNote: string;
    dietaryTags?: string[];
    cuisineTags?: string[];
    components: Array<ReturnType<typeof buildCanonicalMealComponent>>;
  }>> = {
    earlyMorning: [
      {
        name: 'Jeera water with soaked almonds',
        portion: '250 ml + 6 almonds',
        prepNote: 'Helps start hydration early without a heavy calorie load.',
        cuisineTags: ['indian'],
        dietaryTags: ['vegetarian'],
        components: [
          buildCanonicalMealComponent('Jeera water', '250 ml', { calories: 4, proteinGrams: 0, carbsGrams: 1 }),
          buildCanonicalMealComponent('Soaked almonds', '6 almonds', { calories: 42, proteinGrams: 1.6, carbsGrams: 1.5, fatGrams: 3.6, fibreGrams: 0.9 }),
        ],
      },
      {
        name: 'Fenugreek water with walnuts',
        portion: '250 ml + 2 walnut halves',
        prepNote: 'Useful when digestion and appetite regulation both need a gentle start.',
        cuisineTags: ['indian'],
        dietaryTags: ['vegetarian'],
        components: [
          buildCanonicalMealComponent('Fenugreek water', '250 ml', { calories: 5, proteinGrams: 0.2, carbsGrams: 1 }),
          buildCanonicalMealComponent('Walnuts', '2 halves', { calories: 52, proteinGrams: 1.2, carbsGrams: 1.1, fatGrams: 5.1, fibreGrams: 0.7 }),
        ],
      },
      {
        name: 'Unsweetened curd with chia seeds',
        portion: '100 g + 1 tsp chia',
        prepNote: 'Brings in a little protein when mornings are rushed.',
        cuisineTags: ['indian'],
        dietaryTags: ['vegetarian', 'high-protein'],
        components: [
          buildCanonicalMealComponent('Curd', '100 g', { calories: 62, proteinGrams: 3.5, carbsGrams: 4.8, fatGrams: 3 }),
          buildCanonicalMealComponent('Chia seeds', '1 tsp', { calories: 24, proteinGrams: 0.8, carbsGrams: 2, fatGrams: 1.5, fibreGrams: 2 }),
        ],
      },
      {
        name: 'Coconut water with pumpkin seeds',
        portion: '200 ml + 1 tbsp seeds',
        prepNote: 'A simple option for clients who prefer a lighter early window.',
        cuisineTags: ['indian'],
        dietaryTags: ['vegetarian'],
        components: [
          buildCanonicalMealComponent('Coconut water', '200 ml', { calories: 38, proteinGrams: 0.7, carbsGrams: 9 }),
          buildCanonicalMealComponent('Pumpkin seeds', '1 tbsp', { calories: 56, proteinGrams: 3, carbsGrams: 1.4, fatGrams: 4.8, fibreGrams: 0.8 }),
        ],
      },
      {
        name: 'Buttermilk with roasted chana',
        portion: '200 ml + 20 g chana',
        prepNote: 'Supports hydration and satiety before breakfast.',
        cuisineTags: ['indian'],
        dietaryTags: ['vegetarian', 'high-protein'],
        components: [
          buildCanonicalMealComponent('Buttermilk', '200 ml', { calories: 40, proteinGrams: 2.5, carbsGrams: 4.5, fatGrams: 1.4 }),
          buildCanonicalMealComponent('Roasted chana', '20 g', { calories: 74, proteinGrams: 4.3, carbsGrams: 11.8, fatGrams: 1.2, fibreGrams: 2.4 }),
        ],
      },
    ],
    breakfast: vegetarian
      ? [
          {
            name: 'Moong chilla with paneer stuffing',
            portion: '2 chillas + 60 g paneer',
            prepNote: 'Supports better protein distribution in the first half of the day.',
            cuisineTags: ['indian'],
            dietaryTags: [...baseDietaryTags, 'high-protein'],
            components: [
              buildCanonicalMealComponent('Moong chilla', '2 medium', { calories: 280, proteinGrams: 16, carbsGrams: 28, fatGrams: 9, fibreGrams: 6 }),
              buildCanonicalMealComponent('Paneer stuffing', '60 g', { calories: 159, proteinGrams: 11, carbsGrams: 2.4, fatGrams: 12.6 }),
            ],
          },
          {
            name: 'Greek curd bowl with fruit and seeds',
            portion: '250 g bowl',
            prepNote: 'Works well for lower-effort mornings.',
            cuisineTags: ['continental'],
            dietaryTags: [...baseDietaryTags, 'high-protein'],
            components: [
              buildCanonicalMealComponent('Greek curd', '200 g', { calories: 146, proteinGrams: 20, carbsGrams: 8, fatGrams: 4 }),
              buildCanonicalMealComponent('Fruit and seeds', '1 topping set', { calories: 162, proteinGrams: 5, carbsGrams: 20, fatGrams: 6, fibreGrams: 5 }),
            ],
          },
          {
            name: 'Vegetable oats cheela with curd',
            portion: '2 cheelas + 100 g curd',
            prepNote: 'Balances fibre and protein without relying on refined breads.',
            cuisineTags: ['indian'],
            dietaryTags: baseDietaryTags,
            components: [
              buildCanonicalMealComponent('Oats cheela', '2 medium', { calories: 300, proteinGrams: 12, carbsGrams: 36, fatGrams: 10, fibreGrams: 6 }),
              buildCanonicalMealComponent('Curd', '100 g', { calories: 62, proteinGrams: 3.5, carbsGrams: 4.8, fatGrams: 3 }),
            ],
          },
          {
            name: 'Tofu poha bowl',
            portion: '1 large bowl',
            prepNote: 'A familiar Indian breakfast with better protein density.',
            cuisineTags: ['indian'],
            dietaryTags: [...baseDietaryTags, 'high-protein'],
            components: [
              buildCanonicalMealComponent('Vegetable poha', '1 bowl', { calories: 290, proteinGrams: 7, carbsGrams: 47, fatGrams: 8, fibreGrams: 4 }),
              buildCanonicalMealComponent('Sauteed tofu', '100 g', { calories: 144, proteinGrams: 15, carbsGrams: 4, fatGrams: 8, fibreGrams: 2 }),
            ],
          },
          {
            name: 'Besan omelette-style pancake with curd',
            portion: '2 pancakes + 100 g curd',
            prepNote: 'Good for clients wanting a savoury repeatable option.',
            cuisineTags: ['indian'],
            dietaryTags: baseDietaryTags,
            components: [
              buildCanonicalMealComponent('Besan pancake', '2 medium', { calories: 310, proteinGrams: 14, carbsGrams: 30, fatGrams: 12, fibreGrams: 5 }),
              buildCanonicalMealComponent('Curd', '100 g', { calories: 62, proteinGrams: 3.5, carbsGrams: 4.8, fatGrams: 3 }),
            ],
          },
        ]
      : [
          {
            name: 'Egg bhurji with multigrain toast',
            portion: '2 eggs + 2 toast slices',
            prepNote: 'A practical high-protein breakfast for busy workdays.',
            cuisineTags: ['indian'],
            dietaryTags: ['high-protein'],
            components: [
              buildCanonicalMealComponent('Egg bhurji', '2 eggs', { calories: 210, proteinGrams: 14, carbsGrams: 4, fatGrams: 15 }),
              buildCanonicalMealComponent('Multigrain toast', '2 slices', { calories: 180, proteinGrams: 8, carbsGrams: 28, fatGrams: 4, fibreGrams: 4 }),
            ],
          },
          {
            name: 'Chicken oats bowl',
            portion: '1 breakfast bowl',
            prepNote: 'Useful when protein is a high priority in the morning.',
            cuisineTags: ['continental'],
            dietaryTags: ['high-protein'],
            components: [
              buildCanonicalMealComponent('Cooked oats', '1 cup', { calories: 154, proteinGrams: 5, carbsGrams: 27, fatGrams: 3, fibreGrams: 4 }),
              buildCanonicalMealComponent('Shredded chicken', '100 g', { calories: 165, proteinGrams: 31, carbsGrams: 0, fatGrams: 4 }),
            ],
          },
          {
            name: 'Greek curd bowl with nuts and berries',
            portion: '250 g bowl',
            prepNote: 'A lighter option that still protects protein distribution.',
            cuisineTags: ['continental'],
            dietaryTags: ['high-protein'],
            components: [
              buildCanonicalMealComponent('Greek curd', '200 g', { calories: 146, proteinGrams: 20, carbsGrams: 8, fatGrams: 4 }),
              buildCanonicalMealComponent('Berries and nuts', '1 topping set', { calories: 170, proteinGrams: 5, carbsGrams: 16, fatGrams: 8, fibreGrams: 4 }),
            ],
          },
          {
            name: 'Egg dosa with sambar',
            portion: '2 dosas + 1 cup sambar',
            prepNote: 'Better for clients who prefer a familiar breakfast plate.',
            cuisineTags: ['south-indian'],
            dietaryTags: ['high-protein'],
            components: [
              buildCanonicalMealComponent('Egg dosa', '2 medium', { calories: 320, proteinGrams: 18, carbsGrams: 30, fatGrams: 12 }),
              buildCanonicalMealComponent('Sambar', '1 cup', { calories: 110, proteinGrams: 5, carbsGrams: 14, fatGrams: 3, fibreGrams: 4 }),
            ],
          },
          {
            name: 'Paneer and egg breakfast wrap',
            portion: '1 wrap',
            prepNote: 'A portable option for long commute days.',
            cuisineTags: ['indian'],
            dietaryTags: ['high-protein'],
            components: [
              buildCanonicalMealComponent('Whole wheat wrap', '1 wrap', { calories: 180, proteinGrams: 6, carbsGrams: 28, fatGrams: 4, fibreGrams: 4 }),
              buildCanonicalMealComponent('Paneer and egg filling', '1 filling', { calories: 245, proteinGrams: 22, carbsGrams: 4, fatGrams: 15 }),
            ],
          },
        ],
    midMorningSnack: [
      {
        name: 'Curd with roasted flax and fruit',
        portion: '1 cup',
        prepNote: 'Helps avoid long gaps between breakfast and lunch.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Curd', '150 g', { calories: 93, proteinGrams: 5.2, carbsGrams: 7.2, fatGrams: 4.5 }),
          buildCanonicalMealComponent('Fruit and flax', '1 side portion', { calories: 112, proteinGrams: 2.6, carbsGrams: 19, fatGrams: 3, fibreGrams: 4 }),
        ],
      },
      {
        name: 'Fruit with roasted chana',
        portion: '1 fruit + 25 g chana',
        prepNote: 'Keeps the snack simple without becoming a meal replacement.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Seasonal fruit', '1 serving', { calories: 85, proteinGrams: 1.2, carbsGrams: 20, fibreGrams: 3 }),
          buildCanonicalMealComponent('Roasted chana', '25 g', { calories: 92, proteinGrams: 5.4, carbsGrams: 14.5, fatGrams: 1.4, fibreGrams: 3 }),
        ],
      },
      {
        name: 'Buttermilk with peanuts',
        portion: '250 ml + 15 g peanuts',
        prepNote: 'Hydration support with moderate satiety.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Buttermilk', '250 ml', { calories: 50, proteinGrams: 3, carbsGrams: 5.5, fatGrams: 1.8 }),
          buildCanonicalMealComponent('Peanuts', '15 g', { calories: 85, proteinGrams: 4, carbsGrams: 3, fatGrams: 7, fibreGrams: 1.5 }),
        ],
      },
      {
        name: 'Apple with seed mix',
        portion: '1 apple + 1 tbsp seed mix',
        prepNote: 'Works for clients who prefer a crunchier snack.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['continental'],
        components: [
          buildCanonicalMealComponent('Apple', '1 medium', { calories: 95, proteinGrams: 0.5, carbsGrams: 25, fibreGrams: 4 }),
          buildCanonicalMealComponent('Seed mix', '1 tbsp', { calories: 62, proteinGrams: 2.5, carbsGrams: 2.5, fatGrams: 5, fibreGrams: 1.2 }),
        ],
      },
      {
        name: 'Protein lassi',
        portion: '250 ml glass',
        prepNote: 'Useful on days when breakfast protein was lighter than planned.',
        dietaryTags: ['vegetarian', 'high-protein'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Unsweetened lassi', '250 ml', { calories: 120, proteinGrams: 7, carbsGrams: 12, fatGrams: 4 }),
          buildCanonicalMealComponent('Whey or curd protein add-in', '1 scoop equivalent', { calories: 65, proteinGrams: 10, carbsGrams: 2, fatGrams: 1 }),
        ],
      },
    ],
    lunch: vegetarian
      ? [
          {
            name: 'Dal, sabzi, curd and roti plate',
            portion: '1 plate',
            prepNote: 'Classic balanced lunch with fibre and protein together.',
            dietaryTags: ['vegetarian'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Dal', '1 cup', { calories: 180, proteinGrams: 11, carbsGrams: 26, fatGrams: 3, fibreGrams: 6 }),
              buildCanonicalMealComponent('Sabzi', '1 cup', { calories: 120, proteinGrams: 4, carbsGrams: 18, fatGrams: 4, fibreGrams: 6 }),
              buildCanonicalMealComponent('Curd', '150 g', { calories: 93, proteinGrams: 5.2, carbsGrams: 7.2, fatGrams: 4.5 }),
              buildCanonicalMealComponent('Phulka', '2 medium', { calories: 210, proteinGrams: 6, carbsGrams: 42, fatGrams: 3, fibreGrams: 5 }),
            ],
          },
          {
            name: 'Rajma rice with salad',
            portion: '1 bowl + salad',
            prepNote: 'Use controlled rice portion with visible salad volume.',
            dietaryTags: ['vegetarian'],
            cuisineTags: ['north-indian'],
            components: [
              buildCanonicalMealComponent('Rajma', '1 cup', { calories: 215, proteinGrams: 13, carbsGrams: 34, fatGrams: 4, fibreGrams: 8 }),
              buildCanonicalMealComponent('Cooked rice', '1 cup', { calories: 205, proteinGrams: 4, carbsGrams: 45, fatGrams: 0.4, fibreGrams: 0.6 }),
              buildCanonicalMealComponent('Salad', '1 side bowl', { calories: 50, proteinGrams: 2, carbsGrams: 10, fatGrams: 0.5, fibreGrams: 4 }),
            ],
          },
          {
            name: 'Paneer millet bowl',
            portion: '1 large bowl',
            prepNote: 'Supports stronger protein intake when consultant needs a denser lunch.',
            dietaryTags: ['vegetarian', 'high-protein'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Paneer', '100 g', { calories: 265, proteinGrams: 18, carbsGrams: 4, fatGrams: 21 }),
              buildCanonicalMealComponent('Cooked millet', '1 cup', { calories: 220, proteinGrams: 6, carbsGrams: 42, fatGrams: 3.5, fibreGrams: 3 }),
              buildCanonicalMealComponent('Vegetable mix', '1 cup', { calories: 95, proteinGrams: 4, carbsGrams: 14, fatGrams: 3, fibreGrams: 5 }),
            ],
          },
          {
            name: 'Soya keema roti plate',
            portion: '1 plate',
            prepNote: 'Works well when vegetarian protein needs to be pushed higher.',
            dietaryTags: ['vegetarian', 'high-protein'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Soya keema', '1 cup', { calories: 240, proteinGrams: 22, carbsGrams: 16, fatGrams: 8, fibreGrams: 7 }),
              buildCanonicalMealComponent('Phulka', '2 medium', { calories: 210, proteinGrams: 6, carbsGrams: 42, fatGrams: 3, fibreGrams: 5 }),
              buildCanonicalMealComponent('Curd', '100 g', { calories: 62, proteinGrams: 3.5, carbsGrams: 4.8, fatGrams: 3 }),
            ],
          },
          {
            name: 'Chole quinoa bowl',
            portion: '1 large bowl',
            prepNote: 'Useful when lunch needs better fibre and satiety.',
            dietaryTags: ['vegetarian'],
            cuisineTags: ['fusion'],
            components: [
              buildCanonicalMealComponent('Chole', '1 cup', { calories: 230, proteinGrams: 12, carbsGrams: 34, fatGrams: 6, fibreGrams: 8 }),
              buildCanonicalMealComponent('Cooked quinoa', '1 cup', { calories: 222, proteinGrams: 8, carbsGrams: 39, fatGrams: 3.5, fibreGrams: 5 }),
              buildCanonicalMealComponent('Salad', '1 bowl', { calories: 45, proteinGrams: 2, carbsGrams: 8, fatGrams: 0.3, fibreGrams: 3 }),
            ],
          },
        ]
      : [
          {
            name: 'Chicken dal rice plate',
            portion: '1 plate',
            prepNote: 'Balances carb load with stronger protein support.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Grilled chicken', '120 g', { calories: 198, proteinGrams: 36, carbsGrams: 0, fatGrams: 5 }),
              buildCanonicalMealComponent('Dal', '1 cup', { calories: 180, proteinGrams: 11, carbsGrams: 26, fatGrams: 3, fibreGrams: 6 }),
              buildCanonicalMealComponent('Cooked rice', '0.75 cup', { calories: 154, proteinGrams: 3, carbsGrams: 34, fatGrams: 0.3 }),
              buildCanonicalMealComponent('Salad', '1 bowl', { calories: 45, proteinGrams: 2, carbsGrams: 8, fibreGrams: 3 }),
            ],
          },
          {
            name: 'Fish curry millet plate',
            portion: '1 plate',
            prepNote: 'Good for clients preferring a lighter but still protein-adequate lunch.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['coastal-indian'],
            components: [
              buildCanonicalMealComponent('Fish curry', '120 g fish + gravy', { calories: 240, proteinGrams: 28, carbsGrams: 8, fatGrams: 10 }),
              buildCanonicalMealComponent('Cooked millet', '1 cup', { calories: 220, proteinGrams: 6, carbsGrams: 42, fatGrams: 3.5, fibreGrams: 3 }),
              buildCanonicalMealComponent('Vegetable side', '1 cup', { calories: 95, proteinGrams: 4, carbsGrams: 14, fatGrams: 3, fibreGrams: 5 }),
            ],
          },
          {
            name: 'Chicken roti curd thali',
            portion: '1 thali',
            prepNote: 'Helpful for clients who need a familiar lunch structure.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['north-indian'],
            components: [
              buildCanonicalMealComponent('Chicken curry', '120 g', { calories: 260, proteinGrams: 30, carbsGrams: 6, fatGrams: 12 }),
              buildCanonicalMealComponent('Phulka', '2 medium', { calories: 210, proteinGrams: 6, carbsGrams: 42, fatGrams: 3, fibreGrams: 5 }),
              buildCanonicalMealComponent('Curd', '150 g', { calories: 93, proteinGrams: 5.2, carbsGrams: 7.2, fatGrams: 4.5 }),
            ],
          },
          {
            name: 'Egg curry quinoa bowl',
            portion: '1 large bowl',
            prepNote: 'Useful when consultant wants a balanced protein plus fibre pattern.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['fusion'],
            components: [
              buildCanonicalMealComponent('Egg curry', '2 eggs', { calories: 220, proteinGrams: 14, carbsGrams: 6, fatGrams: 14 }),
              buildCanonicalMealComponent('Cooked quinoa', '1 cup', { calories: 222, proteinGrams: 8, carbsGrams: 39, fatGrams: 3.5, fibreGrams: 5 }),
              buildCanonicalMealComponent('Moong salad', '1 side bowl', { calories: 90, proteinGrams: 6, carbsGrams: 13, fatGrams: 1, fibreGrams: 4 }),
            ],
          },
          {
            name: 'Lean mutton and vegetable plate',
            portion: '1 balanced plate',
            prepNote: 'Reserve for clients who tolerate richer lunches without sluggishness.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Lean mutton curry', '100 g', { calories: 250, proteinGrams: 24, carbsGrams: 5, fatGrams: 15 }),
              buildCanonicalMealComponent('Phulka', '2 medium', { calories: 210, proteinGrams: 6, carbsGrams: 42, fatGrams: 3, fibreGrams: 5 }),
              buildCanonicalMealComponent('Vegetable side', '1 cup', { calories: 95, proteinGrams: 4, carbsGrams: 14, fatGrams: 3, fibreGrams: 5 }),
            ],
          },
        ],
    eveningSnack: [
      {
        name: 'Roasted makhana with tea',
        portion: '1 bowl',
        prepNote: 'Useful when the client snacks out of routine rather than hunger.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Roasted makhana', '25 g', { calories: 95, proteinGrams: 3, carbsGrams: 17, fatGrams: 2, fibreGrams: 2 }),
          buildCanonicalMealComponent('Milk tea without sugar', '1 cup', { calories: 55, proteinGrams: 2, carbsGrams: 6, fatGrams: 2 }),
        ],
      },
      {
        name: 'Sprouts chaat',
        portion: '1 bowl',
        prepNote: 'Brings fibre and protein into the highest-craving window.',
        dietaryTags: ['vegetarian', 'high-protein'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Sprouts mix', '1 bowl', { calories: 165, proteinGrams: 11, carbsGrams: 24, fatGrams: 2, fibreGrams: 6 }),
        ],
      },
      {
        name: 'Curd bowl with berries',
        portion: '1 bowl',
        prepNote: 'A lower-effort option that still protects satiety.',
        dietaryTags: ['vegetarian', 'high-protein'],
        cuisineTags: ['continental'],
        components: [
          buildCanonicalMealComponent('Greek curd', '150 g', { calories: 110, proteinGrams: 15, carbsGrams: 6, fatGrams: 3 }),
          buildCanonicalMealComponent('Berries', '1 small serving', { calories: 45, proteinGrams: 0.5, carbsGrams: 11, fibreGrams: 2 }),
        ],
      },
      {
        name: 'Boiled chana bowl',
        portion: '1 bowl',
        prepNote: 'Good for commute or post-work hunger protection.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Boiled chana', '1 bowl', { calories: 180, proteinGrams: 10, carbsGrams: 28, fatGrams: 3, fibreGrams: 8 }),
        ],
      },
      {
        name: 'Protein smoothie',
        portion: '1 glass',
        prepNote: 'Use on days when lunch protein intake falls short.',
        dietaryTags: ['vegetarian', 'high-protein'],
        cuisineTags: ['continental'],
        components: [
          buildCanonicalMealComponent('Protein smoothie', '1 glass', { calories: 210, proteinGrams: 18, carbsGrams: 20, fatGrams: 5, fibreGrams: 3 }),
        ],
      },
    ],
    dinner: vegetarian
      ? [
          {
            name: 'Paneer vegetable bowl',
            portion: '1 bowl',
            prepNote: 'Keep the plate lighter than lunch while protecting protein.',
            dietaryTags: ['vegetarian', 'high-protein'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Paneer', '90 g', { calories: 239, proteinGrams: 16, carbsGrams: 3.5, fatGrams: 19 }),
              buildCanonicalMealComponent('Mixed vegetables', '1.5 cups', { calories: 150, proteinGrams: 6, carbsGrams: 20, fatGrams: 5, fibreGrams: 8 }),
            ],
          },
          {
            name: 'Dal soup with sauteed tofu',
            portion: '1 bowl + 100 g tofu',
            prepNote: 'Useful when appetite is lower in the evening.',
            dietaryTags: ['vegetarian', 'high-protein'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Dal soup', '1.5 cups', { calories: 220, proteinGrams: 13, carbsGrams: 30, fatGrams: 4, fibreGrams: 7 }),
              buildCanonicalMealComponent('Sauteed tofu', '100 g', { calories: 144, proteinGrams: 15, carbsGrams: 4, fatGrams: 8, fibreGrams: 2 }),
            ],
          },
          {
            name: 'Khichdi with curd',
            portion: '1 bowl + 100 g curd',
            prepNote: 'Good on days when digestion feels heavier.',
            dietaryTags: ['vegetarian'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Moong khichdi', '1 bowl', { calories: 290, proteinGrams: 11, carbsGrams: 46, fatGrams: 6, fibreGrams: 5 }),
              buildCanonicalMealComponent('Curd', '100 g', { calories: 62, proteinGrams: 3.5, carbsGrams: 4.8, fatGrams: 3 }),
            ],
          },
          {
            name: 'Tofu stir fry with soup',
            portion: '1 plate + 1 cup soup',
            prepNote: 'Supports lighter evenings with decent protein density.',
            dietaryTags: ['vegetarian', 'high-protein'],
            cuisineTags: ['asian-fusion'],
            components: [
              buildCanonicalMealComponent('Tofu stir fry', '1 plate', { calories: 250, proteinGrams: 18, carbsGrams: 16, fatGrams: 11, fibreGrams: 5 }),
              buildCanonicalMealComponent('Clear vegetable soup', '1 cup', { calories: 80, proteinGrams: 3, carbsGrams: 10, fatGrams: 2, fibreGrams: 2 }),
            ],
          },
          {
            name: 'Vegetable besan cheela dinner',
            portion: '2 cheelas',
            prepNote: 'Works when dinner needs to stay simple and repeatable.',
            dietaryTags: ['vegetarian'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Besan cheela', '2 medium', { calories: 310, proteinGrams: 14, carbsGrams: 30, fatGrams: 12, fibreGrams: 5 }),
              buildCanonicalMealComponent('Mint curd dip', '1 small bowl', { calories: 55, proteinGrams: 3, carbsGrams: 3, fatGrams: 3 }),
            ],
          },
        ]
      : [
          {
            name: 'Grilled chicken with vegetables',
            portion: '120 g chicken + 1.5 cups vegetables',
            prepNote: 'A lighter evening option with strong protein density.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['continental'],
            components: [
              buildCanonicalMealComponent('Grilled chicken', '120 g', { calories: 198, proteinGrams: 36, carbsGrams: 0, fatGrams: 5 }),
              buildCanonicalMealComponent('Sauteed vegetables', '1.5 cups', { calories: 150, proteinGrams: 6, carbsGrams: 20, fatGrams: 5, fibreGrams: 8 }),
            ],
          },
          {
            name: 'Fish and vegetable soup dinner',
            portion: '1 fish serving + 1 soup bowl',
            prepNote: 'Useful when consultant wants recovery-focused lighter dinners.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['coastal-indian'],
            components: [
              buildCanonicalMealComponent('Fish fillet', '120 g', { calories: 176, proteinGrams: 30, carbsGrams: 0, fatGrams: 6 }),
              buildCanonicalMealComponent('Vegetable soup', '1 bowl', { calories: 105, proteinGrams: 5, carbsGrams: 14, fatGrams: 3, fibreGrams: 4 }),
            ],
          },
          {
            name: 'Egg curry with sauteed spinach',
            portion: '2 eggs + spinach side',
            prepNote: 'Helps maintain satiety without a heavy grain load.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Egg curry', '2 eggs', { calories: 220, proteinGrams: 14, carbsGrams: 6, fatGrams: 14 }),
              buildCanonicalMealComponent('Sauteed spinach', '1.5 cups', { calories: 95, proteinGrams: 6, carbsGrams: 10, fatGrams: 4, fibreGrams: 5 }),
            ],
          },
          {
            name: 'Chicken soup with millet khichdi',
            portion: '1 soup bowl + 1 small bowl khichdi',
            prepNote: 'Supports recovery when appetite is variable at night.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['indian'],
            components: [
              buildCanonicalMealComponent('Chicken soup', '1 bowl', { calories: 140, proteinGrams: 18, carbsGrams: 8, fatGrams: 4 }),
              buildCanonicalMealComponent('Millet khichdi', '1 small bowl', { calories: 205, proteinGrams: 6, carbsGrams: 32, fatGrams: 5, fibreGrams: 4 }),
            ],
          },
          {
            name: 'Prawn stir fry bowl',
            portion: '1 bowl',
            prepNote: 'Works for clients who enjoy seafood and lighter evening meals.',
            dietaryTags: ['high-protein'],
            cuisineTags: ['coastal-indian'],
            components: [
              buildCanonicalMealComponent('Prawns', '120 g', { calories: 118, proteinGrams: 24, carbsGrams: 1, fatGrams: 1.5 }),
              buildCanonicalMealComponent('Vegetable stir fry', '1.5 cups', { calories: 165, proteinGrams: 5, carbsGrams: 20, fatGrams: 7, fibreGrams: 5 }),
            ],
          },
        ],
    bedtimeNutrition: [
      {
        name: 'Turmeric milk',
        portion: '1 cup',
        prepNote: 'Use only when the client benefits from a bedtime nourishment anchor.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Turmeric milk', '1 cup', { calories: 125, proteinGrams: 6, carbsGrams: 12, fatGrams: 5 }),
        ],
      },
      {
        name: 'Curd with cinnamon',
        portion: '1 small bowl',
        prepNote: 'A lighter bedtime option when dinner was already adequate.',
        dietaryTags: ['vegetarian', 'high-protein'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Curd', '120 g', { calories: 75, proteinGrams: 4.2, carbsGrams: 5.8, fatGrams: 3.6 }),
        ],
      },
      {
        name: 'Warm soy milk',
        portion: '1 cup',
        prepNote: 'Useful for dairy-light preferences.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['continental'],
        components: [
          buildCanonicalMealComponent('Soy milk', '1 cup', { calories: 95, proteinGrams: 7, carbsGrams: 8, fatGrams: 4 }),
        ],
      },
      {
        name: 'Nut and seed mini mix',
        portion: '1 small serving',
        prepNote: 'Choose when hunger is light and a chewable option is preferred.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Nut and seed mix', '15 g', { calories: 92, proteinGrams: 3.5, carbsGrams: 4, fatGrams: 7, fibreGrams: 1.8 }),
        ],
      },
      {
        name: 'Unsweetened kefir or buttermilk',
        portion: '1 glass',
        prepNote: 'Can be useful where digestion support is a bedtime focus.',
        dietaryTags: ['vegetarian'],
        cuisineTags: ['indian'],
        components: [
          buildCanonicalMealComponent('Unsweetened kefir/buttermilk', '200 ml', { calories: 70, proteinGrams: 4.5, carbsGrams: 6, fatGrams: 2.5 }),
        ],
      },
    ],
  };

  return (definitions[input.mealKey] ?? []).map((definition, index) =>
    buildCanonicalMealSlot({
      mealKey: input.mealKey,
      index,
      name: definition.name,
      portion: definition.portion,
      prepNote: definition.prepNote,
      target: input.target,
      cuisineTags: definition.cuisineTags,
      dietaryTags: definition.dietaryTags,
      components: definition.components,
    }),
  );
};

const mealSection = (
  mealKey: keyof NutritionPlanContent['mealPlan'],
  window: string,
  focus: string,
  target: ReturnType<typeof deriveMealTargets>[keyof ReturnType<typeof deriveMealTargets>],
): NutritionMealSection => ({
  window,
  focus,
  target,
  recommendationSets: [],
  options: [],
  availableOptions: [],
});

const buildDraftContent = (input: {
  clientName: string;
  age: number | null;
  gender: string | null;
  goals: string[];
  conditions: string[];
  dietPreference: string | null;
  allergies: string[];
  avoidedFoods?: string[];
  avoidedFoodIds?: string[];
  likedFoodIds?: string[];
  preferredCuisines?: string[];
  regionalCuisine: string | null;
  lifestyleSummary: string;
  programmeName: string;
  preparedBy: string;
  intelligence: NutritionIntelligence;
  calorieTarget: number | null;
  proteinTargetGrams: number | null;
  hydrationTargetLiters: number | null;
}) => {
  const mealTargets = deriveMealTargets({
    caloriesTarget: input.calorieTarget,
    proteinTargetGrams: input.proteinTargetGrams,
  });

  return {
    nutritionSnapshot: {
      client: input.clientName,
      age: input.age,
      gender: input.gender,
      goals: input.goals,
      healthConditions: input.conditions,
      dietPreference: input.dietPreference,
      allergies: input.allergies,
      lifestyleSummary: input.lifestyleSummary,
      personalisedPlanFocus: input.intelligence.nutritionFocus.join(', ') || 'build meal consistency and recovery support',
      programmeName: input.programmeName,
      preparedBy: input.preparedBy,
    },
    dailyTargets: {
      calories: input.calorieTarget,
      protein: input.proteinTargetGrams,
      hydration: input.hydrationTargetLiters,
      movement: '20-30 min walk or consultant-approved movement block',
    },
    mealPlan: {
      earlyMorning: mealSection('earlyMorning', '6:00-7:30 AM', 'Gentle metabolic wake-up', mealTargets.earlyMorning),
      breakfast: mealSection('breakfast', '8:00-9:30 AM', 'Protein-first breakfast', mealTargets.breakfast),
      midMorningSnack: mealSection('midMorningSnack', '11:00-11:30 AM', 'Steady energy between meals', mealTargets.midMorningSnack),
      lunch: mealSection('lunch', '1:00-2:30 PM', 'Balanced lunch plate', mealTargets.lunch),
      eveningSnack: mealSection('eveningSnack', '4:30-5:30 PM', 'Prevent cravings and energy dips', mealTargets.eveningSnack),
      dinner: mealSection('dinner', '7:30-9:00 PM', 'Lighter dinner for recovery', mealTargets.dinner),
      bedtimeNutrition: mealSection('bedtimeNutrition', '9:30-10:30 PM', 'Support sleep and overnight satiety', mealTargets.bedtimeNutrition),
    },
    hydrationRhythm: [
      { slot: 1, anchor: 'On waking', quantity: '300-400 ml', note: 'Start early so hydration is not back-loaded at night.' },
      { slot: 2, anchor: 'With breakfast', quantity: '250-300 ml', note: 'Keep a bottle visible during the morning work block.' },
      { slot: 3, anchor: 'Before lunch', quantity: '300 ml', note: 'Useful for appetite pacing and meal consistency.' },
      { slot: 4, anchor: 'Mid-afternoon', quantity: '300 ml', note: 'Protects against fatigue-driven snacking.' },
      { slot: 5, anchor: 'Early evening', quantity: '250-300 ml', note: 'Finish most of the daily target before late evening.' },
    ],
    weeklySuccessGuide: [
      'Repeat the easiest breakfast option on your busiest three days.',
      'Anchor hydration to existing work or home transitions.',
      'Do not skip lunch after a heavy breakfast; keep portions balanced instead.',
      'Track sleep, hunger, bloating, and energy in the app for plan refinement.',
      'Use one planned snack instead of multiple reactive convenience foods.',
      'Keep dinner lighter than lunch when sleep quality is low.',
      'Review supplement tolerance and adherence with the consultant before changing dose.',
      'Use the substitution table instead of dropping the meal entirely.',
    ],
    smartSubstitutions: [
      { foodGroup: 'Protein', usualChoice: 'Current routine protein choice', alternative: 'Use verified meal options chosen by the consultant from pulses, dairy, tofu, eggs, fish, or lean meats as appropriate' },
      { foodGroup: 'Cereal / grain', usualChoice: 'Refined roti / white bread', alternative: 'Millet roti / oats / brown rice / hand-pounded rice' },
      { foodGroup: 'Vegetable', usualChoice: 'Minimal salad intake', alternative: '1 cooked sabzi + 1 raw vegetable element daily' },
      { foodGroup: 'Fruit', usualChoice: 'Juice or sweet beverage', alternative: 'Whole fruit paired with nuts or curd' },
      { foodGroup: 'Dairy / equivalent', usualChoice: 'Sweetened dairy drink', alternative: 'Unsweetened curd / buttermilk / soy curd' },
    ],
    supplementsAndClinicalNotes: [
      { supplement: 'Consultant review only', dose: 'As advised', timing: 'After review', duration: 'To be confirmed', note: 'Do not initiate supplements without consultant or clinician approval.' },
      { supplement: 'Current supplement reconciliation', dose: 'Existing regimen', timing: 'Review current timing', duration: 'Ongoing', note: 'Match this section against the client’s current supplement and medication history.' },
      { supplement: '', dose: '', timing: '', duration: '', note: '' },
    ],
  } satisfies NutritionPlanContent;
};

const enrichRecommendationSets = (content: NutritionPlanContent): NutritionPlanContent =>
  normalizeNutritionPlanContent(content);

const enrichMealPlanWithLibraryMatches = async (input: {
  content: NutritionPlanContent;
  consultantId: string;
  dietPreference: string | null;
  allergies: string[];
  avoidedFoods?: string[];
  avoidedFoodIds?: string[];
  likedFoodIds?: string[];
  preferredCuisines?: string[];
}) => {
  const nextMealPlanEntries = await Promise.all(
    Object.entries(input.content.mealPlan).map(async ([mealKey, section]) => {
      const verifiedMatches = await listMealLibrarySlotsForTarget({
        mealKey,
        target: section.target,
        consultantId: input.consultantId,
        dietPreference: input.dietPreference,
        allergyTags: input.allergies,
        avoidedFoods: input.avoidedFoods,
        avoidedFoodIds: input.avoidedFoodIds,
        likedFoodIds: input.likedFoodIds,
        preferredCuisines: input.preferredCuisines,
        limit: AVAILABLE_LIBRARY_MATCH_LIMIT,
      });
      const fallbackMatches = buildCanonicalMealLibraryFallback({
        mealKey: mealKey as keyof NutritionPlanContent['mealPlan'],
        target: section.target,
        dietPreference: input.dietPreference,
      });
      const curatedMatches = verifiedMatches.length ? verifiedMatches : fallbackMatches;

      return [
        mealKey,
        {
          ...section,
          options: [],
          availableOptions: curatedMatches.map((option, index) => ({
            ...option,
            slot: index + 1,
          })),
        },
      ] as const;
    }),
  );

  return {
    ...input.content,
    mealPlan: Object.fromEntries(nextMealPlanEntries) as unknown as NutritionPlanContent['mealPlan'],
  };
};

const buildSourceSnapshot = (input: {
  bmi: number | null;
  weightKg: number | null;
  biomarkers: ConsultantBiomarkerSummary[];
  healthProfile: Record<string, unknown>;
  calorieTarget: number | null;
  proteinTargetGrams: number | null;
  hydrationTargetLiters: number | null;
  wellnessScores: NutritionPlanSourceSnapshot['wellnessScores'];
  stressAssessment: NutritionPlanSourceSnapshot['stressAssessment'];
}): NutritionPlanSourceSnapshot => ({
  bmi: input.bmi,
  weightKg: input.weightKg,
  biomarkers: input.biomarkers.map((item) => ({
    name: item.name,
    value: item.value,
    unit: item.unit,
    status: item.status,
    referenceRange: item.referenceRange,
    testDate: item.testDate,
  })),
  healthProfile: input.healthProfile,
  calorieTarget: input.calorieTarget,
  proteinTargetGrams: input.proteinTargetGrams,
  hydrationTargetLiters: input.hydrationTargetLiters,
  wellnessScores: input.wellnessScores,
  stressAssessment: input.stressAssessment,
  generatedAtISO: new Date().toISOString(),
});

const transitionCareCaseStageBestEffort = async (
  careCase: CareCaseRecord,
  nextStage: CareCaseRecord['currentStage'],
  detail: string,
) => {
  try {
    await transitionCareCaseStage(careCase, nextStage, detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[nutrition] skipped care case stage transition', {
      careCaseId: careCase.id,
      clientId: careCase.clientId,
      fromStage: careCase.currentStage,
      toStage: nextStage,
      message,
    });
  }
};

const contentSummaryFromContent = (content: NutritionPlanContent): DietPlanVersionRecord['contentSummary'] => ({
  calories: content.dailyTargets.calories,
  protein: content.dailyTargets.protein,
  hydration: content.dailyTargets.hydration,
  focusAreas: unique([
    content.nutritionSnapshot.personalisedPlanFocus,
    ...content.weeklySuccessGuide.slice(0, 2),
  ]),
});

const assertLifecycleTransition = (
  currentLifecycle: DietPlanVersionRecord['lifecycleStatus'] | null,
  nextLifecycle: DietPlanVersionRecord['lifecycleStatus'],
) => {
  const current = currentLifecycle ?? 'draft';
  const allowedTransitions: Record<DietPlanVersionRecord['lifecycleStatus'], DietPlanVersionRecord['lifecycleStatus'][]> = {
    draft: ['review_ready'],
    review_ready: ['review_ready', 'approved'],
    approved: ['published'],
    published: ['archived'],
    archived: [],
  };

  if (!allowedTransitions[current]?.includes(nextLifecycle)) {
    throw new NutritionPlanWorkflowError(
      'INVALID_DIET_PLAN_TRANSITION',
      `Diet plan transition from ${current} to ${nextLifecycle} is not allowed.`,
    );
  }
};

const buildMacroTargets = (tdee: number | null) => {
  if (tdee == null) return null;
  const caloriesKcal = Math.round(tdee);
  return {
    caloriesKcal,
    proteinGrams: Math.round((caloriesKcal * 0.25) / 4),
    carbohydrateGrams: Math.round((caloriesKcal * 0.45) / 4),
    fatGrams: Math.round((caloriesKcal * 0.3) / 9),
  };
};

const getWorkspaceContext = async (publicClientId: string) => {
  const context = await getRegisteredConsultantClientProfileContext(publicClientId);
  if (!context) return null;
  const [healthProfile, nutritionProfile, careCase, reports, biomarkers, wearableSummary, timeline, healthScores] = await Promise.all([
    getHealthProfileByClientId(context.internalClientId),
    getNutritionProfileByClientId(context.internalClientId),
    getCareCaseByClientId(context.internalClientId),
    listConsultantReportSummariesForClient(context.internalClientId, context.accountId),
    listValidatedBiomarkerSummaryForClient(context.internalClientId, context.accountId),
    getConsultantWearableSummaryForClient(context.internalClientId, context.accountId),
    listConsultantTimelineForClient(context.internalClientId, context.accountId),
    listLatestHealthScores({ accountId: context.accountId, clientId: context.internalClientId }),
  ]);
  const metrics = calculateHealthMetrics(context.calculationInput);
  const tdee = metrics.tdee.status === 'AVAILABLE' ? metrics.tdee.value : null;
  const macroTargets = buildMacroTargets(tdee);
  const hydrationTargetLiters = context.calculationInput.weightKg
    ? round(Math.max(2, context.calculationInput.weightKg * 0.035), 1)
    : null;
  const healthEvents = careCase ? await listHealthEvents(careCase.id) : [];
  const latestStressAssessment = healthEvents
    .filter((event) => event.type === 'stress_assessment_completed')
    .sort((a, b) => b.eventTimeISO.localeCompare(a.eventTimeISO))[0] ?? null;
  const scoreByType = new Map(healthScores.map((item) => [item.scoreType, item.scoreValue]));

  return {
    context,
    healthProfile,
    nutritionProfile,
    careCase,
    reports,
    biomarkers,
    wearableSummary,
    timeline,
    healthScores,
    healthEvents,
    latestStressAssessment,
    metrics,
    tdee,
    macroTargets,
    hydrationTargetLiters,
    scoreByType,
  };
};

export const getConsultantNutritionIntelligence = async (publicClientId: string) => {
  const workspace = await getWorkspaceContext(publicClientId);
  if (!workspace) return null;
  const { context, healthProfile, reports, biomarkers, metrics, macroTargets, hydrationTargetLiters } = workspace;
  const conditions = unique([
    ...(healthProfile?.primaryConditions ?? []),
    ...(context.profile.onboarding.medicalConditions ?? []),
  ]);
  const lifestyleSummary = summarizeLifestyle({
    occupation: healthProfile?.occupation,
    workMode: healthProfile?.workMode,
    wakeTime: healthProfile?.wakeTime,
    sleepTime: healthProfile?.sleepTime,
    activityLevel: healthProfile?.activityLevel,
  });
  const wellnessScores = {
    nourishment: workspace.scoreByType.get('nourishment') ?? workspace.scoreByType.get('nutrition') ?? null,
    energyBalance: workspace.scoreByType.get('energy_balance') ?? workspace.scoreByType.get('sleep') ?? null,
    bodySupport: workspace.scoreByType.get('body_support') ?? workspace.scoreByType.get('clinical') ?? null,
    recovery: workspace.scoreByType.get('recovery') ?? null,
    activePerformance: workspace.scoreByType.get('active_performance') ?? workspace.scoreByType.get('activity') ?? null,
    physicalWellnessIndex: workspace.scoreByType.get('physical_wellness_index') ?? workspace.scoreByType.get('overall') ?? null,
    stressResilience: workspace.scoreByType.get('stress_resilience') ?? workspace.scoreByType.get('calm') ?? null,
  } as const;
  const stressAssessment = (workspace.latestStressAssessment?.payload?.result ?? null) as NutritionPlanSourceSnapshot['stressAssessment'];
  const intelligence = buildNutritionIntelligence({
    bmi: metrics.bmi.status === 'AVAILABLE' ? metrics.bmi.value : null,
    dietPreference: healthProfile?.dietType ?? context.profile.onboarding.dietPreference,
    activityLevel: healthProfile?.activityLevel ?? context.profile.onboarding.activityLevel,
    sleepQuality: healthProfile?.sleepQualityLabel ?? context.profile.onboarding.lifestyle.sleepQuality,
    waterIntakeLiters: healthProfile?.waterIntakeLiters ?? context.profile.onboarding.nutrition.waterIntakeLiters,
    hydrationTargetLiters,
    goal: context.profile.onboarding.goal,
    age: context.profile.client.age,
    gender: context.profile.client.gender,
    weightKg: context.calculationInput.weightKg,
    proteinTargetGrams: macroTargets?.proteinGrams ?? null,
    carbohydrateTargetGrams: macroTargets?.carbohydrateGrams ?? null,
    fatTargetGrams: macroTargets?.fatGrams ?? null,
    caloriesTarget: macroTargets?.caloriesKcal ?? null,
    conditions,
    biomarkers,
    reportsCount: reports.length,
    lifestyleSummary,
    wearableConnected: workspace.wearableSummary.connected,
    wellnessScores,
    stressAssessment,
  });

  return {
    clientId: publicClientId,
    nutritionSnapshot: {
      goal: context.profile.onboarding.goal,
      bmi: metrics.bmi.status === 'AVAILABLE' ? metrics.bmi.value : null,
      currentWeightKg: context.calculationInput.weightKg,
      caloriesTarget: macroTargets?.caloriesKcal ?? null,
      proteinTargetGrams: macroTargets?.proteinGrams ?? null,
      hydrationTargetLiters,
      activityLevel: healthProfile?.activityLevel ?? context.profile.onboarding.activityLevel,
      dietPreference: healthProfile?.dietType ?? context.profile.onboarding.dietPreference,
      reportsCount: reports.length,
      sleepQuality: healthProfile?.sleepQualityLabel ?? context.profile.onboarding.lifestyle.sleepQuality,
      stressBand: stressAssessment?.stressBand ?? null,
      stressPercent: stressAssessment?.stressPercent ?? null,
      deficiencies: intelligence.deficiencies,
      abnormalities: intelligence.abnormalities,
      wearableConnected: workspace.wearableSummary.connected,
    },
    intelligence,
    sourceMetadata: {
      sourceProduct: 'Fiteatsy',
      generatedAtISO: new Date().toISOString(),
      sources: [
        'healthProfile',
        biomarkers.length ? 'biomarkers' : null,
        reports.length ? 'reports' : null,
        'bodyMetrics',
        'nutritionTargets',
        workspace.wearableSummary.connected ? 'wearables' : null,
      ].filter(Boolean),
    },
  };
};

export const generateConsultantDietPlanDraft = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  input?: {
    consultantName?: string | null;
    credentials?: string | null;
    programmeName?: string | null;
  },
) => {
  if (!isConsultantRole(account)) return null;
  const workspace = await getWorkspaceContext(publicClientId);
  if (!workspace || !workspace.careCase) return null;

  const intelligencePayload = await getConsultantNutritionIntelligence(publicClientId);
  if (!intelligencePayload) return null;

  const { context, healthProfile, careCase, metrics, macroTargets, hydrationTargetLiters, biomarkers } = workspace;
  const wellnessScores = {
    nourishment: workspace.scoreByType.get('nourishment') ?? workspace.scoreByType.get('nutrition') ?? null,
    energyBalance: workspace.scoreByType.get('energy_balance') ?? workspace.scoreByType.get('sleep') ?? null,
    bodySupport: workspace.scoreByType.get('body_support') ?? workspace.scoreByType.get('clinical') ?? null,
    recovery: workspace.scoreByType.get('recovery') ?? null,
    activePerformance: workspace.scoreByType.get('active_performance') ?? workspace.scoreByType.get('activity') ?? null,
    physicalWellnessIndex: workspace.scoreByType.get('physical_wellness_index') ?? workspace.scoreByType.get('overall') ?? null,
    stressResilience: workspace.scoreByType.get('stress_resilience') ?? workspace.scoreByType.get('calm') ?? null,
  } as const;
  const stressAssessment = (workspace.latestStressAssessment?.payload?.result ?? null) as NutritionPlanSourceSnapshot['stressAssessment'];
  const consultantDisplayName = unique([
    input?.consultantName,
    account.user.name,
  ])[0] ?? 'Consultant';
  const preparedBy = input?.credentials ? `${consultantDisplayName}, ${input.credentials}` : consultantDisplayName;
  const conditions = unique([
    ...(healthProfile?.primaryConditions ?? []),
    ...(context.profile.onboarding.medicalConditions ?? []),
  ]);
  const allergies = unique([
    ...(healthProfile?.foodAllergies ?? []),
    ...(healthProfile?.foodIntolerances ?? []),
    ...(healthProfile?.foodsDisliked ?? []),
  ]);
  const foodPreferences = await getFoodPreferenceProfile(publicClientId);
  const draftTemplate = buildDraftContent({
    clientName: context.profile.client.name,
    age: context.profile.client.age,
    gender: context.profile.client.gender,
    goals: unique([
      context.profile.onboarding.goal,
      ...(healthProfile?.wellnessGoals ?? []),
    ]),
    conditions,
    dietPreference: healthProfile?.dietType ?? context.profile.onboarding.dietPreference,
    allergies,
    regionalCuisine: healthProfile?.regionalCuisine ?? null,
    lifestyleSummary: summarizeLifestyle({
      occupation: healthProfile?.occupation,
      workMode: healthProfile?.workMode,
      wakeTime: healthProfile?.wakeTime,
      sleepTime: healthProfile?.sleepTime,
      activityLevel: healthProfile?.activityLevel,
    }),
    programmeName: input?.programmeName ?? context.profile.onboarding.goal ?? 'Personalised recovery plan',
    preparedBy,
    intelligence: intelligencePayload.intelligence,
    calorieTarget: macroTargets?.caloriesKcal ?? null,
    proteinTargetGrams: macroTargets?.proteinGrams ?? null,
    hydrationTargetLiters,
  });
  const content = enrichRecommendationSets(await enrichMealPlanWithLibraryMatches({
    content: draftTemplate,
    consultantId: account.accountId,
    dietPreference: healthProfile?.dietType ?? context.profile.onboarding.dietPreference,
    allergies,
    avoidedFoods: foodPreferences?.profile.foodsAvoided.concat(foodPreferences.profile.foodsDisliked) ?? [],
    avoidedFoodIds: [
      ...(foodPreferences?.profile.avoidedFoodIds ?? []),
      ...(foodPreferences?.profile.dislikedFoodIds ?? []),
    ],
    likedFoodIds: foodPreferences?.profile.likedFoodIds ?? [],
    preferredCuisines: foodPreferences?.profile.cuisines ?? [],
  }));
  const sourceSnapshot = buildSourceSnapshot({
    bmi: metrics.bmi.status === 'AVAILABLE' ? metrics.bmi.value : null,
    weightKg: context.calculationInput.weightKg,
    biomarkers,
    healthProfile: {
      ...(healthProfile ?? {}),
      onboardingGoal: context.profile.onboarding.goal,
    },
    calorieTarget: macroTargets?.caloriesKcal ?? null,
    proteinTargetGrams: macroTargets?.proteinGrams ?? null,
    hydrationTargetLiters,
    wellnessScores,
    stressAssessment,
  });
  const saved = await createOrUpdateDietPlanDraft({
    careCaseId: careCase.id,
    userId: context.accountId,
    consultantId: account.accountId,
    readinessScore: workspace.nutritionProfile?.readinessScore ?? null,
    templateVersion: TEMPLATE_VERSION,
    sourceSnapshot,
    content,
    contentSummary: contentSummaryFromContent(content),
    generatedBy: account.accountId,
  });
  await transitionCareCaseStageBestEffort(
    careCase,
    'ai_draft_generated',
    'Nutrition draft generated for consultant review.',
  );

  return {
    plan: saved.plan,
    version: saved.version,
    intelligence: intelligencePayload.intelligence,
  };
};

export const updateConsultantDietPlanDraft = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  dietPlanId: string,
  input: {
    content: NutritionPlanContent;
    reviewNotes?: string | null;
  },
) => {
  if (!isConsultantRole(account)) return null;
  const workspace = await getWorkspaceContext(publicClientId);
  if (!workspace) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase?.id) return null;
  const currentVersion = plan.currentVersionId ? await getCurrentDietPlanVersion(plan.id) : null;
  if (!currentVersion) return null;
  if (['approved', 'published', 'archived'].includes(currentVersion.lifecycleStatus)) {
    throw new NutritionPlanWorkflowError(
      'DIET_PLAN_NOT_EDITABLE',
      'Only draft plans can be edited. Regenerate a new draft to make changes.',
    );
  }
  const sourceSnapshot = buildSourceSnapshot({
    bmi: workspace.metrics.bmi.status === 'AVAILABLE' ? workspace.metrics.bmi.value : null,
    weightKg: workspace.context.calculationInput.weightKg,
    biomarkers: workspace.biomarkers,
    healthProfile: workspace.healthProfile ?? {},
    calorieTarget: workspace.macroTargets?.caloriesKcal ?? null,
    proteinTargetGrams: workspace.macroTargets?.proteinGrams ?? null,
    hydrationTargetLiters: workspace.hydrationTargetLiters,
    wellnessScores: {
      nourishment: workspace.scoreByType.get('nourishment') ?? workspace.scoreByType.get('nutrition') ?? null,
      energyBalance: workspace.scoreByType.get('energy_balance') ?? workspace.scoreByType.get('sleep') ?? null,
      bodySupport: workspace.scoreByType.get('body_support') ?? workspace.scoreByType.get('clinical') ?? null,
      recovery: workspace.scoreByType.get('recovery') ?? null,
      activePerformance: workspace.scoreByType.get('active_performance') ?? workspace.scoreByType.get('activity') ?? null,
      physicalWellnessIndex: workspace.scoreByType.get('physical_wellness_index') ?? workspace.scoreByType.get('overall') ?? null,
      stressResilience: workspace.scoreByType.get('stress_resilience') ?? workspace.scoreByType.get('calm') ?? null,
    },
    stressAssessment: (workspace.latestStressAssessment?.payload?.result ?? null) as NutritionPlanSourceSnapshot['stressAssessment'],
  });

  const normalizedContent = normalizeNutritionPlanContent(input.content);
  const version = await updateDietPlanVersionContent({
    dietPlanId: plan.id,
    versionId: currentVersion.id,
    content: normalizedContent,
    contentSummary: contentSummaryFromContent(normalizedContent),
    sourceSnapshot,
    lifecycleStatus: 'review_ready',
    reviewNotes: input.reviewNotes ?? null,
  });
  if (!version) return null;
  assertLifecycleTransition(currentVersion.lifecycleStatus, 'review_ready');
  const lifecycle = await updateDietPlanLifecycle({
    dietPlanId: plan.id,
    consultantId: account.accountId,
    currentVersionId: version.id,
    lifecycle: 'review_ready',
    sourceSnapshot,
  });
  return {
    plan: lifecycle?.plan ?? plan,
    version,
  };
};

export const approveConsultantDietPlan = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  dietPlanId: string,
) => {
  if (!isConsultantRole(account)) return null;
  if (!canApproveOrPublishDietPlan(account)) {
    throw new NutritionPlanWorkflowError(
      'ROLE_NOT_ALLOWED',
      'Only consultant or admin accounts can approve nutrition plans.',
      403,
    );
  }
  const workspace = await getWorkspaceContext(publicClientId);
  if (!workspace) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase?.id || !plan.currentVersionId) return null;
  const currentVersion = await getCurrentDietPlanVersion(plan.id);
  if (!currentVersion) return null;
  assertLifecycleTransition(currentVersion.lifecycleStatus, 'approved');
  const sourceSnapshot = buildSourceSnapshot({
    bmi: workspace.metrics.bmi.status === 'AVAILABLE' ? workspace.metrics.bmi.value : null,
    weightKg: workspace.context.calculationInput.weightKg,
    biomarkers: workspace.biomarkers,
    healthProfile: workspace.healthProfile ?? {},
    calorieTarget: workspace.macroTargets?.caloriesKcal ?? null,
    proteinTargetGrams: workspace.macroTargets?.proteinGrams ?? null,
    hydrationTargetLiters: workspace.hydrationTargetLiters,
    wellnessScores: {
      nourishment: workspace.scoreByType.get('nourishment') ?? workspace.scoreByType.get('nutrition') ?? null,
      energyBalance: workspace.scoreByType.get('energy_balance') ?? workspace.scoreByType.get('sleep') ?? null,
      bodySupport: workspace.scoreByType.get('body_support') ?? workspace.scoreByType.get('clinical') ?? null,
      recovery: workspace.scoreByType.get('recovery') ?? null,
      activePerformance: workspace.scoreByType.get('active_performance') ?? workspace.scoreByType.get('activity') ?? null,
      physicalWellnessIndex: workspace.scoreByType.get('physical_wellness_index') ?? workspace.scoreByType.get('overall') ?? null,
      stressResilience: workspace.scoreByType.get('stress_resilience') ?? workspace.scoreByType.get('calm') ?? null,
    },
    stressAssessment: (workspace.latestStressAssessment?.payload?.result ?? null) as NutritionPlanSourceSnapshot['stressAssessment'],
  });
  return updateDietPlanLifecycle({
    dietPlanId: plan.id,
    consultantId: account.accountId,
    currentVersionId: plan.currentVersionId,
    lifecycle: 'approved',
    approvedBy: account.accountId,
    sourceSnapshot,
  });
};

export const publishConsultantDietPlan = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  dietPlanId: string,
) => {
  if (!isConsultantRole(account)) return null;
  if (!canApproveOrPublishDietPlan(account)) {
    throw new NutritionPlanWorkflowError(
      'ROLE_NOT_ALLOWED',
      'Only consultant or admin accounts can publish nutrition plans.',
      403,
    );
  }
  const workspace = await getWorkspaceContext(publicClientId);
  if (!workspace || !workspace.careCase) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase.id || !plan.currentVersionId) return null;
  const currentVersion = await getCurrentDietPlanVersion(plan.id);
  if (!currentVersion) return null;
  assertLifecycleTransition(currentVersion.lifecycleStatus, 'published');
  const sourceSnapshot = buildSourceSnapshot({
    bmi: workspace.metrics.bmi.status === 'AVAILABLE' ? workspace.metrics.bmi.value : null,
    weightKg: workspace.context.calculationInput.weightKg,
    biomarkers: workspace.biomarkers,
    healthProfile: workspace.healthProfile ?? {},
    calorieTarget: workspace.macroTargets?.caloriesKcal ?? null,
    proteinTargetGrams: workspace.macroTargets?.proteinGrams ?? null,
    hydrationTargetLiters: workspace.hydrationTargetLiters,
    wellnessScores: {
      nourishment: workspace.scoreByType.get('nourishment') ?? workspace.scoreByType.get('nutrition') ?? null,
      energyBalance: workspace.scoreByType.get('energy_balance') ?? workspace.scoreByType.get('sleep') ?? null,
      bodySupport: workspace.scoreByType.get('body_support') ?? workspace.scoreByType.get('clinical') ?? null,
      recovery: workspace.scoreByType.get('recovery') ?? null,
      activePerformance: workspace.scoreByType.get('active_performance') ?? workspace.scoreByType.get('activity') ?? null,
      physicalWellnessIndex: workspace.scoreByType.get('physical_wellness_index') ?? workspace.scoreByType.get('overall') ?? null,
      stressResilience: workspace.scoreByType.get('stress_resilience') ?? workspace.scoreByType.get('calm') ?? null,
    },
    stressAssessment: (workspace.latestStressAssessment?.payload?.result ?? null) as NutritionPlanSourceSnapshot['stressAssessment'],
  });
  const result = await updateDietPlanLifecycle({
    dietPlanId: plan.id,
    consultantId: account.accountId,
    currentVersionId: plan.currentVersionId,
    lifecycle: 'published',
    approvedBy: account.accountId,
    sourceSnapshot,
  });
  await transitionCareCaseStageBestEffort(
    workspace.careCase,
    'diet_published',
    'Consultant published the nutrition plan.',
  );
  return result;
};

export const getConsultantLatestDietPlan = async (publicClientId: string) => {
  const workspace = await getWorkspaceContext(publicClientId);
  if (!workspace || !workspace.careCase) return null;
  const plan = await getDietPlanByCareCaseId(workspace.careCase.id);
  if (!plan) return null;
  const version = plan.currentVersionId ? await getCurrentDietPlanVersion(plan.id) : null;
  return version ? { plan, version } : null;
};


export const exportConsultantDietPlanDocument = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  dietPlanId: string,
) => {
  if (!isConsultantRole(account)) return null;
  const workspace = await getWorkspaceContext(publicClientId);
  if (!workspace || !workspace.careCase) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase.id) return null;
  const version = await getLatestDownloadableDietPlanVersion(plan);
  if (!version) return null;

  const exported = await generateDietPlanDocument(plan, version);
  const updatedVersion = await updateDietPlanVersionExportPaths({
    dietPlanId: plan.id,
    versionId: version.id,
    exportedDocPath: exported.outputPath,
  });

  return {
    plan,
    version: updatedVersion ?? version,
    document: {
      path: exported.outputPath,
      filename: exported.filename,
      mimeType: exported.mimeType,
    },
  };
};

export const logNutritionMealConsumption = async (
  owner: ClientOwnershipContext,
  input: {
    planId: string;
    versionId: string;
    mealKey: string;
    mealLabel: string;
    mealName: string | null;
    quantityLabel: string | null;
    consumedAtISO?: string | null;
    notes?: string | null;
  },
) => {
  const published = await getLatestPublishedDietPlanByClientId(owner);
  if (!published) {
    throw new NutritionPlanWorkflowError(
      'DIET_PLAN_NOT_FOUND',
      'A published nutrition plan is required before meal completion can be tracked.',
      404,
    );
  }
  if (published.plan.id != input.planId || published.version.id != input.versionId) {
    throw new NutritionPlanWorkflowError(
      'DIET_PLAN_VERSION_MISMATCH',
      'Meal completion can only be logged against the latest published nutrition plan.',
      409,
    );
  }
  const careCase = await getCareCaseByClientId(owner.clientId);
  if (!careCase) {
    throw new NutritionPlanWorkflowError('CARE_CASE_NOT_FOUND', 'Care case not found for this client.', 404);
  }

  const consumedAtISO = input.consumedAtISO ?? new Date().toISOString();
  await addHealthEvent({
    careCaseId: careCase.id,
    userId: owner.accountId,
    type: 'meal_logged',
    summary: `${input.mealLabel} marked as consumed`,
    payload: {
      planId: input.planId,
      versionId: input.versionId,
      mealKey: input.mealKey,
      mealLabel: input.mealLabel,
      mealName: input.mealName,
      quantityLabel: input.quantityLabel,
      notes: input.notes ?? null,
    },
    replayKey: `${careCase.id}:meal_logged:${input.versionId}:${input.mealKey}:${consumedAtISO}`,
    eventTimeISO: consumedAtISO,
  });

  return {
    ok: true,
    consumedAtISO,
    mealKey: input.mealKey,
    mealLabel: input.mealLabel,
  };
};

export const getPublishedDietPlanForClient = async (owner: ClientOwnershipContext) => {
  const payload = await getLatestPublishedDietPlanByClientId(owner);
  if (!payload) return null;
  return {
    ...payload,
    version: {
      ...payload.version,
      content: sanitizePublishedNutritionPlanContent(payload.version.content),
    },
  };
};
