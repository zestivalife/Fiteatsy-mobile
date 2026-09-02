import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  calculateRecipeNutrition,
  scaleNutrients,
} from '../../backend/src/modules/nutrition/catalogue/catalogue.nutrition.js';
import {
  NUTRITION_CATALOGUE_VERSION,
  type NutritionCatalogueManifest,
} from '../../backend/src/modules/nutrition/catalogue/catalogue.types.js';

const manifestPath = new URL('../../backend/src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.1.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as NutritionCatalogueManifest;
const requiredMealKeys = [
  'earlyMorning',
  'breakfast',
  'midMorningSnack',
  'lunch',
  'eveningSnack',
  'dinner',
  'bedtimeNutrition',
];

test('catalogue has the approved identity, source, licence, provenance and bounded scale', () => {
  assert.equal(manifest.catalogueVersion, NUTRITION_CATALOGUE_VERSION);
  assert.equal(manifest.source.name, 'USDA FoodData Central');
  assert.equal(manifest.source.license, 'CC0-1.0');
  assert.deepEqual(manifest.source.releases, [
    {
      dataType: 'Foundation Foods',
      release: '2026-04-30',
      downloadedFrom: 'https://fdc.nal.usda.gov/download-datasets/',
    },
    {
      dataType: 'SR Legacy',
      release: '2018-04',
      downloadedFrom: 'https://fdc.nal.usda.gov/download-datasets/',
    },
  ]);
  assert.ok(manifest.foods.length + manifest.recipes.length + manifest.mealVariants.length >= 300);
  assert.ok(manifest.foods.length + manifest.recipes.length + manifest.mealVariants.length <= 500);
  assert.equal(manifest.foods.length, 58);
  assert.equal(manifest.recipes.length, 64);
  assert.equal(manifest.mealVariants.length, 376);
  assert.ok(manifest.foods.every((food) => Number.isInteger(food.fdcId) && food.fdcId > 0));
  assert.equal(new Set(manifest.foods.map((food) => food.fdcId)).size, manifest.foods.length);
  assert.equal(new Set(manifest.foods.map((food) => food.id)).size, manifest.foods.length);
});

test('catalogue is Indian-first and covers every canonical meal head and dietary pattern', () => {
  assert.deepEqual([...new Set(manifest.mealVariants.map((variant) => variant.mealKey))].sort(), [...requiredMealKeys].sort());
  for (const mealKey of requiredMealKeys) {
    assert.ok(manifest.mealVariants.filter((variant) => variant.mealKey === mealKey).length >= 12, mealKey);
  }
  const cuisineTags = new Set(manifest.recipes.flatMap((recipe) => recipe.cuisineTags));
  for (const tag of ['indian', 'maharashtrian', 'north-indian', 'south-indian', 'gujarati', 'bengali']) {
    assert.ok(cuisineTags.has(tag), tag);
  }
  const dietaryTags = new Set(manifest.recipes.flatMap((recipe) => recipe.dietaryTags));
  for (const tag of ['vegan', 'vegetarian', 'eggetarian', 'non-vegetarian']) {
    assert.ok(dietaryTags.has(tag), tag);
  }
});

test('recipes and variants are deterministically derived from verified USDA ingredients', () => {
  const foods = new Map(manifest.foods.map((food) => [food.id, food]));
  const recipes = new Map(manifest.recipes.map((recipe) => [recipe.id, recipe]));
  for (const recipe of manifest.recipes) {
    assert.ok(recipe.components.length > 0, recipe.code);
    assert.ok(recipe.components.every((component) => foods.has(component.foodId)), recipe.code);
    assert.deepEqual(calculateRecipeNutrition(recipe.components, foods), recipe.nutritionTotals, recipe.code);
    assert.ok((recipe.nutritionTotals.calories ?? 0) > 0, recipe.code);
  }
  for (const variant of manifest.mealVariants) {
    const recipe = recipes.get(variant.recipeId);
    assert.ok(recipe, variant.name);
    assert.deepEqual(scaleNutrients(recipe.nutritionTotals, variant.portionMultiplier), variant.nutritionTotals, variant.name);
  }
  const signatures = manifest.mealVariants.map((variant) => `${variant.mealKey}:${variant.recipeId}:${variant.portionMultiplier}`);
  assert.equal(new Set(signatures).size, signatures.length);
});

test('unknown nutrients remain unknown instead of being fabricated as zero or partial totals', () => {
  const known = manifest.foods[0]!;
  const unknownFood = {
    ...known,
    id: '00000000-0000-4000-8000-000000000001',
    nutrients: { ...known.nutrients, vitaminB12Mcg: null },
  };
  const foods = new Map([[known.id, known], [unknownFood.id, unknownFood]]);
  const totals = calculateRecipeNutrition([
    { foodId: known.id, quantityGrams: 50 },
    { foodId: unknownFood.id, quantityGrams: 50 },
  ], foods);
  assert.equal(totals.vitaminB12Mcg, null);
  assert.notEqual(totals.vitaminB12Mcg, 0);
  assert.equal(scaleNutrients({ vitaminB12Mcg: null }, 2).vitaminB12Mcg, null);
});

test('every food retains macro and supported micronutrient keys without invented values', () => {
  const keys = [
    'calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams', 'fibreGrams',
    'ironMg', 'calciumMg', 'magnesiumMg', 'potassiumMg', 'zincMg', 'vitaminCMg',
    'vitaminB12Mcg', 'folateDfeMcg', 'vitaminDMcg', 'vitaminARaeMcg',
  ];
  for (const food of manifest.foods) {
    assert.deepEqual(Object.keys(food.nutrients), keys, food.canonicalName);
    assert.ok((food.nutrients.calories ?? 0) > 0, food.canonicalName);
    assert.ok(Object.values(food.nutrients).every((value) => value === null || (Number.isFinite(value) && value >= 0)));
  }
});
