import { apiFetch, ApiClientError } from './apiClient';
import { nutritionDate } from '../utils/nutritionDate';

const TRANSIENT_NUTRITION_STATUSES = new Set([502, 503, 504]);

const nutritionFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    const retryable = error instanceof ApiClientError
      && error.status != null
      && TRANSIENT_NUTRITION_STATUSES.has(error.status);

    if (__DEV__) {
      console.warn('[NutritionRuntime] request failed', {
        path,
        method: init?.method ?? 'GET',
        code: error instanceof ApiClientError ? error.code : 'UNKNOWN',
        status: error instanceof ApiClientError ? error.status : undefined,
        retryable
      });
    }

    if (!retryable) throw error;
    return apiFetch<T>(path, init);
  }
};

export type NutritionOption = {
  id?: string;
  slot: number;
  meal: string;
  portion: string;
  approxKcal: number | null;
  proteinGrams: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  fibreGrams?: number | null;
  recommendationReason?: string | null;
  rankingReasons?: string[];
};

export type NutritionMeal = {
  key: string;
  label: string;
  window: string;
  options: NutritionOption[];
  state: 'PENDING' | 'CONSUMED_APPROVED' | 'CONSUMED_OUT_OF_PLAN' | 'SKIPPED';
  consumedAtISO: string | null;
  consumed: Record<string, unknown> | null;
};

export type NutritionExperience = {
  plan: {
    id: string;
    templateVersion: string;
    planStatus: string;
    publishedAtISO: string | null;
  };
  version: {
    id: string;
    versionNumber: number;
    content: {
      nutritionSnapshot: { programmeName: string };
      dailyTargets: {
        calories: number | null;
        protein: number | null;
        carbohydrates: number | null;
        fat: number | null;
        fibre: number | null;
        hydration: number | null;
      };
      supplementsAndClinicalNotes: Array<{ note: string }>;
    };
  };
  meals: NutritionMeal[];
  totals: { calories: number; protein: number; carbs: number; fat: number; fibre: number };
  remaining: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fibre: number | null;
  };
  water: { litres: number; targetLitres: number | null; dailyWaterMl?: number; hydrationTargetMl?: number | null; remainingHydrationMl?: number | null };
  mealCount: number;
  mealsFollowed: number;
  outOfPlanCount: number;
  skippedCount: number;
  pendingCount: number;
  plannedVsActual: { calories: { planned: number | null; actual: number }; mealsFollowed: { planned: number; actual: number }; outOfPlan: number; skipped: number };
  mealStates: Array<{ mealHeadId: string; mealHeadName: string; scheduledTime: string; status: NutritionMeal['state']; loggedEventId: string | null; loggedOptionId: string | null; loggedFood: string | null; timestamp: string | null }>;
  adherence: { percent: number; label: string };
  nutritionScore: number;
  selectedDate: string;
  consultantNote: string | null;
};

export const getNutritionExperience = async (date?: string) => {
  const canonicalDate = date ?? nutritionDate();
  const response = await nutritionFetch<NutritionExperience>(`/v1/platform/nutrition-experience?date=${encodeURIComponent(canonicalDate)}`);
  return { ...response, selectedDate: response.selectedDate || canonicalDate };
};

export const getNutritionPattern = (endDate?: string) =>
  nutritionFetch<{
    periodDays: number;
    planAdherencePercent: number | null;
    outOfPlanMeals: number;
    skippedMeals: number;
    waterTargetDays: number | null;
    targetRangeDays: { protein: number | null; fibre: number | null; water: number | null };
    startDate: string;
    endDate: string;
    dailyAdherence: Array<{ date: string; adherencePercent: number | null }>;
    whatWorked: string[];
    harderThisWeek: string[];
    nextFocus: string[];
    eatingPattern: string[];
    insights: string[];
  }>(`/v1/platform/nutrition-experience/pattern${endDate ? `?endDate=${encodeURIComponent(endDate)}` : ''}`);

export const logNutritionEvent = (payload: {
  planId: string;
  versionId: string;
  mealKey: string;
  state: NutritionMeal['state'];
  optionId?: string | null;
  mealName?: string | null;
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  fibreGrams?: number | null;
}) =>
  apiFetch<NutritionExperience>('/v1/platform/nutrition-experience/event', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const logWater = (payload: { planId: string; versionId: string; waterMl: number }) =>
  apiFetch<NutritionExperience>('/v1/platform/nutrition-experience/water', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
