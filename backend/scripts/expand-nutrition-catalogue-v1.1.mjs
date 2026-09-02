import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const VERSION = 'FITEATSY-NUTRITION-CATALOGUE-v1.1';
const GENERATED_AT = '2026-09-02T00:00:00.000Z';
const uuid = (scope, value) => {
  const hex = createHash('sha256').update(`${VERSION}:${scope}:${value}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
};

const additions = [
  { code: 'papaya-greek-yoghurt-flax-bowl', name: 'Papaya Greek yoghurt flax bowl', cuisine: 'indian',
    meals: ['earlyMorning', 'breakfast', 'midMorningSnack', 'eveningSnack'], components: [['papaya', 120], ['greek-yogurt', 90], ['flaxseed-ground', 5]] },
  { code: 'moong-buttermilk-cup', name: 'Savoury moong buttermilk cup', cuisine: 'maharashtrian',
    meals: ['earlyMorning', 'breakfast', 'midMorningSnack', 'eveningSnack'], components: [['mung-sprouts-cooked', 120], ['buttermilk', 200], ['cucumber', 60], ['flaxseed-ground', 5], ['cumin', 1]] },
  { code: 'banana-greek-yoghurt-lassi', name: 'Banana Greek yoghurt lassi', cuisine: 'north_indian',
    meals: ['earlyMorning', 'breakfast', 'midMorningSnack', 'eveningSnack', 'bedtimeNutrition'], components: [['banana', 70], ['greek-yogurt', 80], ['whole-milk', 80]] },
  { code: 'pineapple-tofu-chaat', name: 'Pineapple tofu chaat', cuisine: 'indian',
    meals: ['breakfast', 'midMorningSnack', 'eveningSnack'], components: [['tofu-firm', 80], ['pineapple', 100], ['cucumber', 50], ['peanuts', 5]] },
  { code: 'date-yoghurt-milk-cup', name: 'Date yoghurt milk cup', cuisine: 'indian',
    meals: ['earlyMorning', 'breakfast', 'midMorningSnack', 'eveningSnack', 'bedtimeNutrition'], components: [['whole-milk', 150], ['greek-yogurt', 50], ['dates', 10]] },
  { code: 'milk-oat-almond-drink', name: 'Milk oat almond drink', cuisine: 'indian',
    meals: ['earlyMorning', 'breakfast', 'midMorningSnack', 'eveningSnack', 'bedtimeNutrition'], components: [['whole-milk', 180], ['oats', 10], ['almonds-roasted', 5]] },
  { code: 'yoghurt-oats-flax-cup', name: 'Yoghurt oats flax cup', cuisine: 'indian',
    meals: ['breakfast', 'midMorningSnack', 'eveningSnack', 'bedtimeNutrition'], components: [['plain-yogurt', 120], ['oats', 15], ['flaxseed-ground', 4]] },
  { code: 'tofu-millet-vegetable-cup', name: 'Tofu millet vegetable cup', cuisine: 'gujarati',
    meals: ['earlyMorning', 'breakfast', 'midMorningSnack', 'eveningSnack'], components: [['tofu-firm', 80], ['millet', 15], ['cucumber', 60], ['roma-tomato', 40]] },
  { code: 'lentil-tofu-spinach-broth', name: 'Lentil tofu spinach broth', cuisine: 'south_indian',
    meals: ['earlyMorning', 'breakfast', 'midMorningSnack', 'eveningSnack', 'bedtimeNutrition'], components: [['lentils-dry', 20], ['tofu-firm', 30], ['spinach', 60], ['roma-tomato', 50], ['canola-oil', 3]] },
];

const nutrientKeys = ['calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams', 'fibreGrams', 'ironMg', 'calciumMg', 'magnesiumMg', 'potassiumMg', 'zincMg', 'vitaminCMg', 'vitaminB12Mcg', 'folateDfeMcg', 'vitaminDMcg', 'vitaminARaeMcg'];
const calculate = (components, foodsBySlug) => Object.fromEntries(nutrientKeys.map((key) => {
  const values = components.map(([slug, grams]) => [foodsBySlug.get(slug)?.nutrients[key], grams]);
  if (values.some(([value]) => value == null || !Number.isFinite(value))) return [key, null];
  let total = 0;
  for (const [value, grams] of values) total += value * (grams / 100);
  return [key, Math.round(total * 1000) / 1000];
}));
const portionProfiles = [[0.75, 'light portion'], [1, 'standard portion'], [1.25, 'hearty portion'], [1.5, 'high-energy portion']];

const [inputPath, outputPath, changesPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !changesPath) throw new Error('Usage: expand-nutrition-catalogue-v1.1 <v1.json> <v1.1.json> <changes.json>');
const previous = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
if (previous.catalogueVersion !== 'FITEATSY-NUTRITION-CATALOGUE-v1') throw new Error('Expansion source must be immutable catalogue v1');
const foodsBySlug = new Map(previous.foods.map((food) => [food.canonicalName, food]));

const recipes = additions.map((definition) => {
  for (const [slug] of definition.components) if (!foodsBySlug.has(slug)) throw new Error(`Unknown verified component ${slug}`);
  const componentFoods = definition.components.map(([slug]) => foodsBySlug.get(slug));
  const dietaryTags = componentFoods.some((food) => food.dietaryTags.includes('non-vegetarian')) ? ['non-vegetarian']
    : componentFoods.some((food) => food.dietaryTags.includes('eggetarian')) ? ['eggetarian']
    : componentFoods.some((food) => food.allergenTags.includes('milk')) ? ['vegetarian'] : ['vegan'];
  return {
    id: uuid('recipe', definition.code), code: definition.code, displayName: definition.name,
    description: `${definition.name}, formulated by Fiteatsy from verified USDA ingredients.`,
    yieldGrams: definition.components.reduce((sum, [, grams]) => sum + grams, 0), portions: 1,
    cuisineTags: [...new Set([definition.cuisine.replaceAll('_', '-'), 'indian'])], dietaryTags,
    allergenTags: [...new Set(componentFoods.flatMap((food) => food.allergenTags))].sort(), retentionMethod: null,
    components: definition.components.map(([slug, quantityGrams]) => ({ foodId: foodsBySlug.get(slug).id, quantityGrams })),
    nutritionTotals: calculate(definition.components, foodsBySlug),
  };
});
const recipeByCode = new Map(recipes.map((recipe) => [recipe.code, recipe]));
const mealVariants = additions.flatMap((definition) => definition.meals.flatMap((mealKey) => portionProfiles.map(([portionMultiplier, label]) => {
  const recipe = recipeByCode.get(definition.code);
  return {
    id: uuid('variant', `${definition.code}:${mealKey}:${portionMultiplier}`), mealKey,
    name: `${recipe.displayName} — ${label}`, description: `${label} of ${recipe.displayName}.`, householdLabel: label,
    cuisineTags: recipe.cuisineTags, dietaryTags: recipe.dietaryTags, allergenTags: recipe.allergenTags,
    recipeId: recipe.id, portionMultiplier,
    nutritionTotals: Object.fromEntries(Object.entries(recipe.nutritionTotals).map(([key, value]) => [key, value == null ? null : Math.round(value * portionMultiplier * 1000) / 1000])),
  };
})));

const manifest = { ...previous, catalogueVersion: VERSION, generatedAt: GENERATED_AT,
  recipes: [...previous.recipes, ...recipes], mealVariants: [...previous.mealVariants, ...mealVariants] };
await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`);
const familyCoverage = Object.fromEntries(['earlyMorning', 'breakfast', 'midMorningSnack', 'lunch', 'eveningSnack', 'dinner', 'bedtimeNutrition'].map((mealKey) => [mealKey, {
  previous: new Set(previous.mealVariants.filter((variant) => variant.mealKey === mealKey).map((variant) => variant.recipeId)).size,
  successor: new Set(manifest.mealVariants.filter((variant) => variant.mealKey === mealKey).map((variant) => variant.recipeId)).size,
}]));
const changes = { catalogueVersion: VERSION, predecessor: previous.catalogueVersion, generatedAt: GENERATED_AT,
  addedFoods: 0, addedRecipes: recipes.map(({ id, code, displayName, components, nutritionTotals }) => ({ id, code, displayName, components, nutritionTotals })),
  addedMealVariants: mealVariants.map(({ id, mealKey, recipeId, portionMultiplier }) => ({ id, mealKey, recipeId, portionMultiplier })), familyCoverage };
await writeFile(resolve(changesPath), `${JSON.stringify(changes, null, 2)}\n`);
console.log(JSON.stringify({ foods: manifest.foods.length, recipes: manifest.recipes.length, mealVariants: manifest.mealVariants.length, addedRecipes: recipes.length, addedMealVariants: mealVariants.length, familyCoverage }));
