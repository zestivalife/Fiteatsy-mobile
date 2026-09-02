import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import {
  getRegisteredConsultantClientProfileContext,
  getConsultantWearableSummaryForClient,
  listConsultantReportSummariesForClient,
  listConsultantTimelineForClient,
  listValidatedBiomarkerSummaryForClient,
  type ConsultantBiomarkerSummary,
} from '../consultants/consultants.repository.js';
import { BIOMARKER_CLINICAL_CALCULATION_VERSION } from '../biomarkers/biomarker-clinical-semantics.js';
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
  NutritionGuidanceItem,
  OptionalNutritionGuidance,
  NutritionPlanContent,
  NutritionPlanSourceSnapshot,
} from '../platform/platform.types.js';
import { NUTRITION_MEAL_SEQUENCE } from '../platform/platform.types.js';
import { transitionCareCaseStage } from '../platform/platform.lifecycle.js';
import { addHealthEvent } from '../platform/platform.store.js';
import {
  createOrUpdateDietPlanDraft,
  createDietPlanDraftVersion,
  getDietPlanByCareCaseId,
  getCurrentDietPlanVersion,
  getDietPlanById,
  getDietPlanVersionById,
  getLatestPublishedDietPlanByClientId,
  updateDietPlanLifecycle,
  updateDietPlanVersionContent,
  updateDietPlanVersionExportPaths,
  listDietPlanReviewQueue,
  publishApprovedDietPlanVersion,
} from './nutrition.store.js';
import { generateDietPlanDocument } from './nutrition.document.js';
import { buildRecommendationSets, calculateMealNutritionTotals, classifyMealMatch, deriveMealTargets } from './meal-engine.js';
import { isDietaryPatternCompatible, listMealLibrarySlotsForTarget, listVerifiedFoodMasterRecords } from './nutrition.library.store.js';
import { getFoodPreferenceProfile, type FoodPreferenceProfile } from './food-preferences.service.js';
import { OptionalGuidanceContractError, validateOptionalGuidanceV2 } from './optional-guidance-contract.js';

const TEMPLATE_VERSION = '2Zestiva_Premium_Personalised_Diet_Plan_Template_v0.2_Compact';
const MAX_MEAL_OPTIONS_PER_SECTION = 5;
const AVAILABLE_LIBRARY_MATCH_LIMIT = 5;
const AVAILABLE_LIBRARY_CANDIDATE_LIMIT = 18;
const COMPATIBLE_MEAL_LIBRARY_KEYS: Record<typeof NUTRITION_MEAL_SEQUENCE[number], typeof NUTRITION_MEAL_SEQUENCE[number][]> = {
  earlyMorning: ['earlyMorning', 'midMorningSnack', 'eveningSnack', 'bedtimeNutrition'],
  breakfast: ['breakfast'],
  midMorningSnack: ['midMorningSnack', 'earlyMorning', 'eveningSnack', 'bedtimeNutrition'],
  lunch: ['lunch', 'dinner'],
  eveningSnack: ['eveningSnack', 'midMorningSnack', 'earlyMorning', 'bedtimeNutrition'],
  dinner: ['dinner', 'lunch'],
  bedtimeNutrition: ['bedtimeNutrition', 'eveningSnack', 'midMorningSnack', 'earlyMorning'],
};
const OPTIONAL_GUIDANCE_WHAT_DISPLAY_LIMIT = 12;
const OPTIONAL_GUIDANCE_CUISINE_DISPLAY_LIMIT = 5;
const OPTIONAL_GUIDANCE_CRAVING_DISPLAY_LIMIT = 3;

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

const professionalTypeForNutritionAccount = (account: AuthenticatedAccount) =>
  account.user.role?.toLowerCase() === 'practitioner' ? 'PRACTITIONER' : 'CONSULTANT';

export const canApproveOrPublishDietPlan = (account: AuthenticatedAccount) =>
  ['senior_consultant', 'admin', 'superuser', 'platform_owner'].includes(account.user.role?.toLowerCase() ?? '');

export const canPublishAssignedDietPlan = (account: AuthenticatedAccount, hasActiveCanonicalAssignment: boolean) =>
  canApproveOrPublishDietPlan(account) ||
  (isConsultantRole(account) && hasActiveCanonicalAssignment);

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

const canonicalReviewOptionIdentity = (option: NutritionMealSlot) => {
  if (option.id?.trim()) return `option:${option.id.trim().toLowerCase()}`;
  const foodIds = unique((option.components ?? []).map((component) => component.foodId)).sort();
  if (foodIds.length > 0) return `foods:${foodIds.join('+')}`;
  return `meal:${lower(option.meal)}::${lower(option.portion)}`;
};

/**
 * A submitted review must be a complete, immutable clinical review unit.
 * Candidate availability may truthfully contain fewer than five items, but the
 * persisted Consultant selection must contain exactly five valid options for
 * every canonical meal head.
 */
export const assertDietPlanReviewContentComplete = (content: unknown) => {
  const mealPlan = content && typeof content === 'object'
    ? (content as Partial<NutritionPlanContent>).mealPlan
    : null;
  const failures: string[] = [];

  for (const mealKey of NUTRITION_MEAL_SEQUENCE) {
    const section = mealPlan && typeof mealPlan === 'object'
      ? (mealPlan as Partial<NutritionPlanContent['mealPlan']>)[mealKey]
      : null;
    const options = Array.isArray(section?.options) ? section.options : [];
    if (options.length !== MAX_MEAL_OPTIONS_PER_SECTION) {
      failures.push(`${mealKey}: exactly ${MAX_MEAL_OPTIONS_PER_SECTION} saved options required (received ${options.length})`);
    }

    const identities = new Set<string>();
    options.forEach((option, index) => {
      if (!option || !option.meal?.trim() || !option.portion?.trim()) {
        failures.push(`${mealKey}: option ${index + 1} needs a meal and portion`);
        return;
      }
      if (!option.id?.trim() || option.id.startsWith('food:') || !['verified_library', 'template_variant', 'consultant_custom'].includes(option.sourceType ?? '')) {
        failures.push(`${mealKey}: option ${index + 1} is not a client-consumable recipe or meal variant`);
      }
      if (option.portion === 'Consultant-defined portion') {
        failures.push(`${mealKey}: option ${index + 1} lacks canonical serving metadata`);
      }
      if (![option.approxKcal, option.proteinGrams].every((value) => typeof value === 'number' && Number.isFinite(value))) {
        failures.push(`${mealKey}: option ${index + 1} needs calories and protein`);
      }
      const identity = canonicalReviewOptionIdentity(option);
      if (identities.has(identity)) failures.push(`${mealKey}: duplicate option ${index + 1}`);
      identities.add(identity);
    });
  }

  if (failures.length > 0) {
    throw new NutritionPlanWorkflowError(
      'DIET_PLAN_REVIEW_CONTENT_INCOMPLETE',
      `Complete the saved diet version before review: ${failures.join('; ')}.`,
      409,
    );
  }
};

type NutritionMealPlanKey = keyof NutritionPlanContent['mealPlan'];
type NutritionRecommendationMode = 'approved' | 'outside_plan' | 'general';
type NutritionRecommendationSource = 'published_plan' | 'published_reviewed_guidance';

type NutritionRecommendationItem = {
  id?: string;
  mealName: string;
  portion: string;
  approxKcal: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fibreGrams: number | null;
  cuisineTags: string[];
  matchClassification?: NutritionMealSlot['matchClassification'];
  sourceType: NutritionRecommendationSource;
  sourceLabel: string;
  recommendationMode: NutritionRecommendationMode;
  nutritionRationale: string | null;
  rankingScore: number;
  slot: number;
};

export const classifyEatingOutRecommendation = (
  optionId: string | undefined,
  activePublishedOptionIds: ReadonlySet<string>,
): NutritionRecommendationMode =>
  optionId && activePublishedOptionIds.has(optionId) ? 'approved' : 'general';

type NutritionRecommendationResponse = {
  recommendations: NutritionRecommendationItem[];
  guidanceStatus: 'available' | 'preparing';
  selectedDate: string;
  mealKey: string;
  mealLabel: string;
  mealWindow: string;
  context: {
    planId: string;
    versionId: string;
    consumedCal: number;
    consumedProtein: number;
    remainingCal: number | null;
    remainingProtein: number | null;
    remainingCarbs: number | null;
    remainingFat: number | null;
    remainingFibre: number | null;
  };
};

const normalizeMealSection = (section: NutritionMealSection): NutritionMealSection => {
  const selectedOptions = normalizeMealOptions(section.options);
  const availableOptions = dedupeMealOptions([
    ...(section.availableOptions ?? []),
    ...selectedOptions,
  ])
    .filter((option) => option.sourceType !== 'generated_template')
    .slice(0, MAX_MEAL_OPTIONS_PER_SECTION)
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
  if (currentVersion && ['approved', 'published'].includes(currentVersion.lifecycleStatus)) {
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
  if (signals.biomarkers.some((item) => item.clinicalStatus === 'LOW' || item.clinicalStatus === 'HIGH')) score += 1;
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
  if (input.biomarkers.some((item) => /b12/i.test(item.name) && item.clinicalStatus === 'LOW')) {
    suggestions.add('Include B12-rich foods such as dairy, eggs, fish, or fortified options aligned to dietary preference.');
  }
  if (input.biomarkers.some((item) => /vitamin d/i.test(item.name) && item.clinicalStatus === 'LOW')) {
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

export const buildNutritionIntelligence = (input: {
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
  const sourceForBiomarker = (biomarker: ConsultantBiomarkerSummary) =>
    `biomarkers.${biomarker.biomarkerId}.report.${biomarker.sourceReportId ?? 'unknown'}`;

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
    if (/b12/.test(biomarkerName) && biomarker.clinicalStatus === 'LOW') {
      observations.push({
        title: 'Vitamin B12 result is below the report reference interval',
        detail: `${biomarker.name} is ${biomarker.value} ${biomarker.unit} (reference ${biomarker.referenceRange ?? 'not available'}).`,
        sources: [sourceForBiomarker(biomarker)],
      });
      recommendations.push({
        title: 'Consider B12-supportive foods during Consultant review',
        detail: "Include B12-supportive foods compatible with the client's dietary pattern; this does not prescribe supplementation or medication.",
        sources: [sourceForBiomarker(biomarker)],
        requiresConsultantReview: true,
      });
      nutritionFocus.add('micronutrient support');
    }
    if (/vitamin d/.test(biomarkerName) && biomarker.clinicalStatus === 'LOW') {
      observations.push({
        title: 'Vitamin D result is below the report reference interval',
        detail: `${biomarker.name} is ${biomarker.value} ${biomarker.unit} (reference ${biomarker.referenceRange ?? 'not available'}).`,
        sources: [sourceForBiomarker(biomarker)],
      });
      nutritionFocus.add('recovery support');
    }
    if (/hba1c|fasting glucose/.test(biomarkerName) && biomarker.clinicalStatus === 'HIGH') {
      observations.push({
        title: 'Glucose marker is above the report reference interval',
        detail: `${biomarker.name} is ${biomarker.value} ${biomarker.unit} (reference ${biomarker.referenceRange ?? 'not available'}).`,
        sources: [sourceForBiomarker(biomarker)],
      });
      recommendations.push({
        title: 'Review carbohydrate distribution',
        detail: 'During Consultant review, consider pairing carbohydrates with protein and fibre across the day; this does not diagnose diabetes or alter medication.',
        sources: [sourceForBiomarker(biomarker), 'nutritionProtocol.macroTargets'],
        requiresConsultantReview: true,
      });
      nutritionFocus.add('glucose-aware meal structure');
    }
    if (/creatinine|egfr|alanine aminotransferase|aspartate aminotransferase|bilirubin|sgpt|sgot/.test(biomarkerName)
      && biomarker.clinicalStatus !== 'NORMAL' && biomarker.clinicalStatus !== 'UNKNOWN') {
      consultantActions.add(`Clinical review required for ${biomarker.name}; no automated renal or hepatic food restriction was applied.`);
    }
    if ((biomarker.clinicalStatus === 'LOW' || biomarker.clinicalStatus === 'HIGH')
      && !/b12|vitamin d|hba1c|fasting glucose|creatinine|egfr|alanine aminotransferase|aspartate aminotransferase|bilirubin|sgpt|sgot/.test(biomarkerName)) {
      consultantActions.add(`Review ${biomarker.name} from report ${biomarker.sourceReportId ?? 'with unavailable provenance'} before publishing; no automated food rule was applied.`);
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
    .filter((item) => item.clinicalStatus === 'LOW' || item.clinicalStatus === 'HIGH')
    .map((item) => `${item.name} ${item.value} ${item.unit}`);

  const deficiencies = input.biomarkers
    .filter((item) => /b12|vitamin|ferritin|iron|folate/i.test(item.name) && item.clinicalStatus === 'LOW')
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
      biomarkerId: item.biomarkerId,
      name: item.name,
      canonicalMarkerName: item.canonicalMarkerName,
      rawMarkerName: item.rawMarkerName,
      sourceReportId: item.sourceReportId,
      value: item.value,
      unit: item.unit,
      validationStatus: item.validationStatus,
      clinicalStatus: item.clinicalStatus,
      comparisonStatus: item.comparisonStatus,
      referenceRange: item.referenceRange,
      testDate: item.testDate,
    })),
    biomarkerClinicalCalculationVersion: BIOMARKER_CLINICAL_CALCULATION_VERSION,
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
  likedFoods?: string[];
  dislikedFoods?: string[];
  dislikedFoodIds?: string[];
  preferredCuisines?: string[];
  preferredProteins?: string[];
  staplePreference?: string | null;
  dairyPreference?: string | null;
  practicality?: string[];
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
      carbohydrates: input.calorieTarget == null ? null : Math.round((input.calorieTarget * .45) / 4),
      fat: input.calorieTarget == null ? null : Math.round((input.calorieTarget * .3) / 9),
      fibre: input.calorieTarget == null ? null : Math.max(25, Math.round((input.calorieTarget / 1000) * 14)),
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

const mealOptionDiversityIdentity = (option: NutritionMealSlot) => {
  const foodIds = unique((option.components ?? []).map((component) => component.foodId)).sort();
  if (foodIds.length > 0) return `foods:${foodIds.join('+')}`;
  return `meal:${lower(option.meal)}::${lower(option.portion)}`;
};

export const selectDiverseMealOptions = (
  candidates: NutritionMealSlot[],
  usedIdentities: Set<string>,
  limit = AVAILABLE_LIBRARY_MATCH_LIMIT,
) => {
  const uniqueCandidates = dedupeMealOptions(candidates);
  const seenInMeal = new Set<string>();
  const distinctFamilies = uniqueCandidates.filter((option) => {
    const identity = mealOptionDiversityIdentity(option);
    if (usedIdentities.has(identity) || seenInMeal.has(identity)) return false;
    seenInMeal.add(identity);
    return true;
  });
  const repeatedFamilies = uniqueCandidates.filter((option) => !distinctFamilies.includes(option));
  const selected = [...distinctFamilies, ...repeatedFamilies].slice(0, limit);
  selected.forEach((option) => usedIdentities.add(mealOptionDiversityIdentity(option)));
  return selected.map((option, index) => ({ ...option, slot: index + 1 }));
};

const enrichMealPlanWithLibraryMatches = async (input: {
  content: NutritionPlanContent;
  consultantId: string;
  dietPreference: string | null;
  allergies: string[];
  avoidedFoods?: string[];
  avoidedFoodIds?: string[];
  likedFoodIds?: string[];
  likedFoods?: string[];
  dislikedFoods?: string[];
  dislikedFoodIds?: string[];
  preferredCuisines?: string[];
  preferredProteins?: string[];
  staplePreference?: string | null;
  dairyPreference?: string | null;
  practicality?: string[];
}) => {
  const usedIdentities = new Set<string>();
  const nextMealPlanEntries = [] as Array<readonly [typeof NUTRITION_MEAL_SEQUENCE[number], NutritionPlanContent['mealPlan'][typeof NUTRITION_MEAL_SEQUENCE[number]]]>;
  for (const mealKey of NUTRITION_MEAL_SEQUENCE) {
      const section = input.content.mealPlan[mealKey];
      const verifiedMatches = dedupeMealOptions((await Promise.all(
        COMPATIBLE_MEAL_LIBRARY_KEYS[mealKey].map((compatibleMealKey) => listMealLibrarySlotsForTarget({
          mealKey: compatibleMealKey,
          target: section.target,
          consultantId: input.consultantId,
          dietPreference: input.dietPreference,
          allergyTags: input.allergies,
          avoidedFoods: input.avoidedFoods,
          avoidedFoodIds: input.avoidedFoodIds,
          likedFoodIds: input.likedFoodIds,
          likedFoods: input.likedFoods,
          dislikedFoods: input.dislikedFoods,
          dislikedFoodIds: input.dislikedFoodIds,
          preferredCuisines: input.preferredCuisines,
          preferredProteins: input.preferredProteins,
          staplePreference: input.staplePreference,
          dairyPreference: input.dairyPreference,
          practicality: input.practicality,
          includeOutsideTarget: true,
          limit: AVAILABLE_LIBRARY_CANDIDATE_LIMIT,
        })),
      )).flat());
      nextMealPlanEntries.push([
        mealKey,
        {
          ...section,
          options: [],
          availableOptions: selectDiverseMealOptions(verifiedMatches, usedIdentities),
        },
      ] as const);
  }

  return {
    ...input.content,
    mealPlan: Object.fromEntries(nextMealPlanEntries) as unknown as NutritionPlanContent['mealPlan'],
  };
};

const foodPreferenceSearchText = (slot: NutritionMealSlot) => lower([
  slot.meal,
  slot.portion,
  slot.prepNote,
  ...(slot.cuisineTags ?? []),
  ...(slot.dietaryTags ?? []),
  ...(slot.components ?? []).map((component) => component.componentName),
].filter(Boolean).join(' '));

const containsFoodPreferenceTerm = (searchable: string, term: string) => {
  const normalizedTerm = lower(term).trim();
  if (!normalizedTerm) return false;
  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escapedTerm}([^a-z0-9]|$)`, 'i').test(searchable);
};

export const assertDietPlanRespectsFoodPreferences = (
  content: NutritionPlanContent,
  profile: FoodPreferenceProfile | null,
  healthProfile: { foodAllergies?: string[]; foodIntolerances?: string[] } | null,
) => {
  const blockedTerms = unique([
    ...(profile?.foodsAvoided ?? []),
    ...(profile?.restrictions ?? []),
    ...(healthProfile?.foodAllergies ?? []),
    ...(healthProfile?.foodIntolerances ?? []),
  ]).map(lower).filter(Boolean);
  const blockedFoodIds = new Set(profile?.avoidedFoodIds ?? []);
  const dairyTerms = ['milk', 'curd', 'yogurt', 'yoghurt', 'paneer', 'cheese', 'butter', 'ghee', 'cream', 'whey', 'dairy'];

  for (const mealKey of NUTRITION_MEAL_SEQUENCE) {
    const section = content.mealPlan[mealKey];
    for (const slot of [...section.options, ...(section.availableOptions ?? [])]) {
      const searchable = foodPreferenceSearchText(slot);
      const blockedTerm = blockedTerms.find((term) => containsFoodPreferenceTerm(searchable, term));
      const blockedComponent = (slot.components ?? []).find((component) => component.foodId && blockedFoodIds.has(component.foodId));
      const dietCompatible = isDietaryPatternCompatible(profile?.dietType ?? null, slot.dietaryTags ?? [], searchable);
      const dairyCompatible = profile?.dairyPreference !== 'avoid' || !dairyTerms.some((term) => containsFoodPreferenceTerm(searchable, term));
      if (!blockedTerm && !blockedComponent && dietCompatible && dairyCompatible) continue;
      const conflict = blockedTerm ?? blockedComponent?.componentName ?? profile?.dietType ?? 'dairy preference';
      throw new NutritionPlanWorkflowError(
        'DIET_PLAN_FOOD_PREFERENCE_CONFLICT',
        `${section.focus || mealKey} contains “${slot.meal}”, which conflicts with the client's hard food preference “${conflict}”.`,
        409,
      );
    }
  }
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
  foodPreferences?: { profile: FoodPreferenceProfile; updatedAtISO: string | null };
}): NutritionPlanSourceSnapshot => ({
  bmi: input.bmi,
  weightKg: input.weightKg,
  biomarkers: input.biomarkers.map((item) => ({
    biomarkerId: item.biomarkerId,
    name: item.name,
    canonicalMarkerName: item.canonicalMarkerName,
    rawMarkerName: item.rawMarkerName,
    sourceReportId: item.sourceReportId,
    value: item.value,
    unit: item.unit,
    validationStatus: item.validationStatus,
    clinicalStatus: item.clinicalStatus,
    comparisonStatus: item.comparisonStatus,
    referenceRange: item.referenceRange,
    testDate: item.testDate,
  })),
  biomarkerClinicalCalculationVersion: BIOMARKER_CLINICAL_CALCULATION_VERSION,
  healthProfile: input.healthProfile,
  foodPreferences: input.foodPreferences,
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

export const canAccessConsultantNutritionClient = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  options: { allowSeniorAuthority?: boolean } = {},
) => {
  if (!isConsultantRole(account)) return false;
  const useSeniorAuthority = options.allowSeniorAuthority === true && canApproveOrPublishDietPlan(account);
  const context = await getRegisteredConsultantClientProfileContext(
    publicClientId,
    useSeniorAuthority ? undefined : account.accountId,
    professionalTypeForNutritionAccount(account),
  );
  return context != null;
};

export const assertLifecycleTransition = (
  currentLifecycle: DietPlanVersionRecord['lifecycleStatus'] | null,
  nextLifecycle: DietPlanVersionRecord['lifecycleStatus'],
) => {
  const current = currentLifecycle ?? 'draft';
  const allowedTransitions: Record<DietPlanVersionRecord['lifecycleStatus'], DietPlanVersionRecord['lifecycleStatus'][]> = {
    draft: ['draft', 'submitted_for_review'],
    submitted_for_review: ['submitted_for_review', 'changes_requested', 'approved'],
    changes_requested: ['draft', 'submitted_for_review'],
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

export const assertPublishVersionEligibility = (input: {
  dietPlanId: string;
  requestedVersionId: string;
  requestedVersionDietPlanId: string;
  requestedVersionLifecycle: DietPlanVersionRecord['lifecycleStatus'];
  latestPublishedVersionId: string | null;
}) => {
  if (input.requestedVersionDietPlanId !== input.dietPlanId) {
    throw new NutritionPlanWorkflowError('DIET_PLAN_VERSION_MISMATCH', 'The approved version does not belong to this diet plan.', 409);
  }
  if (
    input.requestedVersionLifecycle === 'published' &&
    input.latestPublishedVersionId === input.requestedVersionId
  ) {
    return 'already_published' as const;
  }
  if (input.requestedVersionLifecycle !== 'approved') {
    throw new NutritionPlanWorkflowError('DIET_PLAN_VERSION_NOT_APPROVED', 'Only the exact Senior-Consultant-approved version can be published.', 409);
  }
  return 'publish' as const;
};

export const classifyDietPlanDeliveryLifecycle = (input: {
  planStatus: string;
  currentLifecycle: string | null;
  latestPublishedVersionId: string | null;
  publishedVersionId: string | null;
  publishedLifecycle: string | null;
}) => {
  if (
    input.latestPublishedVersionId != null &&
    input.publishedVersionId === input.latestPublishedVersionId &&
    input.publishedLifecycle === 'published'
  ) return 'ACTIVE_PUBLISHED' as const;
  const lifecycle = input.currentLifecycle ?? input.planStatus;
  if (lifecycle === 'approved' || input.planStatus === 'approved') return 'APPROVED_NOT_PUBLISHED' as const;
  if (lifecycle === 'submitted_for_review' || lifecycle === 'changes_requested') return 'PENDING_APPROVAL' as const;
  return 'PREPARING' as const;
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

const getWorkspaceContext = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  options: { allowSeniorAuthority?: boolean } = {},
) => {
  if (!isConsultantRole(account)) return null;
  const useSeniorAuthority = options.allowSeniorAuthority === true && canApproveOrPublishDietPlan(account);
  const context = await getRegisteredConsultantClientProfileContext(
    publicClientId,
    useSeniorAuthority ? undefined : account.accountId,
    professionalTypeForNutritionAccount(account),
  );
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
    access: {
      source: useSeniorAuthority ? 'senior_consultant_authority' as const : 'cap003_professional_assignment' as const,
      assignedToRequestor: !useSeniorAuthority,
    },
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

export const getConsultantNutritionIntelligence = async (publicClientId: string, account: AuthenticatedAccount) => {
  const workspace = await getWorkspaceContext(publicClientId, account, { allowSeniorAuthority: true });
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

  const monitoringOwner = { accountId: context.accountId, clientId: context.internalClientId };
  const [dailyMonitoring, patternMonitoring] = await Promise.all([
    buildNutritionProjection(monitoringOwner),
    getClientNutritionPattern(monitoringOwner),
  ]);
  const canonicalDailyNutrition = dailyMonitoring?.dailyNutrition ?? null;

  return {
    clientId: publicClientId,
    nutritionSnapshot: {
      goal: context.profile.onboarding.goal,
      bmi: metrics.bmi.status === 'AVAILABLE' ? metrics.bmi.value : null,
      currentWeightKg: context.calculationInput.weightKg,
      caloriesTarget: canonicalDailyNutrition?.targetCalories ?? macroTargets?.caloriesKcal ?? null,
      proteinTargetGrams: canonicalDailyNutrition?.targetProtein ?? macroTargets?.proteinGrams ?? null,
      carbohydrateTargetGrams: canonicalDailyNutrition?.targetCarbs ?? macroTargets?.carbohydrateGrams ?? null,
      fatTargetGrams: canonicalDailyNutrition?.targetFat ?? macroTargets?.fatGrams ?? null,
      fibreTargetGrams: canonicalDailyNutrition?.targetFibre ?? null,
      hydrationTargetLiters: canonicalDailyNutrition?.hydrationTargetMl != null ? canonicalDailyNutrition.hydrationTargetMl / 1000 : hydrationTargetLiters,
      hydrationConsumedTodayLiters: canonicalDailyNutrition ? canonicalDailyNutrition.hydrationConsumedMl / 1000 : null,
      hydrationRemainingTodayLiters: canonicalDailyNutrition?.hydrationTargetMl != null
        ? Math.max(canonicalDailyNutrition.hydrationTargetMl - canonicalDailyNutrition.hydrationConsumedMl, 0) / 1000
        : null,
      hydrationTargetSource: canonicalDailyNutrition ? 'active_published_diet_plan' : 'profile_weight_formula',
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
    nutritionMonitoring: dailyMonitoring ? { daily: dailyMonitoring, pattern: patternMonitoring } : null,
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
  const workspace = await getWorkspaceContext(publicClientId, account);
  if (!workspace || !workspace.careCase) return null;

  const intelligencePayload = await getConsultantNutritionIntelligence(publicClientId, account);
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
  ]);
  const foodPreferences = await getFoodPreferenceProfile(publicClientId);
  const canonicalPreferences = foodPreferences?.profile ?? null;
  const dietPreference = canonicalPreferences?.dietType ?? healthProfile?.dietType ?? context.profile.onboarding.dietPreference;
  const hardRestrictions = unique([...allergies, ...(canonicalPreferences?.restrictions ?? [])]);
  const draftTemplate = buildDraftContent({
    clientName: context.profile.client.name,
    age: context.profile.client.age,
    gender: context.profile.client.gender,
    goals: unique([
      context.profile.onboarding.goal,
      ...(healthProfile?.wellnessGoals ?? []),
    ]),
    conditions,
    dietPreference,
    allergies: hardRestrictions,
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
    dietPreference,
    allergies: hardRestrictions,
    avoidedFoods: canonicalPreferences?.foodsAvoided ?? [],
    avoidedFoodIds: canonicalPreferences?.avoidedFoodIds ?? [],
    likedFoodIds: canonicalPreferences?.likedFoodIds ?? [],
    likedFoods: canonicalPreferences?.foodsLiked ?? [],
    dislikedFoods: canonicalPreferences?.foodsDisliked ?? [],
    dislikedFoodIds: canonicalPreferences?.dislikedFoodIds ?? [],
    preferredCuisines: canonicalPreferences?.cuisines ?? [],
    preferredProteins: canonicalPreferences?.proteins ?? [],
    staplePreference: canonicalPreferences?.staplePreference ?? null,
    dairyPreference: canonicalPreferences?.dairyPreference ?? null,
    practicality: canonicalPreferences?.practicality ?? [],
  }));
  assertDietPlanRespectsFoodPreferences(content, canonicalPreferences, healthProfile ?? null);
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
    foodPreferences: foodPreferences ? { profile: foodPreferences.profile, updatedAtISO: foodPreferences.updatedAtISO } : undefined,
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
  const workspace = await getWorkspaceContext(publicClientId, account);
  if (!workspace) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase?.id) return null;
  const currentVersion = plan.currentVersionId ? await getCurrentDietPlanVersion(plan.id) : null;
  if (!currentVersion) return null;
  if (!['draft', 'changes_requested'].includes(currentVersion.lifecycleStatus)) {
    throw new NutritionPlanWorkflowError(
      'DIET_PLAN_NOT_EDITABLE',
      'Only draft plans or plans returned for changes can be edited.',
    );
  }
  const foodPreferences = await getFoodPreferenceProfile(publicClientId);
  assertDietPlanReviewContentComplete(input.content);
  assertDietPlanRespectsFoodPreferences(input.content, foodPreferences?.profile ?? null, workspace.healthProfile ?? null);
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
    foodPreferences: foodPreferences ? { profile: foodPreferences.profile, updatedAtISO: foodPreferences.updatedAtISO } : undefined,
  });

  const draftGuidance = input.content.optionalGuidance ? {
    ...input.content.optionalGuidance,
    updatedBy: account.accountId,
    updatedAtISO: new Date().toISOString(),
    reviewedBy: null,
    reviewedAtISO: null,
    whatCanIEatNow: input.content.optionalGuidance.whatCanIEatNow.map((item) => ({ ...item, clinicallyReviewed: false })),
    eatingOut: Object.fromEntries(Object.entries(input.content.optionalGuidance.eatingOut).map(([key, items]) => [key, items.map((item) => ({ ...item, clinicallyReviewed: false }))])) as OptionalNutritionGuidance['eatingOut'],
    cravings: Object.fromEntries(Object.entries(input.content.optionalGuidance.cravings).map(([key, items]) => [key, items.map((item) => ({ ...item, clinicallyReviewed: false }))])) as OptionalNutritionGuidance['cravings'],
  } : undefined;
  const normalizedContent = normalizeNutritionPlanContent({ ...input.content, optionalGuidance: draftGuidance });
  const saved = currentVersion.lifecycleStatus === 'changes_requested'
    ? await createDietPlanDraftVersion({
      dietPlanId: plan.id,
      content: normalizedContent,
      contentSummary: contentSummaryFromContent(normalizedContent),
      sourceSnapshot,
      generatedBy: account.accountId,
      reviewNotes: input.reviewNotes ?? null,
    })
    : await updateDietPlanVersionContent({
      dietPlanId: plan.id,
      versionId: currentVersion.id,
      content: normalizedContent,
      contentSummary: contentSummaryFromContent(normalizedContent),
      sourceSnapshot,
      lifecycleStatus: 'draft',
      reviewNotes: input.reviewNotes ?? null,
    }).then((version) => version ? { plan, version } : null);
  if (!saved) return null;
  if (currentVersion.lifecycleStatus !== 'changes_requested') {
    assertLifecycleTransition(currentVersion.lifecycleStatus, 'draft');
    const lifecycle = await updateDietPlanLifecycle({
      dietPlanId: plan.id,
      consultantId: account.accountId,
      currentVersionId: saved.version.id,
      lifecycle: 'draft',
      sourceSnapshot,
    });
    return {
      plan: lifecycle?.plan ?? plan,
      version: lifecycle?.version ?? saved.version,
    };
  }
  return {
    plan: saved.plan,
    version: saved.version,
  };
};

const guidanceNutritionComplete = (slot: NutritionMealSlot) =>
  [slot.approxKcal, slot.proteinGrams, slot.carbsGrams, slot.fatGrams, slot.fibreGrams]
    .every((value) => typeof value === 'number' && Number.isFinite(value));

const guidanceItemFromSlot = (input: {
  slot: NutritionMealSlot;
  category: NutritionGuidanceItem['category'];
  displayOrder: number;
  planOptionIds: Set<string>;
  cuisineTags?: string[];
  cravingTags?: string[];
  mealTags?: string[];
  timeWindowTags?: string[];
}): NutritionGuidanceItem => {
  const firstComponent = input.slot.components?.[0];
  return {
    id: input.slot.id ?? `${input.category}:${input.slot.meal}:${input.displayOrder}`,
    foodId: firstComponent?.foodId ?? input.slot.id ?? null,
    name: input.slot.meal,
    servingLabel: input.slot.portion,
    quantity: firstComponent?.quantity ?? null,
    unit: firstComponent?.quantityUnit ?? null,
    nutrition: {
      calories: input.slot.approxKcal as number,
      protein: input.slot.proteinGrams as number,
      carbs: input.slot.carbsGrams as number,
      fat: input.slot.fatGrams as number,
      fibre: input.slot.fibreGrams as number,
    },
    category: input.category,
    cuisineTags: input.cuisineTags ?? input.slot.cuisineTags ?? [],
    cravingTags: input.cravingTags ?? [],
    mealTags: input.mealTags ?? [],
    timeWindowTags: input.timeWindowTags ?? [],
    dietaryTags: input.slot.dietaryTags ?? [],
    restrictionTags: [],
    reason: input.slot.recommendationReason ?? '',
    planMembership: input.slot.id != null && input.planOptionIds.has(input.slot.id),
    clinicallyReviewed: false,
    displayOrder: input.displayOrder,
    enabled: true,
    source: input.slot.id != null && input.planOptionIds.has(input.slot.id) ? 'published_plan' : 'verified_catalogue',
  };
};

const assertOptionalGuidanceValid = async (publicClientId: string, content: NutritionPlanContent, requireReviewed = false) => {
  const preferences = await resolveFoodPreferencesFilter(publicClientId);
  try {
    return validateOptionalGuidanceV2({
      content,
      verifiedActiveFoods: await listVerifiedFoodMasterRecords(),
      compatibility: {
        dietPreference: preferences.dietPreference ?? content.nutritionSnapshot.dietPreference,
        allergyTags: [...preferences.allergyTags, ...content.nutritionSnapshot.allergies],
        medicalRestrictions: content.nutritionSnapshot.healthConditions,
        avoidedFoods: preferences.avoidedFoods,
        avoidedFoodIds: preferences.avoidedFoodIds,
      },
      requireReviewed,
    });
  } catch (error) {
    if (error instanceof OptionalGuidanceContractError) {
      throw new NutritionPlanWorkflowError(error.code, error.message, 409);
    }
    throw error;
  }
};

export const generateConsultantOptionalGuidance = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  dietPlanId: string,
) => {
  if (!isConsultantRole(account) || account.user.role?.toLowerCase() === 'senior_consultant') return null;
  const workspace = await getWorkspaceContext(publicClientId, account);
  if (!workspace?.careCase) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase.id) return null;
  const version = await getCurrentDietPlanVersion(plan.id);
  if (!version || !['draft', 'changes_requested'].includes(version.lifecycleStatus)) {
    throw new NutritionPlanWorkflowError('DIET_PLAN_NOT_EDITABLE', 'Optional guidance can only be generated for an editable version.', 409);
  }
  const preferences = await resolveFoodPreferencesFilter(publicClientId);
  const target = deriveMealTargets({
    caloriesTarget: version.content.dailyTargets.calories,
    proteinTargetGrams: version.content.dailyTargets.protein,
  }).lunch;
  const planOptions = NUTRITION_MEAL_SEQUENCE.flatMap((mealKey) => {
    const section = version.content.mealPlan[mealKey];
    return section.options.map((slot) => ({ slot, mealKey, timeWindow: section.window }));
  });
  const verifiedDraftCandidates = NUTRITION_MEAL_SEQUENCE.flatMap((mealKey) => {
    const section = version.content.mealPlan[mealKey];
    return [...section.options, ...(section.availableOptions ?? [])]
      .filter(guidanceNutritionComplete)
      .map((slot) => ({ slot, mealKey, timeWindow: section.window }));
  });
  const planOptionIds = new Set(planOptions.flatMap(({ slot }) => slot.id ? [slot.id] : []));
  const mealTagsForSlot = (slot: NutritionMealSlot) => planOptions.filter((entry) => entry.slot.id === slot.id).map((entry) => entry.mealKey);
  const catalogueInput = {
    mealKey: '', target, consultantId: account.accountId,
    dietPreference: preferences.dietPreference,
    allergyTags: preferences.allergyTags,
    avoidedFoods: preferences.avoidedFoods,
    avoidedFoodIds: preferences.avoidedFoodIds,
    likedFoodIds: preferences.likedFoodIds,
  };
  const databaseCatalogue = (await listMealLibrarySlotsForTarget({ ...catalogueInput, target: undefined, includeOutsideTarget: true, limit: 160 })).filter(guidanceNutritionComplete);
  const uniqueSlots = (slots: NutritionMealSlot[]) => Array.from(new Map(slots.map((slot) => [slot.id ?? slot.meal, slot])).values());
  const broadCatalogue = uniqueSlots([...databaseCatalogue, ...verifiedDraftCandidates.map(({ slot }) => slot)]);
  const whatSlots = uniqueSlots([
    ...planOptions.map(({ slot }) => slot).filter(guidanceNutritionComplete),
    ...broadCatalogue,
  ]).slice(0, OPTIONAL_GUIDANCE_WHAT_DISPLAY_LIMIT);

  const cuisineDefinitions = {
    northIndian: 'north indian', southIndian: 'south indian', chinese: 'chinese', continental: 'continental', fastFood: 'fast food',
  } as const;
  const usedCuisineIds = new Set<string>();
  const eatingOutEntries: Array<[string, NutritionGuidanceItem[]]> = [];
  for (const [key, cuisine] of Object.entries(cuisineDefinitions)) {
    const databaseCandidates = (await listMealLibrarySlotsForTarget({ ...catalogueInput, target: undefined, includeOutsideTarget: true, preferredCuisines: [cuisine], limit: 40 }))
      .filter(guidanceNutritionComplete);
    const cuisineKey = cuisine.replace(/[^a-z]/g, '');
    const candidates = uniqueSlots([
      ...databaseCandidates,
      ...broadCatalogue.filter((slot) => (slot.cuisineTags ?? []).some((tag) => lower(tag).replace(/[^a-z]/g, '') === cuisineKey)),
    ])
      .filter((slot) => !usedCuisineIds.has(slot.id ?? slot.meal))
      .slice(0, OPTIONAL_GUIDANCE_CUISINE_DISPLAY_LIMIT);
    candidates.forEach((slot) => usedCuisineIds.add(slot.id ?? slot.meal));
    eatingOutEntries.push([key, candidates.map((slot, index) => guidanceItemFromSlot({ slot, category: 'eating_out', displayOrder: index + 1, planOptionIds, cuisineTags: [cuisine], mealTags: mealTagsForSlot(slot) }))]);
  }
  const eatingOut = Object.fromEntries(eatingOutEntries) as OptionalNutritionGuidance['eatingOut'];

  const cravingDefinitions = {
    sweet: resolveCravingKeywords('sweet'), salty: resolveCravingKeywords('salty'), crunchy: resolveCravingKeywords('crunchy'), spicy: resolveCravingKeywords('spicy'),
  } as const;
  const usedCravingIds = new Set<string>();
  const cravings = Object.fromEntries(Object.entries(cravingDefinitions).map(([key, keywords]) => {
    const candidates = broadCatalogue
      .filter((slot) => filterByTextMatch(slot, [...keywords]))
      .filter((slot) => !usedCravingIds.has(slot.id ?? slot.meal))
      .slice(0, OPTIONAL_GUIDANCE_CRAVING_DISPLAY_LIMIT);
    candidates.forEach((slot) => usedCravingIds.add(slot.id ?? slot.meal));
    return [key, candidates.map((slot, index) => guidanceItemFromSlot({ slot, category: 'craving', displayOrder: index + 1, planOptionIds, cravingTags: [key], mealTags: mealTagsForSlot(slot) }))];
  })) as OptionalNutritionGuidance['cravings'];
  const now = new Date().toISOString();
  const generatedGuidance: OptionalNutritionGuidance = {
    schemaVersion: 1, generatedBy: account.accountId, generatedAtISO: now, updatedBy: account.accountId, updatedAtISO: now,
    reviewedBy: null, reviewedAtISO: null,
    whatCanIEatNow: whatSlots.map((slot, index) => {
      const planContext = planOptions.find((entry) => entry.slot.id === slot.id);
      return guidanceItemFromSlot({ slot, category: 'what_can_i_eat_now', displayOrder: index + 1, planOptionIds, mealTags: planContext ? [planContext.mealKey] : [], timeWindowTags: planContext ? [planContext.timeWindow] : [] });
    }),
    eatingOut, cravings,
  };
  const mergeGuidanceItems = (existing: NutritionGuidanceItem[] | undefined, generated: NutritionGuidanceItem[], maximum: number) =>
    Array.from(new Map([...generated, ...(existing ?? [])].map((item) => [item.id || `${item.name}:${item.servingLabel}`, item])).values())
      .slice(0, maximum)
      .map((item, index) => ({ ...item, displayOrder: index + 1 }));
  const existingGuidance = version.content.optionalGuidance;
  const optionalGuidance: OptionalNutritionGuidance = existingGuidance ? {
    ...generatedGuidance,
    generatedAtISO: existingGuidance.generatedAtISO,
    whatCanIEatNow: mergeGuidanceItems(existingGuidance.whatCanIEatNow, generatedGuidance.whatCanIEatNow, OPTIONAL_GUIDANCE_WHAT_DISPLAY_LIMIT),
    eatingOut: Object.fromEntries(Object.keys(cuisineDefinitions).map((key) => [
      key,
      mergeGuidanceItems(existingGuidance.eatingOut[key as keyof OptionalNutritionGuidance['eatingOut']], generatedGuidance.eatingOut[key as keyof OptionalNutritionGuidance['eatingOut']], OPTIONAL_GUIDANCE_CUISINE_DISPLAY_LIMIT),
    ])) as OptionalNutritionGuidance['eatingOut'],
    cravings: Object.fromEntries(Object.keys(cravingDefinitions).map((key) => [
      key,
      mergeGuidanceItems(existingGuidance.cravings[key as keyof OptionalNutritionGuidance['cravings']], generatedGuidance.cravings[key as keyof OptionalNutritionGuidance['cravings']], OPTIONAL_GUIDANCE_CRAVING_DISPLAY_LIMIT),
    ])) as OptionalNutritionGuidance['cravings'],
  } : generatedGuidance;
  return updateConsultantDietPlanDraft(publicClientId, account, dietPlanId, {
    content: { ...version.content, optionalGuidance },
    reviewNotes: version.reviewNotes,
  });
};

export const searchConsultantOptionalGuidanceCandidates = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  dietPlanId: string,
  input: { query?: string; category: NutritionGuidanceItem['category']; context?: string },
) => {
  if (!isConsultantRole(account)) return null;
  const workspace = await getWorkspaceContext(publicClientId, account, { allowSeniorAuthority: true });
  if (!workspace?.careCase) return null;
  const plan = await getDietPlanById(dietPlanId);
  const version = plan?.currentVersionId ? await getCurrentDietPlanVersion(plan.id) : null;
  if (!plan || !version || plan.careCaseId !== workspace.careCase.id) return null;
  const preferences = await resolveFoodPreferencesFilter(publicClientId);
  const planEntries = NUTRITION_MEAL_SEQUENCE.flatMap((mealKey) => version.content.mealPlan[mealKey].options.map((item) => ({ mealKey, item })));
  const planOptionIds = new Set(planEntries.flatMap(({ item }) => item.id ? [item.id] : []));
  const contextKey = lower(input.context);
  const cuisine = input.category === 'eating_out' ? resolveCuisineLabel(contextKey) : 'general';
  const candidates = (await listMealLibrarySlotsForTarget({
    mealKey: '', target: undefined, consultantId: account.accountId,
    dietPreference: preferences.dietPreference, allergyTags: preferences.allergyTags,
    avoidedFoods: preferences.avoidedFoods, avoidedFoodIds: preferences.avoidedFoodIds, likedFoodIds: preferences.likedFoodIds,
    preferredCuisines: cuisine === 'general' ? [] : [cuisine], includeOutsideTarget: true, limit: 120,
  }))
    .filter(guidanceNutritionComplete)
    .filter((slot) => !input.query || filterByTextMatch(slot, [lower(input.query)]))
    .filter((slot) => input.category !== 'craving' || filterByTextMatch(slot, resolveCravingKeywords(contextKey)))
    .slice(0, 30);
  return {
    candidates: candidates.map((slot, index) => guidanceItemFromSlot({
      slot, category: input.category, displayOrder: index + 1, planOptionIds,
      cuisineTags: cuisine === 'general' ? undefined : [cuisine],
      cravingTags: input.category === 'craving' && contextKey ? [contextKey] : undefined,
      mealTags: planEntries.filter(({ item }) => item.id === slot.id).map(({ mealKey }) => mealKey),
    })),
  };
};

export const submitConsultantDietPlanForReview = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  dietPlanId: string,
) => {
  if (!isConsultantRole(account) || account.user.role?.toLowerCase() === 'senior_consultant') return null;
  const workspace = await getWorkspaceContext(publicClientId, account);
  if (!workspace?.careCase) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase.id || !plan.currentVersionId) return null;
  const version = await getCurrentDietPlanVersion(plan.id);
  if (!version) return null;
  assertDietPlanReviewContentComplete(version.content);
  await assertOptionalGuidanceValid(publicClientId, version.content);
  assertLifecycleTransition(version.lifecycleStatus, 'submitted_for_review');
  return updateDietPlanLifecycle({
    dietPlanId: plan.id,
    consultantId: account.accountId,
    currentVersionId: version.id,
    lifecycle: 'submitted_for_review',
    reviewEventType: version.lifecycleStatus === 'changes_requested' ? 'resubmitted' : 'submitted_for_review',
    sourceSnapshot: version.sourceSnapshot,
  });
};

export const requestConsultantDietPlanChanges = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  dietPlanId: string,
  comment: string,
) => {
  if (!canApproveOrPublishDietPlan(account)) {
    throw new NutritionPlanWorkflowError('ROLE_NOT_ALLOWED', 'Only a Senior Consultant can request changes.', 403);
  }
  const workspace = await getWorkspaceContext(publicClientId, account, { allowSeniorAuthority: true });
  if (!workspace?.careCase) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase.id || !plan.currentVersionId) return null;
  const version = await getCurrentDietPlanVersion(plan.id);
  if (!version) return null;
  assertLifecycleTransition(version.lifecycleStatus, 'changes_requested');
  return updateDietPlanLifecycle({
    dietPlanId: plan.id,
    consultantId: account.accountId,
    currentVersionId: version.id,
    lifecycle: 'changes_requested',
    reviewComment: comment,
    reviewEventType: 'changes_requested',
    sourceSnapshot: version.sourceSnapshot,
  });
};

export const getSeniorConsultantDietPlanReviewQueue = async (account: AuthenticatedAccount) => {
  if (!canApproveOrPublishDietPlan(account)) {
    throw new NutritionPlanWorkflowError('ROLE_NOT_ALLOWED', 'Only a Senior Consultant can access the review queue.', 403);
  }
  const reviews = await listDietPlanReviewQueue();
  return reviews.map((review) => {
    try {
      assertDietPlanReviewContentComplete(review.version.content);
      return { ...review, contentValidation: { status: 'ready' as const } };
    } catch (error) {
      if (!(error instanceof NutritionPlanWorkflowError)) throw error;
      return {
        ...review,
        contentValidation: {
          status: 'blocked' as const,
          code: error.code,
          message: error.message,
        },
      };
    }
  });
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
      'Only Senior Consultants can approve nutrition plans.',
      403,
    );
  }
  const workspace = await getWorkspaceContext(publicClientId, account, { allowSeniorAuthority: true });
  if (!workspace) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase?.id || !plan.currentVersionId) return null;
  if (plan.consultantId === account.accountId) {
    throw new NutritionPlanWorkflowError('SELF_APPROVAL_NOT_ALLOWED', 'A Consultant cannot approve their own diet plan.', 403);
  }
  const currentVersion = await getCurrentDietPlanVersion(plan.id);
  if (!currentVersion) return null;
  assertDietPlanReviewContentComplete(currentVersion.content);
  const guidance = await assertOptionalGuidanceValid(publicClientId, currentVersion.content);
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
  const reviewedAtISO = new Date().toISOString();
  const reviewedGuidance: OptionalNutritionGuidance | undefined = guidance ? {
    ...guidance,
    reviewedBy: account.accountId,
    reviewedAtISO,
    updatedBy: account.accountId,
    updatedAtISO: reviewedAtISO,
    whatCanIEatNow: guidance.whatCanIEatNow.map((item) => ({ ...item, clinicallyReviewed: true })),
    eatingOut: Object.fromEntries(Object.entries(guidance.eatingOut).map(([key, items]) => [key, items.map((item) => ({ ...item, clinicallyReviewed: true }))])) as OptionalNutritionGuidance['eatingOut'],
    cravings: Object.fromEntries(Object.entries(guidance.cravings).map(([key, items]) => [key, items.map((item) => ({ ...item, clinicallyReviewed: true }))])) as OptionalNutritionGuidance['cravings'],
  } : undefined;
  const approvedContent = { ...currentVersion.content, optionalGuidance: reviewedGuidance };
  await updateDietPlanVersionContent({
    dietPlanId: plan.id,
    versionId: currentVersion.id,
    content: approvedContent,
    contentSummary: contentSummaryFromContent(approvedContent),
    sourceSnapshot,
    lifecycleStatus: currentVersion.lifecycleStatus,
    reviewNotes: currentVersion.reviewNotes,
  });
  return updateDietPlanLifecycle({
    dietPlanId: plan.id,
    consultantId: account.accountId,
    currentVersionId: plan.currentVersionId,
    lifecycle: 'approved',
    approvedBy: account.accountId,
    reviewEventType: 'approved',
    sourceSnapshot,
  });
};

export const publishConsultantDietPlan = async (
  publicClientId: string,
  account: AuthenticatedAccount,
  dietPlanId: string,
  approvedVersionId: string,
) => {
  if (!isConsultantRole(account)) return null;
  const workspace = await getWorkspaceContext(publicClientId, account, { allowSeniorAuthority: true });
  if (!workspace || !workspace.careCase) return null;
  if (!canPublishAssignedDietPlan(account, workspace.access.source === 'cap003_professional_assignment')) {
    throw new NutritionPlanWorkflowError(
      'ROLE_NOT_ALLOWED',
      'Only the assigned Consultant or an authorised Senior Consultant can publish this nutrition plan.',
      403,
    );
  }
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase.id) return null;
  const approvedVersion = await getDietPlanVersionById(approvedVersionId);
  if (!approvedVersion) return null;
  assertDietPlanReviewContentComplete(approvedVersion.content);
  await assertOptionalGuidanceValid(publicClientId, approvedVersion.content, true);
  const publishAction = assertPublishVersionEligibility({
    dietPlanId: plan.id,
    requestedVersionId: approvedVersion.id,
    requestedVersionDietPlanId: approvedVersion.dietPlanId,
    requestedVersionLifecycle: approvedVersion.lifecycleStatus,
    latestPublishedVersionId: plan.latestPublishedVersionId,
  });
  if (publishAction === 'already_published') {
    return { plan, version: approvedVersion };
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
  const result = await publishApprovedDietPlanVersion({
    dietPlanId: plan.id,
    versionId: approvedVersion.id,
    publishedBy: account.accountId,
    sourceSnapshot,
  });
  await transitionCareCaseStageBestEffort(
    workspace.careCase,
    'diet_published',
    'Consultant published the nutrition plan.',
  );
  return result;
};

export const getConsultantLatestDietPlan = async (publicClientId: string, account: AuthenticatedAccount) => {
  const workspace = await getWorkspaceContext(publicClientId, account, { allowSeniorAuthority: true });
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
  const workspace = await getWorkspaceContext(publicClientId, account, { allowSeniorAuthority: true });
  if (!workspace || !workspace.careCase) return null;
  const plan = await getDietPlanById(dietPlanId);
  if (!plan || plan.careCaseId !== workspace.careCase.id) return null;
  const version = await getLatestDownloadableDietPlanVersion(plan);
  if (!version) return null;
  assertDietPlanReviewContentComplete(version.content);

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
  assertCurrentNutritionBusinessDate(consumedAtISO);
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

export const getDietPlanDeliveryStatusForClient = async (owner: ClientOwnershipContext) => {
  const careCase = await getCareCaseByClientId(owner.clientId);
  if (!careCase) return { status: 'NO_PLAN' as const, plan: null };

  const plan = await getDietPlanByCareCaseId(careCase.id);
  if (!plan) return { status: 'NO_PLAN' as const, plan: null };

  const version = plan.currentVersionId ? await getCurrentDietPlanVersion(plan.id) : null;
  const publishedVersion = plan.latestPublishedVersionId
    ? await getDietPlanVersionById(plan.latestPublishedVersionId)
    : null;
  const lifecycleStatus = version?.lifecycleStatus ?? plan.planStatus;
  const deliveryLifecycle = classifyDietPlanDeliveryLifecycle({
    planStatus: plan.planStatus,
    currentLifecycle: version?.lifecycleStatus ?? null,
    latestPublishedVersionId: plan.latestPublishedVersionId,
    publishedVersionId: publishedVersion?.id ?? null,
    publishedLifecycle: publishedVersion?.lifecycleStatus ?? null,
  });

  if (deliveryLifecycle === 'ACTIVE_PUBLISHED' && publishedVersion) {
    return {
      status: 'ACTIVE_PUBLISHED' as const,
      plan: {
        id: plan.id,
        versionId: publishedVersion.id,
        planStatus: plan.planStatus,
        lifecycleStatus: publishedVersion.lifecycleStatus,
        approvedAtISO: plan.approvedAtISO,
        publishedAtISO: plan.publishedAtISO,
      },
    };
  }

  if (deliveryLifecycle === 'APPROVED_NOT_PUBLISHED') {
    return {
      status: 'APPROVED_NOT_PUBLISHED' as const,
      plan: {
        id: plan.id,
        versionId: version?.id ?? null,
        planStatus: plan.planStatus,
        lifecycleStatus,
        approvedAtISO: plan.approvedAtISO,
        publishedAtISO: plan.publishedAtISO,
      },
    };
  }

  if (deliveryLifecycle === 'PENDING_APPROVAL') {
    return {
      status: 'PENDING_APPROVAL' as const,
      plan: {
        id: plan.id,
        versionId: version?.id ?? null,
        planStatus: plan.planStatus,
        lifecycleStatus,
        approvedAtISO: plan.approvedAtISO,
        publishedAtISO: plan.publishedAtISO,
      },
    };
  }

  return {
    status: 'PREPARING' as const,
    plan: {
      id: plan.id,
      versionId: version?.id ?? null,
      planStatus: plan.planStatus,
      lifecycleStatus,
      approvedAtISO: plan.approvedAtISO,
      publishedAtISO: plan.publishedAtISO,
    },
  };
};
type NutritionConsumptionState = 'PENDING' | 'CONSUMED_APPROVED' | 'CONSUMED_OUT_OF_PLAN' | 'SKIPPED';
type NutritionReasonCode = 'HIGHER_PROTEIN' | 'HIGHER_FIBRE' | 'LOWER_FAT' | 'CALORIE_FIT' | 'BALANCED_OPTION';

const nutritionMealOrder = NUTRITION_MEAL_SEQUENCE;

const nutritionMealLabels: Record<string, string> = {
  earlyMorning: 'Early Morning', breakfast: 'Breakfast', midMorningSnack: 'Mid-Morning',
  lunch: 'Lunch', eveningSnack: 'Evening Snack', dinner: 'Dinner', bedtimeNutrition: 'Bedtime',
};

const canonicalNutritionDay = /^\d{4}-\d{2}-\d{2}$/;
export const NUTRITION_TIME_ZONE = 'Asia/Kolkata';
const nutritionDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NUTRITION_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const nutritionDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  const parts = nutritionDateFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
export const isCanonicalNutritionDate = (value: string) => {
  if (!canonicalNutritionDay.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && nutritionDateKey(parsed) === value;
};

export const resolveDailyNutritionTargets = (content: NutritionPlanContent) => {
  const options = NUTRITION_MEAL_SEQUENCE.map((key) => content.mealPlan[key].options[0]).filter(Boolean);
  const sum = (field: 'approxKcal' | 'proteinGrams' | 'carbsGrams' | 'fatGrams' | 'fibreGrams') => {
    const values = options.map(option => option?.[field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return values.length ? Math.round(values.reduce((total, value) => total + value, 0)) : null;
  };
  const calories = content.dailyTargets.calories ?? sum('approxKcal');
  return {
    ...content.dailyTargets,
    calories,
    protein: content.dailyTargets.protein ?? sum('proteinGrams'),
    carbohydrates: content.dailyTargets.carbohydrates ?? sum('carbsGrams') ?? (calories == null ? null : Math.round((calories * .45) / 4)),
    fat: content.dailyTargets.fat ?? sum('fatGrams') ?? (calories == null ? null : Math.round((calories * .3) / 9)),
    fibre: content.dailyTargets.fibre ?? sum('fibreGrams') ?? (calories == null ? null : Math.max(25, Math.round((calories / 1000) * 14))),
  };
};

export const isFutureNutritionDate = (selectedDate: string, now = new Date()) => {
  return selectedDate > nutritionDateKey(now);
};

export const assertCurrentNutritionBusinessDate = (eventTimeISO: string, now = new Date()) => {
  if (nutritionDateKey(eventTimeISO) !== nutritionDateKey(now)) {
    throw new NutritionPlanWorkflowError(
      'NUTRITION_DATE_NOT_CURRENT',
      'Nutrition entries can only be logged for the current day.',
      400,
    );
  }
};

const resolveCravingKeywords = (craving: string) => {
  const key = lower(craving).trim();
  if (!key) return [] as string[];
  if (['sweet', 'savoury', 'sugar', 'sweetness'].includes(key)) return ['sweet', 'dessert', 'kheer', 'halwa', 'cake'];
  if (key === 'salty') return ['salty', 'namkeen', 'roasted', 'chat', 'papad', 'bhujia', 'chips'];
  if (key === 'crunchy') return ['crunchy', 'crunch', 'roasted', 'nuts', 'seed', 'munch'];
  if (key === 'spicy') return ['spicy', 'spice', 'masala', 'chili', 'curry', 'chhonk', 'tadka'];
  return [key];
};

const resolveCuisineLabel = (cuisine: string) => {
  const candidate = lower(cuisine).trim();
  const allowed = ['north indian', 'south indian', 'chinese', 'continental', 'fast food'];
  const match = allowed.find((item) => candidate.includes(item) || item.includes(candidate));
  return match ?? 'general';
};

const eventNutritionDate = (event: Awaited<ReturnType<typeof listHealthEvents>>[number]) => {
  const payload = parseNutritionEvent(event);
  const persistedDate = typeof payload?.nutritionDate === 'string' ? payload.nutritionDate : null;
  return persistedDate && isCanonicalNutritionDate(persistedDate)
    ? persistedDate
    : nutritionDateKey(event.eventTimeISO);
};

const parseNutritionEvent = (event: Awaited<ReturnType<typeof listHealthEvents>>[number]) => {
  if (event.type !== 'meal_logged' && event.type !== 'water_logged') return null;
  return event.payload as Record<string, unknown>;
};

const scoreApprovedOption = (option: NutritionPlanContent['mealPlan'][keyof NutritionPlanContent['mealPlan']]['options'][number], remaining: { calories: number | null; protein: number | null; fibre: number | null; fat: number | null }) => {
  let score = 0;
  const reasons: NutritionReasonCode[] = [];
  if (remaining.protein != null && remaining.protein > 0 && (option.proteinGrams ?? 0) >= 15) { score += 3; reasons.push('HIGHER_PROTEIN'); }
  if (remaining.fibre != null && remaining.fibre > 0 && (option.fibreGrams ?? 0) >= 5) { score += 2; reasons.push('HIGHER_FIBRE'); }
  if (remaining.fat != null && remaining.fat <= 12 && (option.fatGrams ?? 0) <= 15) { score += 2; reasons.push('LOWER_FAT'); }
  if (remaining.calories == null || option.approxKcal == null || option.approxKcal <= remaining.calories) { score += 2; reasons.push('CALORIE_FIT'); }
  if (reasons.length === 0) reasons.push('BALANCED_OPTION');
  return { score, reasons };
};

const buildNutritionProjection = async (owner: ClientOwnershipContext, rangeDays = 1, selectedDateISO?: string) => {
  const published = await getLatestPublishedDietPlanByClientId(owner);
  const careCase = await getCareCaseByClientId(owner.clientId);
  if (!published || !careCase) return null;
  const events = await listHealthEvents(careCase.id);
  const selectedDate = selectedDateISO ?? nutritionDateKey(new Date());
  if (!isCanonicalNutritionDate(selectedDate)) throw new NutritionPlanWorkflowError('INVALID_NUTRITION_DATE', 'Nutrition date must use YYYY-MM-DD.', 400);
  if (isFutureNutritionDate(selectedDate)) throw new NutritionPlanWorkflowError('FUTURE_DATE_NOT_ALLOWED', 'Future Nutrition history is not available.', 400);
  const selectedDayIndex = Math.floor(new Date(`${selectedDate}T12:00:00.000Z`).getTime() / 86400000);
  const firstDayIndex = selectedDayIndex - (rangeDays - 1);
  const relevant = events.filter((event) => {
    const date = eventNutritionDate(event);
    const dayIndex = Math.floor(new Date(`${date}T12:00:00.000Z`).getTime() / 86400000);
    return dayIndex >= firstDayIndex && dayIndex <= selectedDayIndex;
  });
  const mealEvents = relevant.filter((event) => {
    if (event.type !== 'meal_logged') return false;
    const payload = parseNutritionEvent(event);
    return payload?.planId === published.plan.id && payload?.versionId === published.version.id;
  });
  const latestByMeal = new Map<string, { state: NutritionConsumptionState; payload: Record<string, unknown>; eventTimeISO: string; eventId: string }>();
  for (const event of mealEvents.sort((a, b) => a.eventTimeISO.localeCompare(b.eventTimeISO))) {
    const payload = parseNutritionEvent(event);
    if (!payload || typeof payload.mealKey !== 'string') continue;
    latestByMeal.set(payload.mealKey, { state: (payload.state as NutritionConsumptionState) ?? 'CONSUMED_APPROVED', payload, eventTimeISO: event.eventTimeISO, eventId: event.id });
  }
  const targets = resolveDailyNutritionTargets(published.version.content);
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  for (const item of latestByMeal.values()) {
    if (item.state !== 'CONSUMED_APPROVED' && item.state !== 'CONSUMED_OUT_OF_PLAN') continue;
    totals.calories += Number(item.payload.calories ?? 0);
    totals.protein += Number(item.payload.proteinGrams ?? 0);
    totals.carbs += Number(item.payload.carbsGrams ?? 0);
    totals.fat += Number(item.payload.fatGrams ?? 0);
    totals.fibre += Number(item.payload.fibreGrams ?? 0);
  }
  const remaining = {
    calories: targets.calories == null ? null : Math.max(0, targets.calories - totals.calories),
    protein: targets.protein == null ? null : Math.max(0, targets.protein - totals.protein),
    carbs: targets.carbohydrates == null ? null : Math.max(0, targets.carbohydrates - totals.carbs),
    fat: targets.fat == null ? null : Math.max(0, targets.fat - totals.fat),
    fibre: targets.fibre == null ? null : Math.max(0, targets.fibre - totals.fibre),
  };
  const meals = NUTRITION_MEAL_SEQUENCE.map((key) => {
    const section = published.version.content.mealPlan[key];
    const ranking = section.options.map((option) => ({ option, rank: scoreApprovedOption(option, remaining) })).sort((a, b) => b.rank.score - a.rank.score);
    const current = latestByMeal.get(key);
    return {
      key, label: nutritionMealLabels[key], window: section.window, options: ranking.map(({ option, rank }) => ({ ...option, rankingReasons: rank.reasons })),
      state: current?.state ?? 'PENDING', consumedAtISO: current?.eventTimeISO ?? null,
      consumed: current?.payload ?? null,
    };
  });
  const waterMl = relevant.filter((event) => {
    if (event.type !== 'water_logged') return false;
    const payload = parseNutritionEvent(event);
    return payload?.planId === published.plan.id && payload?.versionId === published.version.id;
  }).reduce((sum, event) => { const payload = parseNutritionEvent(event); return sum + Number(payload?.waterMl ?? Number(payload?.litres ?? 0) * 1000); }, 0);
  const targetWater = targets.hydration;
  const consumedApprovedMeals = meals.filter((meal) => meal.state === 'CONSUMED_APPROVED').length;
  const outOfPlanMeals = meals.filter((meal) => meal.state === 'CONSUMED_OUT_OF_PLAN').length;
  const skippedMeals = meals.filter((meal) => meal.state === 'SKIPPED').length;
  const pendingMeals = meals.filter((meal) => meal.state === 'PENDING').length;
  const adherencePercent = meals.length === 0 ? 0 : Math.round((consumedApprovedMeals / meals.length) * 100);
  const adherenceLabel = adherencePercent >= 80
    ? 'Strong consistency'
    : adherencePercent >= 50
      ? 'Good consistency'
      : adherencePercent > 0
        ? 'Building consistency'
        : 'No meals logged yet';
  const nutritionScore = Math.min(100, Math.round((totals.protein / 120) * 55 + (totals.calories / 2200) * 45));
  const latestEventTimestamp = relevant.reduce<string | null>((latest, event) => (
    latest == null || event.eventTimeISO > latest ? event.eventTimeISO : latest
  ), null);
  const mealStates = meals.map((meal) => ({
    mealHeadId: meal.key, mealHeadName: meal.label, scheduledTime: meal.window, status: meal.state,
    loggedEventId: latestByMeal.get(meal.key)?.eventId ?? null,
    loggedOptionId: typeof meal.consumed?.optionId === 'string' ? meal.consumed.optionId : null,
    loggedFood: typeof meal.consumed?.mealName === 'string' ? meal.consumed.mealName : null,
    timestamp: meal.consumedAtISO,
  }));
  return {
    selectedDate, plan: published.plan, version: { ...published.version, content: { ...published.version.content, dailyTargets: targets } }, meals, totals, remaining, water: { litres: waterMl / 1000, targetLitres: targetWater, dailyWaterMl: waterMl, hydrationTargetMl: targetWater == null ? null : Math.round(targetWater * 1000), remainingHydrationMl: targetWater == null ? null : Math.max(Math.round(targetWater * 1000) - waterMl, 0) },
    dailyNutrition: { date: selectedDate, planId: published.plan.id, planVersionId: published.version.id, targetCalories: targets.calories, consumedCalories: totals.calories, targetProtein: targets.protein, consumedProtein: totals.protein, targetCarbs: targets.carbohydrates, consumedCarbs: totals.carbs, targetFat: targets.fat, consumedFat: totals.fat, targetFibre: targets.fibre, consumedFibre: totals.fibre, hydrationTargetMl: targetWater == null ? null : Math.round(targetWater * 1000), hydrationConsumedMl: waterMl, latestEventTimestamp },
    mealSummary: { totalMealHeads: meals.length, followedMeals: consumedApprovedMeals, consumedApprovedMeals, outOfPlanMeals, skippedMeals, pendingMeals },
    mealStates,
    adherence: { percent: adherencePercent, label: adherenceLabel },
    nutritionScore,
    plannedVsActual: { calories: { planned: targets.calories, actual: totals.calories }, mealsFollowed: { planned: meals.length, actual: consumedApprovedMeals }, outOfPlan: outOfPlanMeals, skipped: skippedMeals },
    mealCount: meals.length, mealsFollowed: consumedApprovedMeals,
    outOfPlanCount: outOfPlanMeals,
    skippedCount: skippedMeals,
    pendingCount: pendingMeals,
    consultantNote: published.version.content.supplementsAndClinicalNotes.map((item) => item.note).find(Boolean) ?? null,
  };
};

export const getClientNutritionExperience = (owner: ClientOwnershipContext, selectedDateISO?: string) => buildNutritionProjection(owner, 1, selectedDateISO);
export const getClientNutritionPattern = async (owner: ClientOwnershipContext, endDateISO?: string) => {
  const published = await getLatestPublishedDietPlanByClientId(owner);
  if (!published) return null;
  const careCase = await getCareCaseByClientId(owner.clientId);
  const events = careCase ? await listHealthEvents(careCase.id) : [];
  const endDate = endDateISO ?? nutritionDateKey(new Date());
  if (!isCanonicalNutritionDate(endDate)) throw new NutritionPlanWorkflowError('INVALID_NUTRITION_DATE', 'Nutrition date must use YYYY-MM-DD.', 400);
  const days = Array.from({ length: 7 }, (_, index) => nutritionDateKey(new Date(new Date(`${endDate}T12:00:00.000Z`).getTime() - ((6 - index) * 86400000))));
  const daySet = new Set(days);
  const latest = new Map<string, { state: NutritionConsumptionState; payload: Record<string, unknown> }>();
  const waterByDay = new Map<string, number>();
  for (const event of events) {
    const payload = parseNutritionEvent(event);
    const day = eventNutritionDate(event);
    if (!payload || !daySet.has(day) || payload.planId !== published.plan.id || payload.versionId !== published.version.id) continue;
    if (event.type === 'water_logged') waterByDay.set(day, (waterByDay.get(day) ?? 0) + Number(payload.waterMl ?? Number(payload.litres ?? 0) * 1000));
    if (event.type === 'meal_logged' && typeof payload.mealKey === 'string') latest.set(`${day}:${payload.mealKey}`, { state: (payload.state as NutritionConsumptionState) ?? 'CONSUMED_APPROVED', payload });
  }
  const targets = resolveDailyNutritionTargets(published.version.content);
  const totalMealHeads = Object.keys(published.version.content.mealPlan).length;
  const dailyAdherence = days.map((date) => {
    const rows = [...latest.entries()].filter(([key]) => key.startsWith(`${date}:`)).map(([, value]) => value);
    const approved = rows.filter((row) => row.state === 'CONSUMED_APPROVED').length;
    const outOfPlan = rows.filter((row) => row.state === 'CONSUMED_OUT_OF_PLAN').length;
    const skipped = rows.filter((row) => row.state === 'SKIPPED').length;
    const totals = rows.filter((row) => row.state === 'CONSUMED_APPROVED' || row.state === 'CONSUMED_OUT_OF_PLAN').reduce((sum, row) => ({ protein: sum.protein + Number(row.payload.proteinGrams ?? 0), fibre: sum.fibre + Number(row.payload.fibreGrams ?? 0) }), { protein: 0, fibre: 0 });
    return { date, approved, outOfPlan, skipped, pending: Math.max(totalMealHeads - rows.length, 0), adherencePercent: totalMealHeads ? Math.round((approved / totalMealHeads) * 100) : null, proteinMet: targets.protein == null ? null : totals.protein >= targets.protein, fibreMet: targets.fibre == null ? null : totals.fibre >= targets.fibre, waterMet: targets.hydration == null ? null : (waterByDay.get(date) ?? 0) >= targets.hydration * 1000 };
  });
  const approvedCount = dailyAdherence.reduce((sum, day) => sum + day.approved, 0);
  const outOfPlanCount = dailyAdherence.reduce((sum, day) => sum + day.outOfPlan, 0);
  const skippedCount = dailyAdherence.reduce((sum, day) => sum + day.skipped, 0);
  const plannedMealHeadCount = totalMealHeads * days.length;
  const resolvedCount = approvedCount + outOfPlanCount + skippedCount;
  const whatWorked = approvedCount ? [`${approvedCount} consultant-approved meal${approvedCount === 1 ? ' was' : 's were'} logged in this period.`] : [];
  const harderThisWeek = [...(outOfPlanCount ? [`${outOfPlanCount} meal${outOfPlanCount === 1 ? ' was' : 's were'} logged out of plan.`] : []), ...(skippedCount ? [`${skippedCount} planned meal${skippedCount === 1 ? ' was' : 's were'} skipped.`] : [])];
  const nextFocus = outOfPlanCount ? ['Use the highest-ranked remaining approved option when the next meal is pending.'] : skippedCount ? ['Use a remaining approved option when a planned meal is difficult to complete.'] : approvedCount ? ['Continue the approved choices that supported adherence this week.'] : [];
  return {
    periodDays: 7, startDate: days[0], endDate: days[6], dailyAdherence,
    planAdherencePercent: plannedMealHeadCount ? Math.round((approvedCount / plannedMealHeadCount) * 100) : null,
    outOfPlanMeals: outOfPlanCount, skippedMeals: skippedCount,
    waterTargetDays: targets.hydration == null ? null : dailyAdherence.filter((day) => day.waterMet).length,
    targetRangeDays: { protein: targets.protein == null ? null : dailyAdherence.filter((day) => day.proteinMet).length, fibre: targets.fibre == null ? null : dailyAdherence.filter((day) => day.fibreMet).length, water: targets.hydration == null ? null : dailyAdherence.filter((day) => day.waterMet).length },
    whatWorked, harderThisWeek, nextFocus, eatingPattern: resolvedCount ? [`${approvedCount} of ${resolvedCount} resolved meal heads followed the published plan.`] : [],
    insights: [...whatWorked, ...harderThisWeek, ...nextFocus],
  };
};

export const logClientNutritionEvent = async (owner: ClientOwnershipContext, input: {
  planId: string; versionId: string; mealKey: string; state: NutritionConsumptionState; optionId?: string | null;
  mealName?: string | null; calories?: number | null; proteinGrams?: number | null; carbsGrams?: number | null; fatGrams?: number | null; fibreGrams?: number | null; litres?: number | null; consumedAtISO?: string | null;
}) => {
  const published = await getLatestPublishedDietPlanByClientId(owner);
  if (!published || published.plan.id !== input.planId || published.version.id !== input.versionId) throw new NutritionPlanWorkflowError('DIET_PLAN_VERSION_MISMATCH', 'This nutrition plan is no longer current.', 409);
  const careCase = await getCareCaseByClientId(owner.clientId);
  if (!careCase) throw new NutritionPlanWorkflowError('CARE_CASE_NOT_FOUND', 'Care case not found for this client.', 404);
  const section = input.mealKey === 'water'
    ? null
    : published.version.content.mealPlan[input.mealKey as keyof NutritionPlanContent['mealPlan']];
  if (input.mealKey !== 'water' && !section) {
    throw new NutritionPlanWorkflowError('MEAL_NOT_FOUND', 'This meal is not part of the published plan.', 404);
  }
  const selectedOption = section?.options.find((option) =>
    (input.optionId && option.id === input.optionId) ||
    (!input.optionId && input.mealName && option.meal === input.mealName),
  );
  if (input.state === 'CONSUMED_APPROVED' && !selectedOption) {
    throw new NutritionPlanWorkflowError('OPTION_NOT_FOUND', 'Choose an approved option from the published plan.', 400);
  }
  const eventType = input.litres != null ? 'water_logged' : 'meal_logged';
  const eventTimeISO = input.consumedAtISO ?? new Date().toISOString();
  assertCurrentNutritionBusinessDate(eventTimeISO);
  await addHealthEvent({
    careCaseId: careCase.id,
    userId: owner.accountId,
    type: eventType,
    summary: eventType === 'water_logged' ? 'Water logged' : `${input.mealKey} nutrition state updated`,
    replayKey: `${careCase.id}:${eventType}:${input.mealKey}:${eventTimeISO}:${input.state}`,
    eventTimeISO,
    payload: {
      planId: input.planId,
      versionId: input.versionId,
      mealKey: input.mealKey,
      state: input.state,
      optionId: selectedOption?.id ?? input.optionId ?? null,
      mealName: selectedOption?.meal ?? input.mealName ?? null,
      calories: selectedOption?.approxKcal ?? input.calories ?? null,
      proteinGrams: selectedOption?.proteinGrams ?? input.proteinGrams ?? null,
      carbsGrams: selectedOption?.carbsGrams ?? input.carbsGrams ?? null,
      fatGrams: selectedOption?.fatGrams ?? input.fatGrams ?? null,
      fibreGrams: selectedOption?.fibreGrams ?? input.fibreGrams ?? null,
      litres: input.litres ?? null,
      nutritionDate: nutritionDateKey(eventTimeISO),
    },
  });
  return buildNutritionProjection(owner, 1, nutritionDateKey(eventTimeISO));
};

export const logClientNutritionWater = async (owner: ClientOwnershipContext, input: {
  planId: string; versionId: string; waterMl: number; consumedAtISO?: string | null;
}) => {
  const published = await getLatestPublishedDietPlanByClientId(owner);
  if (!published || published.plan.id !== input.planId || published.version.id !== input.versionId) {
    throw new NutritionPlanWorkflowError('DIET_PLAN_VERSION_MISMATCH', 'This nutrition plan is no longer current.', 409);
  }
  const careCase = await getCareCaseByClientId(owner.clientId);
  if (!careCase) throw new NutritionPlanWorkflowError('CARE_CASE_NOT_FOUND', 'Care case not found for this client.', 404);
  const eventTimeISO = input.consumedAtISO ?? new Date().toISOString();
  assertCurrentNutritionBusinessDate(eventTimeISO);
  await addHealthEvent({
    careCaseId: careCase.id,
    userId: owner.accountId,
    type: 'water_logged',
    summary: `${input.waterMl} ml water logged`,
    replayKey: `${careCase.id}:water_logged:${input.versionId}:${eventTimeISO}`,
    eventTimeISO,
    payload: { planId: input.planId, versionId: input.versionId, waterMl: input.waterMl, nutritionDate: nutritionDateKey(eventTimeISO) },
  });
  return buildNutritionProjection(owner, 1, nutritionDateKey(eventTimeISO));
};

const mealWindowMinutes = (window: string) => {
  const match = window.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return null;
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + Number(match[2] ?? 0);
};

const currentISTMinutes = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: NUTRITION_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
};

const buildRecipeContext = (experience: NonNullable<Awaited<ReturnType<typeof getClientNutritionExperience>>>) => {
  const pendingMeals = experience.meals.filter((item) => item.state === 'PENDING');
  const nowMinutes = currentISTMinutes();
  const timedPendingMeals = pendingMeals
    .map((item) => ({ item, minutes: mealWindowMinutes(item.window) }))
    .filter((entry): entry is { item: (typeof pendingMeals)[number]; minutes: number } => entry.minutes != null)
    .sort((left, right) => left.minutes - right.minutes);
  const timedMeal = timedPendingMeals.find((entry) => entry.minutes >= nowMinutes - 60)?.item
    ?? timedPendingMeals[timedPendingMeals.length - 1]?.item;
  const meal = timedMeal
    ?? pendingMeals[0]
    ?? experience.meals.find((item) => item.state === 'SKIPPED')
    ?? experience.meals[0];
  if (!meal) {
    throw new NutritionPlanWorkflowError('MEAL_CONTEXT_NOT_FOUND', 'No meal context was found for recommendations.', 404);
  }
  const section = experience.version.content.mealPlan[meal.key as NutritionMealPlanKey];
  return {
    selectedDate: experience.selectedDate,
    planId: experience.plan.id,
    versionId: experience.version.id,
    consumedTotals: {
      calories: Number(experience.totals.calories ?? 0),
      protein: Number(experience.totals.protein ?? 0),
      carbs: Number(experience.totals.carbs ?? 0),
      fat: Number(experience.totals.fat ?? 0),
      fibre: Number(experience.totals.fibre ?? 0),
    },
    remaining: {
      calories: experience.remaining.calories,
      protein: experience.remaining.protein,
      carbs: experience.remaining.carbs,
      fat: experience.remaining.fat,
      fibre: experience.remaining.fibre,
    },
    meal,
    section,
  };
};

export const scoreNutritionRecommendation = (
  option: NutritionMealSlot,
  remaining: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null; fibre: number | null },
) => {
  const calTarget = remaining.calories == null ? 1200 : Math.max(remaining.calories, 0);
  const proteinTarget = remaining.protein == null ? 40 : Math.max(remaining.protein, 0);
  const carbTarget = remaining.carbs == null ? 180 : Math.max(remaining.carbs, 0);
  const fatTarget = remaining.fat == null ? 60 : Math.max(remaining.fat, 0);
  const fibreTarget = remaining.fibre == null ? 20 : Math.max(remaining.fibre, 0);
  const scoreCal = option.approxKcal == null ? 0 : 100 - Math.abs((option.approxKcal - calTarget) / Math.max(calTarget, 1)) * 100;
  const scoreProtein = option.proteinGrams == null ? 0 : 100 - Math.abs((option.proteinGrams - proteinTarget) / Math.max(proteinTarget, 1)) * 100;
  const scoreCarb = option.carbsGrams == null ? 0 : 100 - Math.abs((option.carbsGrams - carbTarget) / Math.max(carbTarget, 1)) * 100;
  const scoreFibre = option.fibreGrams == null ? 0 : 100 - Math.abs((option.fibreGrams - fibreTarget) / Math.max(fibreTarget, 1)) * 100;
  const fatPenalty = option.fatGrams == null ? 0 : option.fatGrams > fatTarget ? ((option.fatGrams - fatTarget) / Math.max(fatTarget, 1)) * 100 : 0;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return clamp(scoreCal * 0.34 + scoreProtein * 0.35 + scoreCarb * 0.15 + scoreFibre * 0.1 - fatPenalty * 0.1);
};

const toRecommendationItem = (input: {
  option: NutritionMealSlot;
  mealKey: string;
  mealLabel: string;
  mode: NutritionRecommendationMode;
  sourceType: NutritionRecommendationSource;
  sourceLabel: string;
}) => ({
  id: input.option.id,
  mealName: input.option.meal,
  portion: input.option.portion,
  approxKcal: input.option.approxKcal,
  proteinGrams: input.option.proteinGrams,
  carbsGrams: input.option.carbsGrams ?? null,
  fatGrams: input.option.fatGrams ?? null,
  fibreGrams: input.option.fibreGrams ?? null,
  cuisineTags: input.option.cuisineTags ?? [],
  matchClassification: input.option.matchClassification,
  sourceType: input.sourceType,
  sourceLabel: input.sourceLabel,
  recommendationMode: input.mode,
  nutritionRationale: input.option.recommendationReason ?? null,
  rankingScore: 0,
  slot: input.option.slot,
});

const reviewedGuidanceToRecommendation = (item: NutritionGuidanceItem): ReturnType<typeof toRecommendationItem> => ({
  id: item.id,
  mealName: item.name,
  portion: item.servingLabel,
  approxKcal: item.nutrition.calories,
  proteinGrams: item.nutrition.protein,
  carbsGrams: item.nutrition.carbs,
  fatGrams: item.nutrition.fat,
  fibreGrams: item.nutrition.fibre,
  cuisineTags: item.cuisineTags,
  matchClassification: undefined,
  sourceType: item.planMembership ? 'published_plan' : 'published_reviewed_guidance',
  sourceLabel: item.planMembership ? 'Approved plan' : 'Reviewed guidance',
  recommendationMode: item.planMembership ? 'approved' : 'general',
  nutritionRationale: item.reason,
  rankingScore: 0,
  slot: item.displayOrder,
});

const guidanceItemToMealSlot = (item: NutritionGuidanceItem): NutritionMealSlot => ({
  id: item.id,
  slot: item.displayOrder,
  meal: item.name,
  portion: item.servingLabel,
  prepNote: item.reason,
  approxKcal: item.nutrition.calories,
  proteinGrams: item.nutrition.protein,
  carbsGrams: item.nutrition.carbs,
  fatGrams: item.nutrition.fat,
  fibreGrams: item.nutrition.fibre,
  cuisineTags: item.cuisineTags,
  dietaryTags: item.dietaryTags,
});

const rankReviewedGuidance = (
  items: NutritionGuidanceItem[],
  remaining: ReturnType<typeof buildRecipeContext>['remaining'],
) => sortRecommendations(items
  .filter((item) => item.enabled && item.clinicallyReviewed)
  .map((item) => ({ item: reviewedGuidanceToRecommendation(item), score: scoreNutritionRecommendation(guidanceItemToMealSlot(item), remaining) })), remaining);

const mapTextList = (value?: string[]) => (value ?? []).map((item) => lower(item));

const filterByTextMatch = (option: NutritionMealSlot, keywords: string[]) => {
  const target = mapTextList([option.meal, option.portion, option.prepNote ?? '', ...(option.cuisineTags ?? []), ...(option.dietaryTags ?? []), option.recommendationReason ?? '']);
  if (!keywords.length) return true;
  return keywords.some((keyword) => target.some((value) => value.includes(keyword)));
};

const resolveFoodPreferencesFilter = async (clientId: string) => {
  const profilePayload = await getFoodPreferenceProfile(clientId);
  const profile = profilePayload?.profile ?? null;
  return {
    dietPreference: profile?.dietType ?? null,
    allergyTags: profile?.restrictions ?? [],
    avoidedFoods: profile?.foodsAvoided ?? [],
    avoidedFoodIds: profile?.avoidedFoodIds ?? [],
    likedFoodIds: profile?.likedFoodIds ?? [],
    likedFoods: profile?.foodsLiked ?? [],
    dislikedFoods: profile?.foodsDisliked ?? [],
    dislikedFoodIds: profile?.dislikedFoodIds ?? [],
    preferredCuisines: profile?.cuisines ?? [],
    preferredProteins: profile?.proteins ?? [],
    staplePreference: profile?.staplePreference ?? null,
    dairyPreference: profile?.dairyPreference ?? null,
    practicality: profile?.practicality ?? [],
  };
};

const recommendationReason = (
  item: ReturnType<typeof toRecommendationItem>,
  remaining: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null; fibre: number | null },
) => {
  if ((remaining.protein ?? 0) >= 20 && (item.proteinGrams ?? 0) >= 20) return 'High protein fit';
  if ((remaining.fibre ?? 0) >= 5 && (item.fibreGrams ?? 0) >= 5) return 'Helps close fibre gap';
  if (remaining.fat != null && remaining.fat <= 10 && (item.fatGrams ?? Number.POSITIVE_INFINITY) <= remaining.fat) return 'Lower-fat fit';
  if (remaining.calories != null && remaining.calories <= 400 && (item.approxKcal ?? Number.POSITIVE_INFINITY) <= remaining.calories) return 'Light option for this time';
  return 'Balanced against today’s remaining targets';
};

const sortRecommendations = (
  items: Array<{ item: ReturnType<typeof toRecommendationItem>; score: number }>,
  remaining: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null; fibre: number | null },
) =>
  items
    .sort((left, right) => right.score - left.score)
    .map(({ item, score }) => ({
      ...item,
      rankingScore: Math.round(score * 10) / 10,
      nutritionRationale: recommendationReason(item, remaining),
    }));

const buildRecommendationResponse = (
  context: ReturnType<typeof buildRecipeContext>,
  recommendations: NutritionRecommendationItem[],
  guidanceStatus: NutritionRecommendationResponse['guidanceStatus'] = 'available',
): NutritionRecommendationResponse => ({
  recommendations,
  guidanceStatus,
  selectedDate: context.selectedDate,
  mealKey: context.meal.key,
  mealLabel: context.meal.label,
  mealWindow: context.meal.window,
  context: {
    planId: context.planId,
    versionId: context.versionId,
    consumedCal: context.consumedTotals.calories,
    consumedProtein: context.consumedTotals.protein,
    remainingCal: context.remaining.calories,
    remainingProtein: context.remaining.protein,
    remainingCarbs: context.remaining.carbs,
    remainingFat: context.remaining.fat,
    remainingFibre: context.remaining.fibre,
  },
});

export const getNutritionWhatCanIEatNow = async (
  owner: ClientOwnershipContext,
  selectedDateISO?: string,
  mealKey?: string,
) => {
  const experience = await getClientNutritionExperience(owner, selectedDateISO);
  if (!experience) throw new NutritionPlanWorkflowError('DIET_PLAN_NOT_FOUND', 'A published nutrition plan is required.', 404);
  const context = buildRecipeContext(experience);
  const sectionKey = mealKey && nutritionMealOrder.includes(mealKey as (typeof nutritionMealOrder)[number])
    ? mealKey
    : context.meal.key;
  const guidance = experience.version.content.optionalGuidance;
  if (!guidance) return buildRecommendationResponse(context, [], 'preparing');
  const eligible = guidance.whatCanIEatNow.filter((item) => !item.mealTags.length || item.mealTags.includes(sectionKey));
  return buildRecommendationResponse(context, rankReviewedGuidance(eligible, context.remaining));
};

export const getNutritionEatingOutSuggestions = async (
  owner: ClientOwnershipContext,
  input: { selectedDate?: string; mealKey?: string; cuisine?: string },
) => {
  const experience = await getClientNutritionExperience(owner, input.selectedDate);
  if (!experience) throw new NutritionPlanWorkflowError('DIET_PLAN_NOT_FOUND', 'A published nutrition plan is required.', 404);
  const context = buildRecipeContext(experience);
  const requestedCuisine = resolveCuisineLabel(input.cuisine ?? '');
  const guidance = experience.version.content.optionalGuidance;
  if (!guidance) return buildRecommendationResponse(context, [], 'preparing');
  const cuisineKey = ({ 'north indian': 'northIndian', 'south indian': 'southIndian', chinese: 'chinese', continental: 'continental', 'fast food': 'fastFood' } as const)[requestedCuisine as Exclude<typeof requestedCuisine, 'general'>];
  const items = cuisineKey ? guidance.eatingOut[cuisineKey].filter((item) => !item.mealTags.length || item.mealTags.includes(context.meal.key)) : [];
  return buildRecommendationResponse(context, rankReviewedGuidance(items, context.remaining));
};

export const getNutritionCravingSuggestions = async (
  owner: ClientOwnershipContext,
  input: { selectedDate?: string; mealKey?: string; craving: string },
) => {
  const experience = await getClientNutritionExperience(owner, input.selectedDate);
  if (!experience) throw new NutritionPlanWorkflowError('DIET_PLAN_NOT_FOUND', 'A published nutrition plan is required.', 404);
  const context = buildRecipeContext(experience);
  const guidance = experience.version.content.optionalGuidance;
  if (!guidance) return buildRecommendationResponse(context, [], 'preparing');
  const cravingKey = lower(input.craving) as keyof OptionalNutritionGuidance['cravings'];
  const items = (guidance.cravings[cravingKey] ?? []).filter((item) => !item.mealTags.length || item.mealTags.includes(context.meal.key));
  return buildRecommendationResponse(context, rankReviewedGuidance(items, context.remaining));
};
