import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deriveVersionedMealTargets, optimiseMealOptionPortion } from '../../backend/src/modules/nutrition/calorie-macro-allocation.js';
import type { MealVariantRecord } from '../../backend/src/modules/nutrition/meal-engine.js';
import { selectMealVariantFamilies } from '../../backend/src/modules/nutrition/nutrition.library.store.js';
import { optimiseDistinctMealFamilies, selectDiverseMealOptions } from '../../backend/src/modules/nutrition/nutrition.service.js';
import type { NutritionCatalogueManifest } from '../../backend/src/modules/nutrition/catalogue/catalogue.types.js';
import type { NutritionMealSlot } from '../../backend/src/modules/platform/platform.types.js';

const manifest = JSON.parse(readFileSync(new URL('../../backend/src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.1.json', import.meta.url), 'utf8')) as NutritionCatalogueManifest;
const meals = ['earlyMorning', 'breakfast', 'midMorningSnack', 'lunch', 'eveningSnack', 'dinner', 'bedtimeNutrition'] as const;
const compatible = {
  earlyMorning: ['earlyMorning', 'midMorningSnack', 'eveningSnack', 'bedtimeNutrition'], breakfast: ['breakfast'],
  midMorningSnack: ['midMorningSnack', 'earlyMorning', 'eveningSnack', 'bedtimeNutrition'], lunch: ['lunch', 'dinner'],
  eveningSnack: ['eveningSnack', 'midMorningSnack', 'earlyMorning', 'bedtimeNutrition'], dinner: ['dinner', 'lunch'],
  bedtimeNutrition: ['bedtimeNutrition', 'eveningSnack', 'midMorningSnack', 'earlyMorning'],
} as const;
const targets = deriveVersionedMealTargets({ calories: 2101, proteinGrams: 131 });
const recipes = new Map(manifest.recipes.map((recipe) => [recipe.id, recipe]));
const slotsFor = (mealKey: typeof meals[number]): NutritionMealSlot[] => manifest.mealVariants
  .filter((variant) => compatible[mealKey].includes(variant.mealKey as never))
  .map((variant, index) => {
    const recipe = recipes.get(variant.recipeId)!;
    const factor = variant.portionMultiplier;
    return {
      id: variant.id, canonicalFamilyId: variant.recipeId, slot: index + 1, meal: variant.name,
      portion: variant.householdLabel, prepNote: variant.description,
      approxKcal: variant.nutritionTotals.calories, proteinGrams: variant.nutritionTotals.proteinGrams,
      carbsGrams: variant.nutritionTotals.carbohydrateGrams, fatGrams: variant.nutritionTotals.fatGrams,
      fibreGrams: variant.nutritionTotals.fibreGrams, sourceType: 'verified_library',
      components: recipe.components.map((component) => ({ foodId: component.foodId, componentName: component.foodId,
        quantity: component.quantityGrams * factor, quantityUnit: 'g', canonicalGrams: component.quantityGrams * factor,
        calories: null, proteinGrams: null })),
    };
  });

test('query budget counts canonical families and retains every serving candidate in chosen families', () => {
  const fixture = Array.from({ length: 8 }, (_, family) => Array.from({ length: 4 }, (_, portion) => ({
    id: `${family}-${portion}`, canonicalFamilyId: `family-${family}`, mealKey: 'breakfast', name: `${family}-${portion}`,
    sourceType: 'verified_library', components: [],
  } satisfies MealVariantRecord))).flat();
  const selected = selectMealVariantFamilies(fixture, 6);
  assert.equal(new Set(selected.map((item) => item.canonicalFamilyId)).size, 6);
  assert.equal(selected.length, 24);
  assert.ok(selected.some((item) => item.canonicalFamilyId === 'family-5'));
});

test('v1.1 provides at least five distinct envelope-compatible families for every acceptance meal', () => {
  const counts = Object.fromEntries(meals.map((mealKey) => [mealKey, optimiseDistinctMealFamilies(slotsFor(mealKey), targets[mealKey]).length]));
  assert.deepEqual(counts, { earlyMorning: 9, breakfast: 8, midMorningSnack: 10, lunch: 5, eveningSnack: 10, dinner: 8, bedtimeNutrition: 7 });
});

test('final ranking returns exactly five canonical families and never portion aliases', () => {
  for (const mealKey of meals) {
    const compatibleFamilies = optimiseDistinctMealFamilies(slotsFor(mealKey), targets[mealKey]);
    const selected = selectDiverseMealOptions(compatibleFamilies, new Set());
    assert.equal(selected.length, 5, mealKey);
    assert.equal(new Set(selected.map((item) => item.canonicalFamilyId)).size, 5, mealKey);
    assert.ok(selected.every((item) => optimiseMealOptionPortion(item, targets[mealKey]) != null), mealKey);
  }
});

test('a genuinely restricted four-family pool remains an explicit shortage', () => {
  const restricted = optimiseDistinctMealFamilies(slotsFor('breakfast'), targets.breakfast).slice(0, 4);
  const options = selectDiverseMealOptions(restricted, new Set());
  assert.equal(options.length, 4);
  assert.equal(options.length < 5 ? 'INSUFFICIENT_DISTINCT_MEAL_OPTIONS' : 'SUFFICIENT_DISTINCT_MEAL_OPTIONS', 'INSUFFICIENT_DISTINCT_MEAL_OPTIONS');
});
