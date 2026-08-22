import { apiFetch } from './apiClient';

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
  selectedDate: string;
  consultantNote: string | null;
};

export const getNutritionExperience = async (date?: string) => {
  const query = typeof date === 'string' && date.length ? `?date=${encodeURIComponent(date)}` : '';
  const response = await apiFetch<NutritionExperience>(`/v1/platform/nutrition-experience${query}`);
  return response;
};

export const getNutritionPattern = (endDate?: string) =>
  apiFetch<{
    periodDays: number;
    planAdherencePercent: number | null;
    outOfPlanMeals: number;
    skippedMeals: number;
    waterTargetDays: number | null;
    targetRangeDays: { protein: number | null; fibre: number | null; water: number | null };
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

export type NutritionRecommendationMode = 'approved' | 'outside_plan' | 'general';

export type NutritionRecommendationItem = {
  id?: string;
  mealName: string;
  portion: string;
  approxKcal: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fibreGrams: number | null;
  cuisineTags: string[];
  matchClassification?: 'best_match' | 'good_match' | 'acceptable' | 'outside_target';
  sourceType: 'published_plan' | 'verified_library' | 'meal_library';
  sourceLabel: string;
  recommendationMode: NutritionRecommendationMode;
  nutritionRationale: string | null;
  slot: number;
};

export type NutritionRecommendationResponse = {
  recommendations: NutritionRecommendationItem[];
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

export const getWhatCanIEatNow = (mealKey?: string, date?: string) =>
  apiFetch<NutritionRecommendationResponse>(`/v1/platform/nutrition-experience/recommendations/what-can-i-eat-now?${new URLSearchParams({
    ...(mealKey ? { mealKey } : {}),
    ...(date ? { date } : {}),
  } as Record<string, string>).toString()}`);

export const getEatingOutSuggestions = (params: { mealKey?: string; date?: string; cuisine: string }) =>
  apiFetch<NutritionRecommendationResponse>(`/v1/platform/nutrition-experience/recommendations/eating-out?${new URLSearchParams({
    ...(params.mealKey ? { mealKey: params.mealKey } : {}),
    ...(params.date ? { date: params.date } : {}),
    cuisine: params.cuisine,
  } as Record<string, string>).toString()}`);

export const getCravingSuggestions = (params: { mealKey?: string; date?: string; craving: string }) =>
  apiFetch<NutritionRecommendationResponse>(`/v1/platform/nutrition-experience/recommendations/craving?${new URLSearchParams({
    ...(params.mealKey ? { mealKey: params.mealKey } : {}),
    ...(params.date ? { date: params.date } : {}),
    craving: params.craving,
  } as Record<string, string>).toString()}`);
