import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { projectPublishedMealOptions } from '../../backend/src/modules/nutrition/nutrition.service.js';
import type { NutritionPlanContent } from '../../backend/src/modules/platform/platform.types.js';

const mealKeys = ['earlyMorning', 'breakfast', 'midMorningSnack', 'lunch', 'eveningSnack', 'dinner', 'bedtimeNutrition'] as const;
const heads = ['EARLY_MORNING', 'BREAKFAST', 'MID_MORNING', 'LUNCH', 'EVENING_SNACK', 'DINNER', 'BEDTIME'];
const content = {
  mealPlan: Object.fromEntries(mealKeys.map((key) => [key, { window: key, focus: key, options: [{ id: `legacy-${key}`, slot: 1, meal: 'Legacy fallback', portion: '1 bowl', approxKcal: 1, proteinGrams: 1 }] }])),
} as unknown as NutritionPlanContent;
const frozen = heads.flatMap((mealHead) => Array.from({ length: 5 }, (_, index) => ({
  combinationId: `${mealHead}-${index + 1}`,
  mealHead,
  clientTitle: `${mealHead} published ${index + 1}`,
  humanServingSummary: '1 portion',
  components: [{ componentId: `${mealHead}-component-${index + 1}`, foodDisplayNameSnapshot: 'Published food', label: '100 g', grams: 100, millilitres: null }],
  nutrition: { kcal: 100 + index, protein: 10 + index, carbohydrate: 20, fat: 5, fibre: 3 },
  optionHash: `${mealHead}-hash-${index + 1}`,
})));

test('client projection preserves exact frozen 7x5 order, identity, title and nutrition', () => {
  const projected = projectPublishedMealOptions({ content, commonFoodOptions: frozen });
  assert.equal(mealKeys.flatMap((key) => projected[key]).length, 35);
  mealKeys.forEach((key, mealIndex) => {
    assert.deepEqual(projected[key].map((item) => item.id), frozen.slice(mealIndex * 5, mealIndex * 5 + 5).map((item) => item.combinationId));
    assert.deepEqual(projected[key].map((item) => item.meal), frozen.slice(mealIndex * 5, mealIndex * 5 + 5).map((item) => item.clientTitle));
    assert.deepEqual(projected[key].map((item) => item.approxKcal), [100, 101, 102, 103, 104]);
  });
});

test('client projection never ranks, regenerates or leaks incomplete candidates', () => {
  const projected = projectPublishedMealOptions({ content, commonFoodOptions: frozen.slice(0, 34) });
  assert.equal(projected.lunch[0]?.id, 'legacy-lunch');
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const projectionBody = service.slice(service.indexOf('const buildNutritionProjection'), service.indexOf('export const getClientNutritionExperience'));
  assert.doesNotMatch(projectionBody, /scoreApprovedOption|section\.options\.map|ranking\.map/);
  assert.match(projectionBody, /projectPublishedMealOptions\(published\.version\)/);
});

test('mobile choice is reversible before logging and exposes exact component detail', () => {
  const screen = readFileSync(new URL('../../src/screens/home/NutritionExperienceScreen.tsx', import.meta.url), 'utf8');
  for (const copy of ['Choose 1 of 5 Consultant-approved options', 'Use this meal', 'Change meal', 'Log meal', 'View ingredients / quantities']) assert.match(screen, new RegExp(copy));
  assert.match(screen, /updateMeal\(selected, 'PENDING', option\)/);
  assert.match(screen, /updateMeal\(meal, 'CONSUMED_APPROVED', option\)/);
  assert.doesNotMatch(screen, /onPress=\{\(\) => void updateMeal\(selected, 'CONSUMED_APPROVED'/);
});
