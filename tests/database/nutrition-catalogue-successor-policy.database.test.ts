import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  dryRunApprovedNutritionCatalogue,
  importNutritionCatalogue,
} from '../../backend/scripts/import-nutrition-catalogue.js';
import {
  APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION,
  APPROVED_NUTRITION_CATALOGUE_VERSION,
} from '../../backend/src/modules/nutrition/catalogue/catalogue.import-policy.js';
import type { NutritionCatalogueManifest } from '../../backend/src/modules/nutrition/catalogue/catalogue.types.js';
import { pool } from '../../backend/src/db/pool.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { createCareCaseIfMissing } from '../../backend/src/modules/platform/platform.store.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseTest = databaseUrl ? test : test.skip;
const readManifest = async (name: string) => JSON.parse(await readFile(new URL(`../../backend/src/modules/nutrition/catalogue/data/${name}`, import.meta.url), 'utf8')) as NutritionCatalogueManifest;

databaseTest('FITEATSY-CATALOGUE-SUCCESSOR-IMPORT-POLICY-v1', async () => {
  await resetBackendStateForTests();
  await pool.query(`truncate table
    nutrition_meal_variant_components,
    nutrition_meal_variants,
    nutrition_recipe_components,
    nutrition_recipes,
    nutrition_food_portions,
    nutrition_foods,
    nutrition_catalogue_releases
    cascade`);
  const v1 = await readManifest('fiteatsy-nutrition-catalogue-v1.json');
  const v11 = await readManifest('fiteatsy-nutrition-catalogue-v1.1.json');

  const baseline = await importNutritionCatalogue(databaseUrl, { releaseVersion: APPROVED_NUTRITION_CATALOGUE_PREDECESSOR_VERSION });
  assert.deepEqual(baseline.counts, { foods: 58, recipes: 55, mealVariants: 220 });
  assert.equal((await pool.query('select count(*)::int as count from nutrition_catalogue_releases')).rows[0].count, 1);

  const commonRecipe = v1.recipes.find((recipe) => v11.recipes.some((candidate) => candidate.id === recipe.id))!;
  const newRecipe = v11.recipes.find((recipe) => !v1.recipes.some((candidate) => candidate.id === recipe.id))!;
  const commonVariant = v1.mealVariants.find((variant) => v11.mealVariants.some((candidate) => candidate.id === variant.id))!;
  const historicalSnapshot = { recipeId: commonRecipe.id, variantId: commonVariant.id, calories: commonVariant.nutritionTotals.calories };

  const userId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  await pool.query(`insert into users (id,name,email_normalized,role) values ($1,'Successor Client',$2,'client')`, [userId, `${userId}@example.test`]);
  await pool.query(`insert into fiteatsy_clients (id,fiteatsy_client_id,account_user_id) values ($1,$2,$3)`, [clientId, `fc_successor_${Date.now()}`, userId]);
  await pool.query(`insert into health_profiles (id,user_id,client_id,gender,diet_type) values ($1,$2,$3,'Female','vegetarian')`, [profileId, userId, clientId]);
  const careCase = await createCareCaseIfMissing({ clientId, accountId: userId }, profileId);
  const planId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await pool.query(`insert into diet_plans (id,care_case_id,user_id,plan_status) values ($1,$2,$3,'draft')`, [planId, careCase.id, userId]);
  await pool.query(`insert into diet_plan_versions (id,diet_plan_id,version_number,content) values ($1,$2,1,$3::jsonb)`, [versionId, planId, JSON.stringify(historicalSnapshot)]);

  const positive = await dryRunApprovedNutritionCatalogue(databaseUrl, APPROVED_NUTRITION_CATALOGUE_VERSION);
  assert.equal(positive.conflicts.length, 0);
  assert.equal(positive.invalidRecords, 0);
  assert.deepEqual(positive.retained, { foods: v1.foods.map(({ id }) => id), recipes: v1.recipes.map(({ id }) => id), mealVariants: v1.mealVariants.map(({ id }) => id) });
  assert.ok(positive.classification.newInserts > 0);

  await pool.query('update nutrition_recipes set yield_grams=yield_grams+1 where id=$1', [commonRecipe.id]);
  assert.ok((await dryRunApprovedNutritionCatalogue(databaseUrl)).conflicts.some(({ id }) => id === commonRecipe.id));
  await pool.query('update nutrition_recipes set yield_grams=$2 where id=$1', [commonRecipe.id, commonRecipe.yieldGrams]);

  await pool.query(`update nutrition_recipes set source_metadata=jsonb_set(source_metadata,'{method}','"unexpected"') where id=$1`, [commonRecipe.id]);
  assert.ok((await dryRunApprovedNutritionCatalogue(databaseUrl)).conflicts.some(({ id }) => id === commonRecipe.id));
  await pool.query(`update nutrition_recipes set source_metadata=jsonb_set(source_metadata,'{method}','"Fiteatsy deterministic recipe composition"') where id=$1`, [commonRecipe.id]);

  await pool.query('update nutrition_recipes set recipe_code=$2 where id=$1', [commonRecipe.id, newRecipe.code]);
  assert.ok((await dryRunApprovedNutritionCatalogue(databaseUrl)).conflicts.some(({ id }) => id === commonRecipe.id));
  await pool.query('update nutrition_recipes set recipe_code=$2 where id=$1', [commonRecipe.id, commonRecipe.code]);

  const imported = await importNutritionCatalogue(databaseUrl);
  assert.deepEqual(imported.counts, { foods: 58, recipes: 64, mealVariants: 376 });
  const expectedRecipeComponents = v11.recipes.reduce((sum, recipe) => sum + recipe.components.length, 0);
  const recipes = new Map(v11.recipes.map((recipe) => [recipe.id, recipe]));
  const expectedVariantComponents = v11.mealVariants.reduce((sum, variant) => sum + recipes.get(variant.recipeId)!.components.length, 0);
  const totals = await pool.query(`select
    (select count(*)::int from nutrition_foods) foods,
    (select count(*)::int from nutrition_recipes) recipes,
    (select count(*)::int from nutrition_meal_variants) variants,
    (select count(*)::int from nutrition_recipe_components) recipe_components,
    (select count(*)::int from nutrition_meal_variant_components) variant_components,
    (select count(*)::int from nutrition_catalogue_releases) releases`);
  assert.deepEqual(totals.rows[0], { foods: 58, recipes: 64, variants: 376, recipe_components: expectedRecipeComponents, variant_components: expectedVariantComponents, releases: 2 });
  const releases = await pool.query('select catalogue_version,manifest_sha256 from nutrition_catalogue_releases order by catalogue_version');
  assert.equal(releases.rowCount, 2);

  const persisted = (await pool.query('select content from diet_plan_versions where id=$1', [versionId])).rows[0].content;
  assert.deepEqual(persisted, historicalSnapshot);
  assert.equal((await pool.query('select count(*)::int as count from nutrition_recipes where id=$1', [commonRecipe.id])).rows[0].count, 1);
  assert.equal((await pool.query('select count(*)::int as count from nutrition_meal_variants where id=$1', [commonVariant.id])).rows[0].count, 1);

  const second = await importNutritionCatalogue(databaseUrl);
  assert.equal(second.writes, 0);
  const secondDryRun = await dryRunApprovedNutritionCatalogue(databaseUrl);
  assert.equal(secondDryRun.conflicts.length, 0);
  assert.equal(secondDryRun.invalidRecords, 0);

  const orphans = await pool.query(`select
    (select count(*)::int from nutrition_recipe_components c left join nutrition_recipes r on r.id=c.recipe_id left join nutrition_foods f on f.id=c.food_id where r.id is null or f.id is null) recipe_orphans,
    (select count(*)::int from nutrition_meal_variants v where not exists (select 1 from nutrition_recipes r where r.id=(v.source_metadata->>'recipeId')::uuid)) variant_orphans,
    (select count(*)::int from nutrition_meal_variant_components c left join nutrition_meal_variants v on v.id=c.meal_variant_id left join nutrition_foods f on f.id=c.food_id where v.id is null or f.id is null) component_orphans`);
  assert.deepEqual(orphans.rows[0], { recipe_orphans: 0, variant_orphans: 0, component_orphans: 0 });
});
