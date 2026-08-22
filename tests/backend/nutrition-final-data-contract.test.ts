import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { NutritionPlanContent } from '../../backend/src/modules/platform/platform.types.js';
import { assertCurrentNutritionBusinessDate, classifyEatingOutRecommendation, isCanonicalNutritionDate, isFutureNutritionDate, nutritionDateKey, resolveDailyNutritionTargets, scoreNutritionRecommendation } from '../../backend/src/modules/nutrition/nutrition.service.js';

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

test('client-local today is not rejected during the positive timezone UTC boundary', () => {
  const beforeUtcMidnight = new Date('2026-08-21T19:26:00.000Z');
  assert.equal(isFutureNutritionDate('2026-08-22', beforeUtcMidnight), false);
  assert.equal(isFutureNutritionDate('2026-08-23', beforeUtcMidnight), true);
});

test('Nutrition business date rolls over exactly at midnight Asia/Kolkata', () => {
  assert.equal(nutritionDateKey(new Date('2026-08-21T18:29:59.999Z')), '2026-08-21');
  assert.equal(nutritionDateKey(new Date('2026-08-21T18:30:00.000Z')), '2026-08-22');
  assert.equal(nutritionDateKey(new Date('2026-08-21T18:31:00.000Z')), '2026-08-22');
  assert.equal(nutritionDateKey(new Date('2026-08-21T19:45:00.000Z')), '2026-08-22');
  assert.equal(nutritionDateKey(new Date('2026-08-21T23:59:00.000Z')), '2026-08-22');
});

test('Nutrition writes accept only the current Asia/Kolkata business date', () => {
  const serverNow = new Date('2026-08-22T05:00:00.000Z'); // 10:30 IST
  const allowed = [
    '2026-08-22T00:00:00+05:30',
    '2026-08-22T10:30:00+05:30',
    '2026-08-22T23:59:59+05:30',
    '2026-08-21T18:30:00.000Z', // midnight IST expressed in UTC
  ];
  for (const timestamp of allowed) {
    assert.doesNotThrow(() => assertCurrentNutritionBusinessDate(timestamp, serverNow));
  }

  for (const timestamp of ['2026-08-21T23:59:59+05:30', '2026-08-23T00:00:00+05:30']) {
    assert.throws(
      () => assertCurrentNutritionBusinessDate(timestamp, serverNow),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'NUTRITION_DATE_NOT_CURRENT');
        assert.equal((error as { statusCode?: number }).statusCode, 400);
        assert.equal((error as Error).message, 'Nutrition entries can only be logged for the current day.');
        return true;
      },
    );
  }
});

test('all client Nutrition event writers use the canonical current-day guard', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const writerNames = ['logNutritionMealConsumption', 'logClientNutritionEvent', 'logClientNutritionWater'];

  for (let index = 0; index < writerNames.length; index += 1) {
    const start = service.indexOf(`export const ${writerNames[index]}`);
    const next = index + 1 < writerNames.length
      ? service.indexOf(`export const ${writerNames[index + 1]}`, start)
      : service.indexOf('const buildRecipeContext', start);
    assert.notEqual(start, -1, `${writerNames[index]} must exist`);
    assert.match(service.slice(start, next), /assertCurrentNutritionBusinessDate\((?:consumedAtISO|eventTimeISO)\)/);
  }
});

test('Eating Out approval requires stable membership in the active published meal options', () => {
  const activePublishedOptionIds = new Set(['current-option']);
  assert.equal(classifyEatingOutRecommendation('current-option', activePublishedOptionIds), 'approved');
  assert.equal(classifyEatingOutRecommendation('old-version-option', activePublishedOptionIds), 'general');
  assert.equal(classifyEatingOutRecommendation('draft-option', activePublishedOptionIds), 'general');
  assert.equal(classifyEatingOutRecommendation('other-client-option', activePublishedOptionIds), 'general');
  assert.equal(classifyEatingOutRecommendation(undefined, activePublishedOptionIds), 'general');
});

test('Eating Out general guidance is labelled truthfully and logs outside the plan', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/screens/home/NutritionExperienceScreen.tsx', import.meta.url), 'utf8');
  const eatingOutStart = service.indexOf('export const getNutritionEatingOutSuggestions');
  const eatingOutEnd = service.indexOf('export const getNutritionCravingSuggestions', eatingOutStart);
  const eatingOut = service.slice(eatingOutStart, eatingOutEnd);

  assert.match(eatingOut, /activePublishedOptionIds/);
  assert.match(eatingOut, /classifyEatingOutRecommendation\(option\.id, activePublishedOptionIds\)/);
  assert.match(screen, /mode === 'eating-out' \? 'General guidance' : 'Outside plan'/);
  assert.match(screen, /state: isApproved \? 'CONSUMED_APPROVED' : 'CONSUMED_OUT_OF_PLAN'/);
  assert.match(service, /outOfPlanMeals = meals\.filter\(\(meal\) => meal\.state === 'CONSUMED_OUT_OF_PLAN'\)/);
  assert.match(service, /nutritionMonitoring: dailyMonitoring/);
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
  assert.match(screen, /selectedDate.*nutritionDate\(\)/s);
  assert.match(screen, /subscribeToNutritionDay/);
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
  assert.match(service, /nutritionDate: nutritionDateKey\(eventTimeISO\)/);
});

test('Home and Consultant consume the same date-scoped backend projection', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../src/screens/home/HomeScreen.tsx', import.meta.url), 'utf8');
  const dateUtility = readFileSync(new URL('../../src/utils/nutritionDate.ts', import.meta.url), 'utf8');

  assert.match(service, /nutritionScore,/);
  assert.match(service, /nutritionMonitoring: dailyMonitoring/);
  assert.match(home, /getNutritionExperience\(nutritionDate\(\)\)/);
  assert.match(home, /dailyNutrition\?\.nutritionScore/);
  assert.match(dateUtility, /Asia\/Kolkata/);
  assert.match(dateUtility, /AppState\.addEventListener/);
});

test('recommendation score reacts to remaining macro context', () => {
  const highProtein = { approxKcal: 300, proteinGrams: 30, carbsGrams: 25, fatGrams: 5, fibreGrams: 6 };
  const lowProtein = { approxKcal: 300, proteinGrams: 5, carbsGrams: 25, fatGrams: 5, fibreGrams: 2 };
  const highFat = { approxKcal: 300, proteinGrams: 30, carbsGrams: 25, fatGrams: 30, fibreGrams: 6 };
  const remaining = { calories: 300, protein: 30, carbs: 25, fat: 8, fibre: 6 };

  assert.ok(scoreNutritionRecommendation(highProtein as never, remaining) > scoreNutritionRecommendation(lowProtein as never, remaining));
  assert.ok(scoreNutritionRecommendation(highProtein as never, remaining) > scoreNutritionRecommendation(highFat as never, remaining));
});

test('contextual recommendation flows use distinct verified pools and no generic craving fallback', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.library.store.ts', import.meta.url), 'utf8');
  const eatingOutStart = service.indexOf('export const getNutritionEatingOutSuggestions');
  const cravingStart = service.indexOf('export const getNutritionCravingSuggestions', eatingOutStart);
  const eatingOut = service.slice(eatingOutStart, cravingStart);
  const craving = service.slice(cravingStart);

  assert.match(store, /\(\$1 = '' or meal_key = \$1\)/);
  assert.match(eatingOut, /filterByTextMatch\(option, \[requestedCuisine\]\)/);
  assert.match(eatingOut, /preferredCuisines: requestedCuisine === 'general' \? \[\] : \[requestedCuisine\]/);
  assert.match(eatingOut, /mealKey: ''/);
  assert.match(craving, /mealKey: ''/);
  assert.match(craving, /filterByTextMatch\(option, cravings\)/);
  assert.doesNotMatch(craving, /slice\(0,\s*8\)/);
});

test('quick actions are independent and selection changes bypass stale React state', () => {
  const screen = readFileSync(new URL('../../src/screens/home/NutritionExperienceScreen.tsx', import.meta.url), 'utf8');
  const quickStart = screen.indexOf('const QuickActions');
  const balanceStart = screen.indexOf('const Balance', quickStart);
  const balanceEnd = screen.indexOf('const RecommendationModal', balanceStart);

  assert.ok(quickStart > -1 && balanceStart > quickStart);
  assert.match(screen.slice(quickStart, balanceStart), /What can I eat now\?/);
  assert.match(screen.slice(quickStart, balanceStart), /Eating Out/);
  assert.match(screen.slice(quickStart, balanceStart), /Craving something\?/);
  assert.doesNotMatch(screen.slice(balanceStart, balanceEnd), /Eating Out|Craving/);
  assert.match(screen, /loadRecommendations\('eating-out',[\s\S]*\{ cuisine \}\)/);
  assert.match(screen, /loadRecommendations\('craving',[\s\S]*\{ craving: type \}\)/);
  assert.match(screen, /nutritionRationale/);
  assert.match(screen, /rankingScore/);
  assert.match(readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8'), /currentISTMinutes/);
});
