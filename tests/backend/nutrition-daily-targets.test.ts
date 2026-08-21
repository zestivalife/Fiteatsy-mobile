import test from 'node:test';
import assert from 'node:assert/strict';
import type { NutritionPlanContent } from '../../backend/src/modules/platform/platform.types.js';
import { isCanonicalNutritionDate, resolveDailyTargets, resolveNutritionMealState } from '../../backend/src/modules/nutrition/nutrition.service.js';

test('resolveDailyTargets preserves consultant targets and deterministically fills legacy macro targets', () => {
  const content = {
    dailyTargets: { calories: 1800, protein: 120, hydration: 2.5, movement: 'Walk' },
  } as NutritionPlanContent;
  assert.deepEqual(resolveDailyTargets(content), {
    calories: 1800,
    protein: 120,
    carbohydrates: 203,
    fat: 60,
    fibre: 25,
    hydration: 2.5,
    movement: 'Walk',
  });
});

test('Nutrition dates accept only canonical real YYYY-MM-DD values', () => {
  assert.equal(isCanonicalNutritionDate('2026-08-21'), true);
  assert.equal(isCanonicalNutritionDate('21 Aug 2026'), false);
  assert.equal(isCanonicalNutritionDate('2026-02-30'), false);
  assert.equal(isCanonicalNutritionDate(''), false);
});

test('meal state reconciliation treats legacy logged meals as consumed and absent heads as pending', () => {
  assert.equal(resolveNutritionMealState(), 'PENDING');
  assert.equal(resolveNutritionMealState({ mealKey: 'breakfast' }), 'CONSUMED_APPROVED');
  assert.equal(resolveNutritionMealState({ state: 'SKIPPED' }), 'SKIPPED');
  assert.equal(resolveNutritionMealState({ state: 'CONSUMED_OUT_OF_PLAN' }), 'CONSUMED_OUT_OF_PLAN');
});

test('resolveDailyTargets never replaces explicit consultant macro targets', () => {
  const content = {
    dailyTargets: { calories: 1800, protein: 120, carbohydrates: 190, fat: 55, fibre: 32, hydration: 2.5, movement: 'Walk' },
  } as NutritionPlanContent;
  const targets = resolveDailyTargets(content);
  assert.equal(targets.carbohydrates, 190);
  assert.equal(targets.fat, 55);
  assert.equal(targets.fibre, 32);
});
