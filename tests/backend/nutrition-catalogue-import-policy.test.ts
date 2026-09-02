import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  APPROVED_NUTRITION_CATALOGUE_PATH,
  APPROVED_NUTRITION_CATALOGUE_SHA256,
  NUTRITION_CATALOGUE_TABLE_ALLOWLIST,
  validateApprovedNutritionCatalogue,
  validateApprovedNutritionCatalogueStructure,
} from '../../backend/src/modules/nutrition/catalogue/catalogue.import-policy.js';
import { importNutritionCatalogue } from '../../backend/scripts/import-nutrition-catalogue.js';

const loadJson = async () => JSON.parse(await readFile(APPROVED_NUTRITION_CATALOGUE_PATH, 'utf8'));

test('locks the production catalogue to the approved artifact and seven-table allowlist', async () => {
  const raw = await readFile(APPROVED_NUTRITION_CATALOGUE_PATH, 'utf8');
  const result = validateApprovedNutritionCatalogue(raw);
  assert.equal(result.sha256, APPROVED_NUTRITION_CATALOGUE_SHA256);
  assert.deepEqual([result.manifest.foods.length, result.manifest.recipes.length, result.manifest.mealVariants.length], [58, 64, 376]);
  assert.deepEqual(NUTRITION_CATALOGUE_TABLE_ALLOWLIST, [
    'nutrition_catalogue_releases', 'nutrition_foods', 'nutrition_food_portions', 'nutrition_recipes',
    'nutrition_recipe_components', 'nutrition_meal_variants', 'nutrition_meal_variant_components',
  ]);
});

test('rejects any unapproved checksum', async () => {
  const raw = await readFile(APPROVED_NUTRITION_CATALOGUE_PATH, 'utf8');
  assert.throws(() => validateApprovedNutritionCatalogue(`${raw}\n`), /manifest SHA-256 is not approved/);
});

test('rejects wrong version, malformed nutrition and duplicate identities', async () => {
  const wrongVersion = await loadJson();
  wrongVersion.catalogueVersion = 'FITEATSY-NUTRITION-CATALOGUE-v2';
  assert.throws(() => validateApprovedNutritionCatalogueStructure(wrongVersion));

  const malformed = await loadJson();
  delete malformed.foods[0].nutrients.proteinGrams;
  assert.throws(() => validateApprovedNutritionCatalogueStructure(malformed), /missing proteinGrams/);

  const duplicate = await loadJson();
  duplicate.foods[1].id = duplicate.foods[0].id;
  assert.throws(() => validateApprovedNutritionCatalogueStructure(duplicate), /duplicate food ID/);
});

test('limits importer writes to the seven approved tables', async () => {
  const importer = await readFile(new URL('../../backend/scripts/import-nutrition-catalogue.ts', import.meta.url), 'utf8');
  const insertTargets = [...importer.matchAll(/insert\s+into\s+([a-z_]+)/gi)].map((match) => match[1]);
  assert.deepEqual([...new Set(insertTargets)].sort(), [...NUTRITION_CATALOGUE_TABLE_ALLOWLIST].sort());
  assert.doesNotMatch(importer, /\b(?:delete\s+from|truncate)\b/i);
});

test('rejects production import without the exact approval before connecting to a database', async () => {
  await assert.rejects(
    importNutritionCatalogue('postgresql://invalid.invalid/fiteatsy', {
      mode: 'production-approved',
      confirmation: 'not-approved',
    }),
    /Exact production catalogue import confirmation is required/,
  );
});
