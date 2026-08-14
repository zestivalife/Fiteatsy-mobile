import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecommendationSets,
  calculateMealComponentNutrition,
  calculateMealNutritionTotals,
  classifyMealMatch,
  deriveMealTargets,
  mealVariantToSlot,
  resolvePortionMasterQuantity,
  scaleNutritionVector,
  type FoodMasterRecord,
  type MealVariantRecord,
  type PortionMasterRecord,
} from '../../backend/src/modules/nutrition/meal-engine.js';

const paneer: FoodMasterRecord = {
  id: 'food_paneer',
  canonicalName: 'paneer_cooked',
  displayName: 'Paneer',
  referenceQuantity: 100,
  referenceUnit: 'g',
  calories: 265,
  proteinGrams: 18,
  carbsGrams: 3,
  fatGrams: 20,
  fibreGrams: 0,
  verificationStatus: 'verified',
};

test('scaleNutritionVector scales deterministic nutrition by reference quantity', () => {
  const result = scaleNutritionVector(
    {
      calories: 265,
      proteinGrams: 18,
      carbsGrams: 3,
      fatGrams: 20,
      fibreGrams: 0,
    },
    150,
    100,
  );

  assert.equal(result.calories, 397.5);
  assert.equal(result.proteinGrams, 27);
  assert.equal(result.carbsGrams, 4.5);
  assert.equal(result.fatGrams, 30);
});

test('calculateMealComponentNutrition and calculateMealNutritionTotals aggregate structured meal components', () => {
  const paneerComponent = calculateMealComponentNutrition(paneer, 150, 150);
  const curdComponent = {
    componentName: 'Curd',
    quantity: 100,
    quantityUnit: 'g',
    canonicalGrams: 100,
    calories: 61,
    proteinGrams: 3.5,
    carbsGrams: 4.7,
    fatGrams: 3.3,
    fibreGrams: 0,
  };

  const totals = calculateMealNutritionTotals([paneerComponent, curdComponent]);
  assert.equal(totals.calories, 458.5);
  assert.equal(totals.proteinGrams, 30.5);
  assert.equal(totals.carbsGrams, 9.2);
});

test('deriveMealTargets returns meal-wise target bands from daily calories and protein', () => {
  const targets = deriveMealTargets({
    caloriesTarget: 2000,
    proteinTargetGrams: 100,
  });

  assert.equal(targets.lunch.calories, 520);
  assert.equal(targets.lunch.proteinGrams, 26);
  assert.equal(targets.lunch.caloriesBand.min, 468);
  assert.equal(targets.lunch.caloriesBand.max, 572);
});

test('resolvePortionMasterQuantity converts supported household units using stored canonical mapping only', () => {
  const rotiPortion: PortionMasterRecord = {
    id: 'portion_roti_medium',
    foodId: 'food_roti',
    label: 'medium roti',
    quantity: 1,
    unit: 'piece',
    canonicalGrams: 35,
  };

  assert.equal(resolvePortionMasterQuantity(rotiPortion, 2), 70);
  assert.equal(resolvePortionMasterQuantity(null, 2), null);
  assert.equal(resolvePortionMasterQuantity({ ...rotiPortion, canonicalGrams: null }, 2), null);
});

test('classifyMealMatch ranks meal options inside nutrition target bands', () => {
  const target = deriveMealTargets({ caloriesTarget: 2000, proteinTargetGrams: 100 }).lunch;
  assert.equal(classifyMealMatch(target, { calories: 522, proteinGrams: 25.5 }), 'best_match');
  assert.equal(classifyMealMatch(target, { calories: 560, proteinGrams: 24 }), 'good_match');
  assert.equal(classifyMealMatch(target, { calories: 620, proteinGrams: 18 }), 'outside_target');
});

test('mealVariantToSlot and buildRecommendationSets expose structured consultant option metadata', () => {
  const target = deriveMealTargets({ caloriesTarget: 2000, proteinTargetGrams: 100 }).lunch;
  const variant: MealVariantRecord = {
    id: 'variant_1',
    mealKey: 'lunch',
    name: 'Paneer + millet lunch',
    sourceType: 'consultant_custom',
    cuisineTags: ['north-indian'],
    dietaryTags: ['vegetarian'],
    components: [
      {
        componentName: 'Paneer',
        quantity: 150,
        quantityUnit: 'g',
        householdLabel: '1 bowl paneer',
        canonicalGrams: 150,
        calories: 397.5,
        proteinGrams: 27,
      },
      {
        componentName: 'Millet roti',
        quantity: 70,
        quantityUnit: 'g',
        householdLabel: '2 rotis',
        canonicalGrams: 70,
        calories: 112,
        proteinGrams: 3.6,
      },
    ],
  };

  const slot = mealVariantToSlot(variant, target, 1);
  assert.equal(slot.id, 'variant_1');
  assert.equal(slot.sourceType, 'consultant_custom');
  assert.equal(slot.matchClassification, 'good_match');

  const sets = buildRecommendationSets([slot]);
  assert.ok(sets.some((item) => item.key === 'good_match'));
  assert.ok(sets.some((item) => item.key === 'high_protein'));
  assert.ok(sets.some((item) => item.key === 'consultant_library'));
});

test('buildRecommendationSets remains truthful when no eligible meal options exist', () => {
  assert.deepEqual(buildRecommendationSets([]), []);
});
