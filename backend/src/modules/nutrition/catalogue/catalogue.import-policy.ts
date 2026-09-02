import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { calculateRecipeNutrition, scaleNutrients } from './catalogue.nutrition.js';
import type { NutritionCatalogueManifest, NullableNutrientMap } from './catalogue.types.js';

export const APPROVED_NUTRITION_CATALOGUE_VERSION = 'FITEATSY-NUTRITION-CATALOGUE-v1.1' as const;
export const APPROVED_NUTRITION_CATALOGUE_SHA256 = 'd59b5d8e9a62f7379a292b355b3dbd30300b3db990390d60e6a8ae9f5e30f77f' as const;
export const APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION = 'FITEATSY-NUTRITION-CATALOGUE-v1' as const;
export const APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_SHA256 = '775cf73607ea84b0da1017c6652d03c8e1a58cd03058391d555713102c6c55d5' as const;
export type ApprovedNutritionCatalogueVersion =
  | typeof APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION
  | typeof APPROVED_NUTRITION_CATALOGUE_VERSION;
export const APPROVED_NUTRITION_CATALOGUE_PATH = fileURLToPath(
  new URL('./data/fiteatsy-nutrition-catalogue-v1.1.json', import.meta.url),
);
export const NUTRITION_CATALOGUE_TABLE_ALLOWLIST = Object.freeze([
  'nutrition_catalogue_releases',
  'nutrition_foods',
  'nutrition_food_portions',
  'nutrition_recipes',
  'nutrition_recipe_components',
  'nutrition_meal_variants',
  'nutrition_meal_variant_components',
] as const);

const uuid = z.string().uuid();
const nonEmptyTags = z.array(z.string().trim().min(1));
const nutrients = z.record(z.string(), z.number().finite().nonnegative().nullable());
const manifestSchema = z.object({
  catalogueVersion: z.enum([APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION, APPROVED_NUTRITION_CATALOGUE_VERSION]),
  source: z.object({
    name: z.literal('USDA FoodData Central'),
    license: z.literal('CC0-1.0'),
    url: z.string().url(),
    releases: z.array(z.object({ dataType: z.string().min(1), release: z.string().min(1), downloadedFrom: z.string().url() })).min(1),
  }),
  generatedAt: z.string().datetime(),
  foods: z.array(z.object({
    id: uuid, fdcId: z.number().int().positive(), canonicalName: z.string().trim().min(1), displayName: z.string().trim().min(1),
    dataType: z.string().min(1), publicationDate: z.string().min(1), foodCategory: z.string().nullable(), nutrients,
    cuisineTags: nonEmptyTags, dietaryTags: nonEmptyTags, allergenTags: nonEmptyTags,
    portions: z.array(z.object({ id: uuid, label: z.string().trim().min(1), grams: z.number().finite().positive() })).min(1),
  })),
  recipes: z.array(z.object({
    id: uuid, code: z.string().trim().min(1), displayName: z.string().trim().min(1), description: z.string(),
    yieldGrams: z.number().finite().positive(), portions: z.number().finite().positive(), cuisineTags: nonEmptyTags,
    dietaryTags: nonEmptyTags, allergenTags: nonEmptyTags, retentionMethod: z.string().nullable(),
    components: z.array(z.object({ foodId: uuid, quantityGrams: z.number().finite().positive(), retentionFactors: z.record(z.string(), z.number().finite().nonnegative()).optional() })).min(1),
    nutritionTotals: nutrients,
  })),
  mealVariants: z.array(z.object({
    id: uuid, mealKey: z.enum(['earlyMorning','breakfast','midMorningSnack','lunch','eveningSnack','dinner','bedtimeNutrition']),
    name: z.string().trim().min(1), description: z.string(), householdLabel: z.string().trim().min(1), cuisineTags: nonEmptyTags,
    dietaryTags: nonEmptyTags, allergenTags: nonEmptyTags, recipeId: uuid, portionMultiplier: z.number().finite().positive(), nutritionTotals: nutrients,
  })),
}).strict();

const assertUnique = (values: Array<string | number>, label: string) => {
  if (new Set(values).size !== values.length) throw new Error(`Catalogue validation failed: duplicate ${label}`);
};
const sameNutrients = (a: NullableNutrientMap, b: NullableNutrientMap) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
};

export const validateApprovedNutritionCatalogueStructure = (input: unknown) => {
  const manifest = manifestSchema.parse(input) as NutritionCatalogueManifest;
  const expected = manifest.catalogueVersion === APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION
    ? [58, 55, 220]
    : [58, 64, 376];
  if (manifest.foods.length !== expected[0] || manifest.recipes.length !== expected[1] || manifest.mealVariants.length !== expected[2]) {
    throw new Error('Catalogue validation failed: record counts do not match the approved release');
  }
  assertUnique(manifest.foods.map((x) => x.id), 'food ID');
  assertUnique(manifest.foods.map((x) => x.fdcId), 'USDA FDC ID');
  assertUnique(manifest.foods.map((x) => x.canonicalName.toLowerCase()), 'canonical food name');
  assertUnique(manifest.foods.flatMap((x) => x.portions.map((p) => p.id)), 'food portion ID');
  assertUnique(manifest.recipes.map((x) => x.id), 'recipe ID');
  assertUnique(manifest.recipes.map((x) => x.code.toLowerCase()), 'recipe code');
  assertUnique(manifest.mealVariants.map((x) => x.id), 'meal variant ID');
  assertUnique(manifest.mealVariants.map((x) => `${x.mealKey}:${x.recipeId}:${x.portionMultiplier}`), 'meal variant signature');
  const foods = new Map(manifest.foods.map((food) => [food.id, food]));
  const recipes = new Map(manifest.recipes.map((recipe) => [recipe.id, recipe]));
  for (const food of manifest.foods) {
    for (const key of ['calories','proteinGrams','carbohydrateGrams','fatGrams','fibreGrams']) {
      if (!(key in food.nutrients)) throw new Error(`Catalogue validation failed: ${food.id} is missing ${key}`);
    }
    if ((food.nutrients.calories ?? 0) <= 0) throw new Error(`Catalogue validation failed: ${food.id} has invalid calories`);
  }
  for (const recipe of manifest.recipes) {
    if (recipe.components.some((component) => !foods.has(component.foodId))) throw new Error(`Catalogue validation failed: ${recipe.id} references an unknown food`);
    if (!sameNutrients(calculateRecipeNutrition(recipe.components, foods), recipe.nutritionTotals)) throw new Error(`Catalogue validation failed: ${recipe.id} nutrition is not deterministic`);
  }
  for (const variant of manifest.mealVariants) {
    const recipe = recipes.get(variant.recipeId);
    if (!recipe) throw new Error(`Catalogue validation failed: ${variant.id} references an unknown recipe`);
    if (!sameNutrients(scaleNutrients(recipe.nutritionTotals, variant.portionMultiplier), variant.nutritionTotals)) throw new Error(`Catalogue validation failed: ${variant.id} nutrition is not deterministic`);
  }
  return manifest;
};

export const validateApprovedNutritionCatalogue = (raw: string) => {
  const sha256 = createHash('sha256').update(raw).digest('hex');
  if (sha256 !== APPROVED_NUTRITION_CATALOGUE_SHA256) {
    throw new Error(`Catalogue validation failed: manifest SHA-256 is not approved (${sha256})`);
  }
  return { manifest: validateApprovedNutritionCatalogueStructure(JSON.parse(raw)), sha256 };
};

export const loadApprovedNutritionCatalogue = async () =>
  validateApprovedNutritionCatalogue(await readFile(APPROVED_NUTRITION_CATALOGUE_PATH, 'utf8'));

const approvedReleases = {
  [APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION]: {
    sha256: APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_SHA256,
    path: fileURLToPath(new URL('./data/fiteatsy-nutrition-catalogue-v1.json', import.meta.url)),
  },
  [APPROVED_NUTRITION_CATALOGUE_VERSION]: {
    sha256: APPROVED_NUTRITION_CATALOGUE_SHA256,
    path: APPROVED_NUTRITION_CATALOGUE_PATH,
  },
} as const;

export const loadApprovedNutritionCatalogueRelease = async (version: ApprovedNutritionCatalogueVersion) => {
  const release = approvedReleases[version];
  const raw = await readFile(release.path, 'utf8');
  const sha256 = createHash('sha256').update(raw).digest('hex');
  if (sha256 !== release.sha256) throw new Error(`Catalogue validation failed: ${version} SHA-256 is not approved (${sha256})`);
  const manifest = validateApprovedNutritionCatalogueStructure(JSON.parse(raw));
  if (manifest.catalogueVersion !== version) throw new Error('Catalogue validation failed: requested release does not match manifest version');
  return { manifest, sha256 };
};
