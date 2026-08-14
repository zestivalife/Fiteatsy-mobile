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
  getLatestPublishedDietPlanByClientId,
  updateDietPlanLifecycle,
  updateDietPlanVersionContent,
  updateDietPlanVersionExportPaths,
} from './nutrition.store.js';
import { generateDietPlanDocument } from './nutrition.document.js';

const TEMPLATE_VERSION = '2Zestiva_Premium_Personalised_Diet_Plan_Template_v0.2_Compact';

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

const isConsultantRole = (account: AuthenticatedAccount) =>
  ['consultant', 'practitioner', 'admin', 'super_admin', 'superuser'].includes(account.user.role?.toLowerCase() ?? '');

const canApproveOrPublishDietPlan = (account: AuthenticatedAccount) =>
  ['consultant', 'admin', 'super_admin', 'superuser'].includes(account.user.role?.toLowerCase() ?? '');

const unique = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => (value ?? '').trim()).filter(Boolean)));

const round = (value: number | null, digits = 0) => {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const lower = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

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
  };
};

const mealSection = (
  window: string,
  focus: string,
  kcalTarget: number,
  proteinTarget: number,
  options: Array<{ meal: string; portion: string; prepNote: string }>,
): NutritionMealSection => ({
  window,
  focus,
  options: options.map((option, index) => ({
    slot: index + 1,
    meal: option.meal,
    portion: option.portion,
    prepNote: option.prepNote,
    approxKcal: kcalTarget,
    proteinGrams: proteinTarget,
  })),
});

const buildDraftContent = (input: {
  clientName: string;
  age: number | null;
  gender: string | null;
  goals: string[];
  conditions: string[];
  dietPreference: string | null;
  allergies: string[];
  regionalCuisine: string | null;
  lifestyleSummary: string;
  programmeName: string;
  preparedBy: string;
  intelligence: NutritionIntelligence;
  calorieTarget: number | null;
  proteinTargetGrams: number | null;
  hydrationTargetLiters: number | null;
}) => {
  const calories = input.calorieTarget ?? 1800;
  const protein = input.proteinTargetGrams ?? 90;
  const earlyCalories = Math.round(calories * 0.08);
  const breakfastCalories = Math.round(calories * 0.22);
  const snackCalories = Math.round(calories * 0.1);
  const lunchCalories = Math.round(calories * 0.26);
  const eveningCalories = Math.round(calories * 0.1);
  const dinnerCalories = Math.round(calories * 0.18);
  const bedtimeCalories = Math.round(calories * 0.06);

  const vegetarian = lower(input.dietPreference).includes('veg');
  const proteinOptions = vegetarian
    ? ['Paneer bhurji', 'Moong chilla', 'Greek curd bowl', 'Tofu stir fry', 'Dal + curd']
    : ['Egg bhurji', 'Chicken bowl', 'Greek curd bowl', 'Fish curry', 'Dal + curd'];

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
      earlyMorning: mealSection('6:00-7:30 AM', 'Gentle metabolic wake-up', Math.round(earlyCalories / 2), Math.round(protein * 0.06), [
        { meal: 'Warm water with soaked seeds', portion: '1 glass + 1 tbsp seeds', prepNote: 'Simple hydration anchor to start the day.' },
        { meal: 'Jeera-ajwain water + nuts', portion: '1 glass + 6 almonds', prepNote: 'Useful when appetite is low in the morning.' },
      ]),
      breakfast: mealSection('8:00-9:30 AM', 'Protein-first breakfast', Math.round(breakfastCalories / 2), Math.round(protein * 0.22), [
        { meal: `${proteinOptions[0]} + vegetable side`, portion: '1 plate', prepNote: 'Keep oil moderate and add a fruit if energy is low.' },
        { meal: `${proteinOptions[1]} + chutney`, portion: '2 medium', prepNote: 'Choose a convenient repeatable option on busy mornings.' },
      ]),
      midMorningSnack: mealSection('11:00-11:30 AM', 'Steady energy between meals', Math.round(snackCalories / 2), Math.round(protein * 0.1), [
        { meal: 'Curd or buttermilk + seeds', portion: '1 cup', prepNote: 'Supports hydration and protein distribution.' },
        { meal: 'Fruit + handful roasted chana', portion: '1 serving', prepNote: 'Pair fruit with protein for steadier energy.' },
      ]),
      lunch: mealSection('1:00-2:30 PM', 'Balanced lunch plate', Math.round(lunchCalories / 2), Math.round(protein * 0.26), [
        { meal: `${proteinOptions[4]} + sabzi + roti/rice`, portion: '1 balanced plate', prepNote: 'Half plate vegetables, quarter protein, quarter carbs.' },
        { meal: `${proteinOptions[3]} + salad + millet`, portion: '1 balanced plate', prepNote: 'Use regional staples to improve adherence.' },
      ]),
      eveningSnack: mealSection('4:30-5:30 PM', 'Prevent cravings and energy dips', Math.round(eveningCalories / 2), Math.round(protein * 0.1), [
        { meal: 'Sprouts / makhana / boiled chana', portion: '1 bowl', prepNote: 'Useful before long work blocks or commute.' },
        { meal: 'Protein smoothie or curd bowl', portion: '1 serving', prepNote: 'Choose low-sugar options on low-energy days.' },
      ]),
      dinner: mealSection('7:30-9:00 PM', 'Lighter dinner for recovery', Math.round(dinnerCalories / 2), Math.round(protein * 0.18), [
        { meal: `${proteinOptions[2]} + sauteed vegetables`, portion: '1 serving', prepNote: 'Keep dinner simpler than lunch when sleep support is needed.' },
        { meal: 'Dal soup + paneer/tofu/chicken + vegetables', portion: '1 bowl + side', prepNote: 'Aim for easy digestion and stable overnight hunger.' },
      ]),
      bedtimeNutrition: mealSection('9:30-10:30 PM', 'Support sleep and overnight satiety', Math.round(bedtimeCalories / 2), Math.round(protein * 0.08), [
        { meal: 'Haldi milk / unsweetened milk / soy milk', portion: '1 cup', prepNote: 'Use only if it improves hunger control or sleep quality.' },
        { meal: 'Small curd bowl or nuts', portion: '1 small serving', prepNote: 'Avoid heavy or sugary bedtime add-ons.' },
      ]),
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
      { foodGroup: 'Protein', usualChoice: vegetarian ? 'Paneer / curd' : 'Eggs / chicken', alternative: vegetarian ? 'Tofu / sprouts / dal' : 'Fish / dal / curd' },
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
  const content = buildDraftContent({
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

  const version = await updateDietPlanVersionContent({
    dietPlanId: plan.id,
    versionId: currentVersion.id,
    content: input.content,
    contentSummary: contentSummaryFromContent(input.content),
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
  const version = await getCurrentDietPlanVersion(plan.id);
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

export const getPublishedDietPlanForClient = async (owner: ClientOwnershipContext) =>
  getLatestPublishedDietPlanByClientId(owner);
