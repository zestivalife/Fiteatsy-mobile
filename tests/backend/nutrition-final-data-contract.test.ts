import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('water has a dedicated millilitre contract and never uses meal validation', () => {
  const routes = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.routes.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../src/services/nutritionExperienceService.ts', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/screens/home/NutritionExperienceScreen.tsx', import.meta.url), 'utf8');

  assert.match(routes, /nutrition-experience\/water[\s\S]*logClientNutritionWater/);
  assert.match(routes, /waterMl: z\.number\(\)\.int\(\)\.positive\(\)/);
  assert.doesNotMatch(service.slice(service.indexOf('export const logClientNutritionWater')), /Choose an approved option/);
  assert.match(client, /waterMl: number/);
  for (const amount of ['.25', '.5', '.75', '1']) assert.match(screen, new RegExp(`\\[\\.25, \\.5, \\.75, 1\\]`), amount);
  assert.match(screen, /Unable to add water\. Please try again\./);
});

test('daily client projection exposes canonical date and reconciled meal states', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../src/services/nutritionExperienceService.ts', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/screens/home/NutritionExperienceScreen.tsx', import.meta.url), 'utf8');

  assert.match(service, /selectedDate/);
  assert.match(service, /mealsFollowed: meals\.filter\(\(meal\) => meal\.state !== 'PENDING'\)\.length/);
  assert.match(service, /pendingCount: meals\.filter\(\(meal\) => meal\.state === 'PENDING'\)\.length/);
  assert.match(client, /nutrition-experience\?date=/);
  assert.match(screen, /selectedDate.*isoDay\(new Date\(\)\)/s);
  assert.match(screen, /getFullYear\(\)[\s\S]*getMonth\(\)[\s\S]*getDate\(\)/);
  assert.doesNotMatch(screen, /new Date\(data\.selectedDate\)(?!T00:00:00)/);
});
