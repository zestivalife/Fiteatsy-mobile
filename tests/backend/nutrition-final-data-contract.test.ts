import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NUTRITION_MEAL_ORDER, NUTRITION_MEAL_SEQUENCE, type NutritionPlanContent } from '../../backend/src/modules/platform/platform.types.js';
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

test('all backend nutrition projections use the canonical clinical meal sequence', () => {
  assert.deepEqual(NUTRITION_MEAL_SEQUENCE, ['earlyMorning', 'breakfast', 'midMorningSnack', 'lunch', 'eveningSnack', 'dinner', 'bedtimeNutrition']);
  assert.deepEqual(NUTRITION_MEAL_ORDER, { earlyMorning: 10, breakfast: 20, midMorningSnack: 30, lunch: 40, eveningSnack: 50, dinner: 60, bedtimeNutrition: 70 });
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

test('reviewed optional guidance is labelled truthfully and logs outside the plan', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/screens/home/NutritionExperienceScreen.tsx', import.meta.url), 'utf8');
  const eatingOutStart = service.indexOf('export const getNutritionEatingOutSuggestions');
  const eatingOutEnd = service.indexOf('export const getNutritionCravingSuggestions', eatingOutStart);
  const eatingOut = service.slice(eatingOutStart, eatingOutEnd);

  assert.match(eatingOut, /experience\.version\.content\.optionalGuidance/);
  assert.match(eatingOut, /guidance\.eatingOut\[cuisineKey\]/);
  assert.doesNotMatch(eatingOut, /listMealLibrarySlotsForTarget/);
  assert.match(screen, /Reviewed guidance/);
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

test('client contextual recommendation flows consume only versioned reviewed pools', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const eatingOutStart = service.indexOf('export const getNutritionEatingOutSuggestions');
  const cravingStart = service.indexOf('export const getNutritionCravingSuggestions', eatingOutStart);
  const eatingOut = service.slice(eatingOutStart, cravingStart);
  const craving = service.slice(cravingStart);

  assert.match(eatingOut, /optionalGuidance/);
  assert.match(eatingOut, /guidance\.eatingOut\[cuisineKey\]/);
  assert.match(craving, /guidance\.cravings\[cravingKey\]/);
  assert.doesNotMatch(eatingOut, /listMealLibrarySlotsForTarget/);
  assert.doesNotMatch(craving, /listMealLibrarySlotsForTarget/);
  assert.match(service, /item\.enabled && item\.clinicallyReviewed/);
  assert.match(service, /guidanceStatus: 'available' \| 'preparing'/);
});

test('optional guidance is governed by the complete Diet Plan version lifecycle', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const routes = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.routes.ts', import.meta.url), 'utf8');
  const types = readFileSync(new URL('../../backend/src/modules/platform/platform.types.ts', import.meta.url), 'utf8');

  assert.match(types, /optionalGuidance\?: OptionalNutritionGuidance/);
  assert.match(service, /assertOptionalGuidanceComplete\(version\.content\)/);
  assert.match(service, /assertOptionalGuidanceComplete\(approvedVersion\.content, true\)/);
  assert.match(service, /clinicallyReviewed: true/);
  assert.match(routes, /optional-guidance\/generate/);
  assert.match(service, /listMealLibrarySlotsForTarget/);
  assert.match(service, /OPTIONAL_GUIDANCE_INCOMPLETE/);
  assert.match(service, /OPTIONAL_GUIDANCE_UNRESOLVED/);
});

test('optional guidance completeness is enforced only at review lifecycle boundaries', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  const saveStart = service.indexOf('export const updateConsultantDietPlanDraft');
  const saveEnd = service.indexOf('const guidanceNutritionComplete', saveStart);
  const generateStart = service.indexOf('export const generateConsultantOptionalGuidance');
  const searchStart = service.indexOf('export const searchConsultantOptionalGuidanceCandidates', generateStart);
  const submitStart = service.indexOf('export const submitConsultantDietPlanForReview', searchStart);
  const changesStart = service.indexOf('export const requestConsultantDietPlanChanges', submitStart);
  const approveStart = service.indexOf('export const approveConsultantDietPlan');
  const publishStart = service.indexOf('export const publishConsultantDietPlan');

  assert.doesNotMatch(service.slice(saveStart, saveEnd), /assertOptionalGuidanceComplete/);
  assert.doesNotMatch(service.slice(generateStart, searchStart), /assertOptionalGuidanceComplete/);
  assert.match(service.slice(generateStart, searchStart), /includeOutsideTarget: true/);
  assert.match(service.slice(submitStart, changesStart), /assertOptionalGuidanceComplete\(version\.content\)/);
  assert.match(service.slice(approveStart, publishStart), /assertOptionalGuidanceComplete\(currentVersion\.content\)/);
  assert.match(service.slice(publishStart), /assertOptionalGuidanceComplete\(approvedVersion\.content, true\)/);
  assert.match(service, /Complete Optional Guidance before submitting:/);
  assert.match(service, /countIssues\.join\('\\n- '\)/);
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
