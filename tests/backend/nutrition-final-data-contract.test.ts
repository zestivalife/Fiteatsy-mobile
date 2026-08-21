import test from 'node:test';
import assert from 'node:assert/strict';
import type { NutritionPlanContent } from '../../backend/src/modules/platform/platform.types.js';
import { isCanonicalNutritionDate, resolveDailyNutritionTargets } from '../../backend/src/modules/nutrition/nutrition.service.js';

test('Nutrition date contract accepts real YYYY-MM-DD values only', () => {
  assert.equal(isCanonicalNutritionDate('2026-08-21'), true);
  assert.equal(isCanonicalNutritionDate('Invalid Date'), false);
  assert.equal(isCanonicalNutritionDate('2026-02-30'), false);
});

test('legacy published plans deterministically resolve all macro targets', () => {
  const emptySection = { window: '', focus: '', options: [] };
  const content = {
    dailyTargets: { calories: 1800, protein: 120, hydration: 2.5, movement: 'Walk' },
    mealPlan: { earlyMorning: emptySection, breakfast: emptySection, midMorningSnack: emptySection, lunch: emptySection, eveningSnack: emptySection, dinner: emptySection, bedtimeNutrition: emptySection },
  } as NutritionPlanContent;
  assert.deepEqual(resolveDailyNutritionTargets(content), {
    calories: 1800, protein: 120, carbohydrates: 203, fat: 60, fibre: 25, hydration: 2.5, movement: 'Walk',
  });
});
