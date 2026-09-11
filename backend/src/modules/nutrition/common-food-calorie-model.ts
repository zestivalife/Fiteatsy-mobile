import { MEAL_HEADS, type MealHead, type MealTarget } from './common-food-engine.js';

export type CalorieOption = {
  combinationId?: string;
  mealHead: MealHead;
  nutrition?: { kcal: number | null };
};

export const optionCalorieStatus = (mealHead: MealHead, mealTargetKcal: number | null, optionKcal: number | null) => {
  if (mealTargetKcal === null || optionKcal === null) return { mealHead, mealTargetKcal, optionKcal, differenceKcal: null, status: 'INCOMPLETE' as const, advisory: null };
  const differenceKcal = optionKcal - mealTargetKcal;
  const mealLabel = mealHead.toLowerCase().replaceAll('_', ' ');
  return {
    mealHead,
    mealTargetKcal,
    optionKcal,
    differenceKcal,
    status: differenceKcal === 0 ? 'ON_TARGET' as const : differenceKcal > 0 ? 'ABOVE_TARGET' as const : 'BELOW_TARGET' as const,
    advisory: differenceKcal > 0 ? `${differenceKcal} kcal above the suggested ${mealLabel} allocation.` : null,
  };
};

export const dailyPlanCalorieModel = (input: {
  dailyTargetKcal: number | null;
  mealTargets: Record<MealHead, Pick<MealTarget, 'kcal'> & { kcal: number | null }>;
  options: CalorieOption[];
  authoritativeOptionIds?: string[];
}) => {
  const mealAllocations = MEAL_HEADS.map(mealHead => ({ mealHead, mealTargetKcal: input.mealTargets[mealHead]?.kcal ?? null }));
  const allocationTotalKcal = mealAllocations.every(item => item.mealTargetKcal !== null)
    ? mealAllocations.reduce((sum, item) => sum + item.mealTargetKcal!, 0)
    : null;
  const extrema = MEAL_HEADS.map(mealHead => {
    const values = input.options.filter(option => option.mealHead === mealHead).map(option => option.nutrition?.kcal ?? null);
    return values.length > 0 && values.every((value): value is number => value !== null)
      ? { mealHead, minimumKcal: Math.min(...values), maximumKcal: Math.max(...values) }
      : { mealHead, minimumKcal: null, maximumKcal: null };
  });
  const rangeComplete = extrema.every(item => item.minimumKcal !== null && item.maximumKcal !== null);
  const minimumDailyKcal = rangeComplete ? extrema.reduce((sum, item) => sum + item.minimumKcal!, 0) : null;
  const maximumDailyKcal = rangeComplete ? extrema.reduce((sum, item) => sum + item.maximumKcal!, 0) : null;
  const maximumDifferenceKcal = maximumDailyKcal !== null && input.dailyTargetKcal !== null ? maximumDailyKcal - input.dailyTargetKcal : null;
  const rangeAdvisory = maximumDifferenceKcal !== null && maximumDifferenceKcal > 0
    ? `Some meal combinations may exceed the daily target. Maximum planned combination is ${maximumDifferenceKcal} kcal above target.`
    : null;
  const authoritativeIds = input.authoritativeOptionIds ?? [];
  const authoritative = MEAL_HEADS.map(mealHead => input.options.filter(option => option.mealHead === mealHead && option.combinationId !== undefined && authoritativeIds.includes(option.combinationId)));
  const selectedComplete = authoritativeIds.length === MEAL_HEADS.length && new Set(authoritativeIds).size === MEAL_HEADS.length && authoritative.every(options => options.length === 1 && options[0].nutrition?.kcal !== null && options[0].nutrition?.kcal !== undefined);
  const selectedDailyKcal = selectedComplete ? authoritative.reduce((sum, options) => sum + options[0].nutrition!.kcal!, 0) : null;
  const selectedDifferenceKcal = selectedDailyKcal !== null && input.dailyTargetKcal !== null ? selectedDailyKcal - input.dailyTargetKcal : null;
  return {
    dailyTargetKcal: input.dailyTargetKcal,
    mealAllocations,
    allocationTotalKcal,
    allocationMatchesDailyTarget: allocationTotalKcal !== null && input.dailyTargetKcal !== null ? allocationTotalKcal === input.dailyTargetKcal : null,
    minimumDailyKcal,
    maximumDailyKcal,
    rangeComplete,
    rangeAdvisory,
    selectedDailyKcal,
    selectedDailyComplete: selectedComplete,
    selectedDailyAdvisory: selectedDifferenceKcal !== null && selectedDifferenceKcal > 0 ? `Daily calorie target exceeded by ${selectedDifferenceKcal} kcal.` : null,
  };
};
