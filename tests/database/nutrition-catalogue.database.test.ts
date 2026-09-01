import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importNutritionCatalogue } from '../../backend/scripts/import-nutrition-catalogue.js';
import { closePool, pool } from '../../backend/src/db/pool.js';
import { NUTRITION_CATALOGUE_VERSION } from '../../backend/src/modules/nutrition/catalogue/catalogue.types.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseTest = databaseUrl ? test : test.skip;

databaseTest('imports the verified USDA catalogue idempotently with durable provenance', async () => {
  const first = await importNutritionCatalogue(databaseUrl);
  const second = await importNutritionCatalogue(databaseUrl);

  assert.deepEqual(first, second);
  assert.deepEqual(first.counts, { foods: 58, recipes: 55, mealVariants: 220 });

  try {
    const release = await pool.query<{
      source_name: string;
      source_license: string;
      record_counts: { foods: number; recipes: number; mealVariants: number };
      status: string;
    }>(
      `select source_name, source_license, record_counts, status
         from nutrition_catalogue_releases
        where catalogue_version = $1`,
      [NUTRITION_CATALOGUE_VERSION]
    );
    assert.equal(release.rowCount, 1);
    assert.equal(release.rows[0]?.source_name, 'USDA FoodData Central');
    assert.equal(release.rows[0]?.source_license, 'CC0-1.0');
    assert.equal(release.rows[0]?.status, 'active');
    assert.deepEqual(release.rows[0]?.record_counts, first.counts);

    const foods = await pool.query<{ count: string; distinct_count: string }>(
      `select count(*)::text as count,
              count(distinct lower(canonical_name))::text as distinct_count
         from nutrition_foods
        where deleted_at is null
          and verification_status = 'verified'
          and source_metadata->>'catalogueVersion' = $1
          and source_metadata->>'source' = 'USDA FoodData Central'
          and source_metadata ? 'fdcId'`,
      [NUTRITION_CATALOGUE_VERSION]
    );
    assert.deepEqual(foods.rows[0], { count: '58', distinct_count: '58' });

    const recipes = await pool.query<{ count: string; distinct_count: string }>(
      `select count(*)::text as count,
              count(distinct lower(recipe_code))::text as distinct_count
         from nutrition_recipes
        where deleted_at is null
          and catalogue_version = $1
          and verification_status = 'verified'`,
      [NUTRITION_CATALOGUE_VERSION]
    );
    assert.deepEqual(recipes.rows[0], { count: '55', distinct_count: '55' });

    const variants = await pool.query<{ count: string; meal_keys: string[] }>(
      `select count(*)::text as count,
              array_agg(distinct meal_key order by meal_key) as meal_keys
         from nutrition_meal_variants
        where deleted_at is null
          and verification_status = 'verified'
          and source_metadata->>'catalogueVersion' = $1`,
      [NUTRITION_CATALOGUE_VERSION]
    );
    assert.equal(variants.rows[0]?.count, '220');
    assert.deepEqual(variants.rows[0]?.meal_keys, [
      'bedtimeNutrition',
      'breakfast',
      'dinner',
      'earlyMorning',
      'eveningSnack',
      'lunch',
      'midMorningSnack'
    ]);

    const unknowns = await pool.query<{ unknown_count: string }>(
      `select count(*)::text as unknown_count
         from nutrition_foods
        where deleted_at is null
          and source_metadata->>'catalogueVersion' = $1
          and micronutrients ? 'vitaminB12Mcg'
          and micronutrients->'vitaminB12Mcg' = 'null'::jsonb`,
      [NUTRITION_CATALOGUE_VERSION]
    );
    assert.ok(Number(unknowns.rows[0]?.unknown_count ?? 0) > 0, 'unknown nutrients must persist as JSON null');

    const manualSearch = await pool.query<{ display_name: string; verification_status: string; fdc_id: string }>(
      `select display_name, verification_status, source_metadata->>'fdcId' as fdc_id
         from nutrition_foods
        where deleted_at is null
          and source_metadata->>'catalogueVersion' = $1
          and (lower(display_name) like '%chickpea%' or lower(canonical_name) like '%chickpea%')
        order by display_name`,
      [NUTRITION_CATALOGUE_VERSION]
    );
    assert.ok(manualSearch.rows.length > 0);
    assert.ok(manualSearch.rows.every((row) => row.verification_status === 'verified' && Number(row.fdc_id) > 0));
  } finally {
    await closePool();
  }
});
