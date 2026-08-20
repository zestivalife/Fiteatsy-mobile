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
  plan: { id: string; templateVersion: string; planStatus: string; publishedAtISO: string | null };
  version: { id: string; versionNumber: number; content: { nutritionSnapshot: { programmeName: string }; dailyTargets: { calories: number | null; protein: number | null; hydration: number | null }; supplementsAndClinicalNotes: Array<{ note: string }> } };
  meals: NutritionMeal[];
  totals: { calories: number; protein: number; carbs: number; fat: number; fibre: number };
  remaining: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null; fibre: number | null };
  water: { litres: number; targetLitres: number | null };
  mealCount: number;
  mealsFollowed: number;
  outOfPlanCount: number;
  skippedCount: number;
  consultantNote: string | null;
};

export const getNutritionExperience = () => apiFetch<NutritionExperience>('/v1/platform/nutrition-experience');
export const getNutritionPattern = () => apiFetch<{ periodDays: number; planAdherencePercent: number | null; outOfPlanMeals: number; skippedMeals: number; waterTargetDays: number | null; targetRangeDays: { protein: number | null; fibre: number | null; water: number | null }; insights: string[] }>('/v1/platform/nutrition-experience/pattern');
export const logNutritionEvent = (payload: { planId: string; versionId: string; mealKey: string; state: NutritionMeal['state']; optionId?: string | null; mealName?: string | null; calories?: number | null; proteinGrams?: number | null; carbsGrams?: number | null; fatGrams?: number | null; fibreGrams?: number | null }) => apiFetch<NutritionExperience>('/v1/platform/nutrition-experience/event', { method: 'POST', body: JSON.stringify(payload) });
export const logWater = (payload: { planId: string; versionId: string; litres: number }) => apiFetch<NutritionExperience>('/v1/platform/nutrition-experience/water', { method: 'POST', body: JSON.stringify(payload) });
