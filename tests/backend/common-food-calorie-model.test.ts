import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyPlanCalorieModel, optionCalorieStatus } from '../../backend/src/modules/nutrition/common-food-calorie-model.js';
import { MEAL_HEADS, type MealHead, type MealTarget } from '../../backend/src/modules/nutrition/common-food-engine.js';

const targets = Object.fromEntries(MEAL_HEADS.map((head, index) => [head, { kcal: [150, 350, 150, 550, 200, 500, 100][index], protein: 0, kcalTolerance: 25, proteinTolerance: 5 }])) as Record<MealHead, MealTarget>;
const options = MEAL_HEADS.flatMap((mealHead, mealIndex) => Array.from({ length: 5 }, (_, optionIndex) => ({ combinationId: `${mealHead}-${optionIndex}`, mealHead, nutrition: { kcal: [140, 330, 140, 530, 190, 480, 90][mealIndex] + optionIndex * [5, 10, 5, 10, 5, 10, 5][mealIndex] } })));

test('35 alternatives produce seven-meal extrema, never an additive 35-option total', () => {
  const model = dailyPlanCalorieModel({ dailyTargetKcal: 2000, mealTargets: targets, options });
  assert.equal(options.reduce((sum, option) => sum + option.nutrition.kcal, 0), 10000);
  assert.equal(model.minimumDailyKcal, 1900);
  assert.equal(model.maximumDailyKcal, 2100);
  assert.notEqual(model.maximumDailyKcal, 10000);
  assert.equal(model.allocationTotalKcal, 2000);
  assert.equal(model.allocationMatchesDailyTarget, true);
});

test('each option is compared with its governed meal allocation and excess remains advisory', () => {
  assert.deepEqual(optionCalorieStatus('LUNCH', 550, 610), { mealHead: 'LUNCH', mealTargetKcal: 550, optionKcal: 610, differenceKcal: 60, status: 'ABOVE_TARGET', advisory: '60 kcal above the suggested lunch allocation.' });
});

test('2000 target and 2185 maximum returns the exact advisory', () => {
  const adjusted = options.map(option => option.combinationId === 'BEDTIME-4' ? { ...option, nutrition: { kcal: 195 } } : option);
  const model = dailyPlanCalorieModel({ dailyTargetKcal: 2000, mealTargets: targets, options: adjusted });
  assert.equal(model.maximumDailyKcal, 2185);
  assert.equal(model.rangeAdvisory, 'Some meal combinations may exceed the daily target. Maximum planned combination is 185 kcal above target.');
});

test('exact selected day requires one authoritative option for every required meal', () => {
  const ids = MEAL_HEADS.map(head => `${head}-0`);
  const complete = dailyPlanCalorieModel({ dailyTargetKcal: 1800, mealTargets: targets, options, authoritativeOptionIds: ids });
  assert.equal(complete.selectedDailyKcal, 1900);
  assert.equal(complete.selectedDailyAdvisory, 'Daily calorie target exceeded by 100 kcal.');
  assert.equal(dailyPlanCalorieModel({ dailyTargetKcal: 2000, mealTargets: targets, options, authoritativeOptionIds: ids.slice(0, 6) }).selectedDailyKcal, null);
  assert.equal(dailyPlanCalorieModel({ dailyTargetKcal: 2000, mealTargets: targets, options, authoritativeOptionIds: [...ids, ids[0]] }).selectedDailyKcal, null);
});

test('a quantity-driven option calorie change immediately changes the affected extrema', () => {
  const before = dailyPlanCalorieModel({ dailyTargetKcal: 2000, mealTargets: targets, options });
  const changed = options.map(option => option.combinationId === 'LUNCH-4' ? { ...option, nutrition: { kcal: option.nutrition.kcal * 1.5 } } : option);
  const after = dailyPlanCalorieModel({ dailyTargetKcal: 2000, mealTargets: targets, options: changed });
  assert.equal(before.maximumDailyKcal, 2100);
  assert.equal(after.maximumDailyKcal, 2385);
});
