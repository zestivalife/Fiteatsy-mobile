import { ApiClientError } from './apiClient';
import { getExternalDietPlans, listExternalConsultants, type ExternalDietPlan } from './externalConsultantService';
import type { NutritionExperience, NutritionMeal, NutritionOption } from './nutritionExperienceService';

const MEALS = [
  ['EARLY_MORNING', 'Early Morning', '06:00–07:00'],
  ['BREAKFAST', 'Breakfast', '08:00–09:00'],
  ['MID_MORNING', 'Mid Morning', '11:00–11:30'],
  ['LUNCH', 'Lunch', '13:00–14:00'],
  ['EVENING_SNACK', 'Evening Snack', '16:30–17:30'],
  ['DINNER', 'Dinner', '19:30–20:30'],
  ['BEDTIME', 'Bedtime', '21:30–22:00'],
] as const;

type PublishedOption = {
  id?: unknown; mealHead?: unknown; title?: unknown; serving?: unknown;
  nutrition?: Record<string, unknown>; calculationStatus?: unknown;
};
type PublishedContent = {
  contractVersion?: unknown;
  plan?: { id?: unknown; version?: unknown; title?: unknown; publishedAt?: unknown };
  targets?: { calories?: unknown; protein?: unknown; carbohydrates?: unknown; fat?: unknown; fibre?: unknown; hydration?: unknown };
  mealOptions?: unknown;
  instructions?: unknown;
  calculationAuthority?: unknown;
};

const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: unknown) => typeof value === 'string' ? value : '';

export const externalPlanToNutritionExperience = (publication: ExternalDietPlan, selectedDate: string): NutritionExperience => {
  const content = publication.content as PublishedContent;
  if (content.contractVersion !== 'EXTERNAL_DIET_PLAN_V1'
    || content.calculationAuthority !== 'FITEATSY_GOVERNED_COMMON_FOOD'
    || !content.plan || !Array.isArray(content.mealOptions)) {
    throw new ApiClientError('VALIDATION_ERROR', 'The consultant-published nutrition plan is malformed.');
  }
  const options = content.mealOptions as PublishedOption[];
  if (options.some(option => option.calculationStatus !== 'AUTHORITATIVELY_RESOLVED')) {
    throw new ApiClientError('VALIDATION_ERROR', 'The consultant-published nutrition plan is not authoritative.');
  }
  const meals: NutritionMeal[] = MEALS.map(([key, label, window]) => ({
    key,
    label,
    window,
    state: 'PENDING',
    consumedAtISO: null,
    consumed: null,
    selectedOptionId: null,
    options: options.filter(option => option.mealHead === key).map((option, slot): NutritionOption => {
      const nutrition = option.nutrition ?? {};
      return {
        id: text(option.id), slot: slot + 1, meal: text(option.title) || label,
        portion: text(option.serving), approxKcal: finite(nutrition.kcal),
        proteinGrams: finite(nutrition.protein), carbsGrams: finite(nutrition.carbohydrate),
        fatGrams: finite(nutrition.fat), fibreGrams: finite(nutrition.fibre),
      };
    }),
  }));
  const targets = content.targets ?? {};
  const calories = finite(targets.calories), protein = finite(targets.protein);
  const carbohydrates = finite(targets.carbohydrates), fat = finite(targets.fat), fibre = finite(targets.fibre);
  const notes = Array.isArray(content.instructions)
    ? content.instructions.filter((value): value is string => typeof value === 'string').map(note => ({ note })) : [];
  return {
    delivery: { source: 'EXTERNAL_CONSULTANT', readOnly: true, publicationId: publication.id },
    plan: { id: text(content.plan.id) || publication.plan_id, templateVersion: content.contractVersion,
      planStatus: publication.status, publishedAtISO: publication.published_at },
    version: { id: publication.id, versionNumber: publication.plan_version,
      content: { nutritionSnapshot: { programmeName: text(content.plan.title) || publication.title },
        dailyTargets: { calories, protein, carbohydrates, fat, fibre, hydration: finite(targets.hydration) },
        supplementsAndClinicalNotes: notes } },
    meals, totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    remaining: { calories, protein, carbs: carbohydrates, fat, fibre },
    water: { litres: 0, targetLitres: finite(targets.hydration) },
    mealCount: meals.length, mealsFollowed: 0, outOfPlanCount: 0, skippedCount: 0,
    pendingCount: meals.length,
    plannedVsActual: { calories: { planned: calories, actual: 0 }, mealsFollowed: { planned: meals.length, actual: 0 }, outOfPlan: 0, skipped: 0 },
    mealStates: meals.map(meal => ({ mealHeadId: meal.key, mealHeadName: meal.label, scheduledTime: meal.window,
      status: 'PENDING', loggedEventId: null, loggedOptionId: null, loggedFood: null, timestamp: null })),
    adherence: { percent: 0, label: 'Not tracked for consultant plan' }, nutritionScore: 0,
    selectedDate, consultantNote: notes[0]?.note ?? null,
  };
};

export const getActiveExternalNutritionExperience = async (selectedDate: string) => {
  const connections = (await listExternalConsultants()).connections.filter(connection =>
    connection.state === 'ACTIVE' && connection.consented_scopes.includes('DIET_PLANS'));
  const results = await Promise.all(connections.map(async connection => (await getExternalDietPlans(connection.id)).plans));
  const active = results.flat().find(plan => plan.status === 'PUBLISHED' && plan.is_active);
  if (!active) throw new ApiClientError('NOT_FOUND', 'No active published consultant Diet Plan is available.', 404, 'DIET_PLAN_NOT_FOUND');
  return externalPlanToNutritionExperience(active, selectedDate);
};
