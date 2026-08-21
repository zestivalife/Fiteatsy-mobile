import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { NutritionPlanContent } from '../../backend/src/modules/platform/platform.types.js';
import { isCanonicalNutritionDate, resolveDailyNutritionTargets, resolveNutritionConsultantNote } from '../../backend/src/modules/nutrition/nutrition.service.js';

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

test('legacy published plans without clinical notes still produce consultant guidance safely', () => {
  const content = {
    nutritionSnapshot: { personalisedPlanFocus: 'Focus on protein and hydration.' },
    dailyTargets: { calories: 1800, protein: 120, hydration: 2.5 },
    mealPlan: {},
  } as unknown as NutritionPlanContent;

  assert.equal(resolveNutritionConsultantNote(content), 'Focus on protein and hydration.');
  assert.doesNotThrow(() => resolveDailyNutritionTargets(content));
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
  const routes = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.routes.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../src/services/nutritionExperienceService.ts', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/screens/home/NutritionExperienceScreen.tsx', import.meta.url), 'utf8');

  assert.match(service, /selectedDate/);
  assert.match(service, /followedMeals: consumedApprovedMeals/);
  assert.match(service, /outOfPlanMeals, skippedMeals, pendingMeals/);
  assert.match(service, /plannedVsActual:/);
  assert.match(service, /mealStates/);
  assert.match(service, /adherence: \{ percent: adherencePercent, label: adherenceLabel \}/);
  assert.match(client, /nutrition-experience\?date=/);
  assert.match(screen, /selectedDate.*isoDay\(new Date\(\)\)/s);
  assert.match(screen, /getFullYear\(\)[\s\S]*getMonth\(\)[\s\S]*getDate\(\)/);
  assert.doesNotMatch(screen, /new Date\(data\.selectedDate\)(?!T00:00:00)/);
  assert.match(routes, /NUTRITION_MEAL_PLAN_SHAPE_INVALID/);
  assert.match(routes, /NUTRITION_EVENT_TIME_INVALID/);
});

test('Phase 2 views consume one backend projection without local nutrition heuristics', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/screens/home/NutritionExperienceScreen.tsx', import.meta.url), 'utf8');

  assert.match(service, /dailyNutrition:/);
  assert.match(service, /mealSummary:/);
  assert.match(service, /mealStates,/);
  assert.match(service, /plannedVsActual:/);
  assert.match(screen, /data\.plannedVsActual/);
  assert.match(screen, /data\.mealStates/);
  assert.match(screen, /data\.adherence\.label/);
  assert.doesNotMatch(screen, /percent >= 80/);
});

test('weekly pattern and Consultant monitoring reuse canonical backend intelligence', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');

  assert.match(service, /dailyAdherence = days\.map/);
  assert.match(service, /targetRangeDays:/);
  assert.match(service, /whatWorked, harderThisWeek, nextFocus, eatingPattern/);
  assert.match(service, /buildNutritionProjection\(monitoringOwner\)/);
  assert.match(service, /getClientNutritionPattern\(monitoringOwner\)/);
  assert.match(service, /nutritionMonitoring: dailyMonitoring \? \{ daily: dailyMonitoring, pattern: patternMonitoring \}/);
});

test('actual events stay scoped to the published plan version and preserve out-of-plan nutrition', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  assert.match(service, /payload\?\.planId === published\.plan\.id && payload\?\.versionId === published\.version\.id/);
  assert.match(service, /selectedOption\?\.approxKcal \?\? input\.calories \?\? null/);
  assert.match(service, /selectedOption\?\.proteinGrams \?\? input\.proteinGrams \?\? null/);
  assert.match(service, /buildNutritionProjection\(owner, 1, nutritionDateKey\(eventTimeISO\)\)/);
});
