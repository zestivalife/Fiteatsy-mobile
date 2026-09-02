import test from 'node:test';
import assert from 'node:assert/strict';
import { NUTRITION_MEAL_SEQUENCE, type NutritionMealSlot, type NutritionPlanContent } from '../../backend/src/modules/platform/platform.types.js';
import {
  CALORIE_MACRO_ALLOCATION_METHODOLOGY_VERSION,
  analyseAllCalorieCombinations,
  deriveVersionedMealTargets,
  optimiseMealOptionPortion,
  optionFitsMealTarget,
  validateAllocatedDiet,
} from '../../backend/src/modules/nutrition/calorie-macro-allocation.js';

const daily = { calories: 2100, proteinGrams: 115, carbsGrams: 236, fatGrams: 70, fibreGrams: null };
const targets = deriveVersionedMealTargets(daily);

const option = (id: string, calories: number, protein: number, carbs: number, fat: number): NutritionMealSlot => ({
  id, slot: 1, meal: id, portion: '1 bowl', prepNote: 'Synthetic governed fixture', approxKcal: calories,
  proteinGrams: protein, carbsGrams: carbs, fatGrams: fat, fibreGrams: null, sourceType: 'verified_library',
  components: [{ foodId: `food-${id}`, componentName: id, quantity: 1, quantityUnit: 'bowl', canonicalGrams: 200, calories, proteinGrams: protein, carbsGrams: carbs, fatGrams: fat, fibreGrams: null }],
});

const content = (): NutritionPlanContent => ({
  nutritionSnapshot: { client: 'Synthetic', age: 30, gender: null, goals: [], healthConditions: [], dietPreference: null, allergies: [], lifestyleSummary: '', personalisedPlanFocus: '', programmeName: '', preparedBy: '' },
  dailyTargets: { calories: daily.calories, protein: daily.proteinGrams, carbohydrates: daily.carbsGrams, fat: daily.fatGrams, fibre: null, hydration: null, movement: '' },
  allocationSnapshot: {
    methodologyVersion: CALORIE_MACRO_ALLOCATION_METHODOLOGY_VERSION, generatedAtISO: '2026-09-02T00:00:00.000Z',
    targetSources: { calories: 'test', protein: 'test', carbohydrates: 'test', fat: 'test', fibre: null },
    tolerances: { mealCaloriesFraction: .1, dailyCaloriesFraction: .1, proteinFraction: .2, carbohydratesFraction: .2, fatFraction: .2, fibreFraction: .25 },
  },
  mealPlan: Object.fromEntries(NUTRITION_MEAL_SEQUENCE.map((key) => [key, {
    window: '', focus: key, target: targets[key], options: [0.96, 0.98, 1, 1.02, 1.04].map((factor, index) => option(
      `${key}-${index + 1}`, Math.round(targets[key].calories! * factor), Number((targets[key].proteinGrams! * factor).toFixed(1)),
      Number((targets[key].carbsGrams! * factor).toFixed(1)), Number((targets[key].fatGrams! * factor).toFixed(1)),
    )),
  }])) as NutritionPlanContent['mealPlan'],
  hydrationRhythm: [], weeklySuccessGuide: [], smartSubstitutions: [], supplementsAndClinicalNotes: [],
});

test('2100 kcal / 115 g prescription reconciles deterministically across seven meals', () => {
  assert.deepEqual(NUTRITION_MEAL_SEQUENCE.map((key) => targets[key].calories), [168, 462, 210, 546, 210, 378, 126]);
  assert.equal(NUTRITION_MEAL_SEQUENCE.reduce((sum, key) => sum + targets[key].calories!, 0), 2100);
  assert.equal(Number(NUTRITION_MEAL_SEQUENCE.reduce((sum, key) => sum + targets[key].proteinGrams!, 0).toFixed(1)), 115);
  assert.equal(targets.lunch.methodologyVersion, CALORIE_MACRO_ALLOCATION_METHODOLOGY_VERSION);
});

test('target model supports calories-only, calories plus protein, and full macros without fabrication', () => {
  const caloriesOnly = deriveVersionedMealTargets({ calories: 1800 });
  assert.equal(caloriesOnly.lunch.proteinGrams, null);
  assert.equal(caloriesOnly.lunch.carbsGrams, null);
  const proteinOnly = deriveVersionedMealTargets({ calories: 1800, proteinGrams: 90 });
  assert.equal(proteinOnly.lunch.proteinGrams, 23.4);
  assert.equal(proteinOnly.lunch.fatGrams, null);
  assert.equal(targets.lunch.carbsGrams, 61.4);
});

test('realistic portion optimiser uses configured serving increments and rejects infeasible candidates', () => {
  const lunch = deriveVersionedMealTargets({ calories: 2000 }).lunch;
  const adjusted = optimiseMealOptionPortion(option('adjustable', 350, 10, 20, 8), lunch);
  assert.equal(adjusted?.portion, '1.5 × (1 bowl)');
  assert.equal(adjusted?.approxKcal, 525);
  assert.equal(optimiseMealOptionPortion(option('too-low', 40, 1, 1, 1), lunch), null);
});

test('all 78,125 one-option-per-meal combinations remain in the governed calorie envelope', () => {
  const plan = content();
  const result = analyseAllCalorieCombinations(plan);
  assert.deepEqual({ count: result.count, outside: result.outside }, { count: 78125, outside: 0 });
  assert.equal(validateAllocatedDiet(plan).valid, true);
});

test('manual outlier and duplicate recipe family block review validation', () => {
  const outlier = content();
  outlier.mealPlan.lunch.options[0].approxKcal = 250;
  assert.equal(optionFitsMealTarget(outlier.mealPlan.lunch.options[0], targets.lunch), false);
  assert.equal(validateAllocatedDiet(outlier).code, 'DIET_NUTRITION_ENVELOPE_INVALID');
  const duplicate = content();
  duplicate.mealPlan.breakfast.options[1].id = duplicate.mealPlan.breakfast.options[0].id;
  duplicate.mealPlan.breakfast.options[1].components = duplicate.mealPlan.breakfast.options[0].components;
  assert.match(validateAllocatedDiet(duplicate).failures.join(' '), /duplicate canonical recipe/);
});

test('legacy plans without allocation metadata remain backwards compatible', () => {
  const legacy = content();
  delete legacy.allocationSnapshot;
  legacy.mealPlan.lunch.options[0].approxKcal = 1;
  assert.equal(validateAllocatedDiet(legacy).valid, true);
});
