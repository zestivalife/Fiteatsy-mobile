import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, closePool } from '../../backend/src/db/pool.js';
import { assertDestructiveTestResetAllowed } from '../../backend/src/test-support/destructive-reset-guard.js';
import { FOOD_KNOWLEDGE_FIXTURE_MANIFEST } from '../../backend/src/modules/nutrition/food-knowledge/food-knowledge.fixture.js';
import { dryRunFoodKnowledgeRelease, importFoodKnowledgeRelease } from '../../backend/src/modules/nutrition/food-knowledge/food-knowledge.importer.js';
import { findEligibleFoodKnowledge, flattenFoodKnowledgeComposition, getFoodKnowledgeCoverage, getFoodKnowledgeProjection, searchFoodKnowledge } from '../../backend/src/modules/nutrition/food-knowledge/food-knowledge.repository.js';
import { sha256 } from '../../backend/src/modules/nutrition/food-knowledge/food-knowledge.validation.js';

const databaseTest = process.env.DATABASE_URL ? test : test.skip;
const clone = () => structuredClone(FOOD_KNOWLEDGE_FIXTURE_MANIFEST);

databaseTest.before(async () => {
  assertDestructiveTestResetAllowed();
  await pool.query(`truncate table
    food_knowledge_release_memberships, food_knowledge_version_context_tags, food_knowledge_context_tags,
    food_knowledge_meal_suitability, food_knowledge_version_allergens, food_knowledge_allergens,
    food_knowledge_compatibilities, food_knowledge_version_cuisines, food_knowledge_cuisines,
    food_knowledge_components, food_knowledge_servings, food_knowledge_food_nutrients,
    food_knowledge_version_sources, food_knowledge_calculation_methods, food_knowledge_sources,
    food_knowledge_aliases, food_knowledge_nutrients, food_knowledge_versions,
    food_knowledge_food_profiles, food_knowledge_families, food_knowledge_releases cascade`);
  await pool.query(`delete from nutrition_foods where source_metadata->>'source'='Food Knowledge fixture'`);
});

databaseTest.after(async () => { await closePool(); });

databaseTest('release dry-run, import and second pass are transactional and idempotent', async () => {
  const before = await pool.query('select count(*)::int as count from food_knowledge_releases');
  const dryRun = await dryRunFoodKnowledgeRelease(clone());
  assert.equal(dryRun.writes, 0);
  assert.deepEqual(dryRun.conflicts, []);
  assert.deepEqual(dryRun.invalidRecords, []);
  const afterDryRun = await pool.query('select count(*)::int as count from food_knowledge_releases');
  assert.deepEqual(afterDryRun.rows, before.rows);

  const first = await importFoodKnowledgeRelease(clone());
  const second = await importFoodKnowledgeRelease(clone());
  assert.ok(first.writes > 0);
  assert.equal(second.writes, 0);
  assert.deepEqual(second.conflicts, []);
  assert.deepEqual(second.invalidRecords, []);
  assert.equal(first.manifestSha256, sha256(clone()));
});

databaseTest('canonical projection preserves Food, Version, Family, serving, nutrition and unknown semantics', async () => {
  const bhindi = clone().foods.find((food) => food.canonicalCode === 'BHINDI_SABJI');
  assert.ok(bhindi);
  const projection = await getFoodKnowledgeProjection(bhindi.id);
  assert.equal(projection.canonical_code, 'BHINDI_SABJI');
  assert.equal(projection.food_id, bhindi.id);
  assert.equal(projection.food_version_id, bhindi.version.id);
  assert.equal(projection.family_code, 'BHINDI');
  assert.equal(projection.servings.length, 1);
  assert.equal(Number(projection.servings[0].grams), 150);
  assert.equal(Number(projection.nutrients_per_100g.energy_kcal), 96);
  assert.equal('vitamin_d_mcg' in projection.nutrients_per_100g, false);
});

databaseTest('composition, Potato Avoid, No Garlic and allergen eligibility are structural and fail closed', async () => {
  const manifest = clone();
  const food = (code: string) => manifest.foods.find((item) => item.canonicalCode === code)!;
  const flattened = await flattenFoodKnowledgeComposition(food('BHINDI_ALOO').version.id);
  assert.ok(flattened.some((item) => item.component_food_id === food('POTATO_RAW').id));

  const withoutPotato = await findEligibleFoodKnowledge({ mealKey: 'lunch', dietPattern: 'VEGETARIAN', excludeComponentFoodIds: [food('POTATO_RAW').id], limit: 100 });
  assert.ok(withoutPotato.some((item) => item.canonical_code === 'BHINDI_SABJI'));
  assert.equal(withoutPotato.some((item) => item.canonical_code === 'BHINDI_ALOO'), false);

  const noGarlic = await findEligibleFoodKnowledge({ mealKey: 'lunch', dietPattern: 'VEGETARIAN', preparationProfiles: ['NO_GARLIC'], limit: 100 });
  assert.equal(noGarlic.some((item) => item.canonical_code === 'GARLIC_BHINDI'), false);
  assert.ok(noGarlic.some((item) => item.canonical_code === 'BHINDI_SABJI'));

  const soyAllergy = await findEligibleFoodKnowledge({ dietPattern: 'VEGAN', excludeAllergenCodes: ['SOY'], limit: 100 });
  assert.equal(soyAllergy.some((item) => item.canonical_code === 'TOFU'), false);
  assert.equal(soyAllergy.some((item) => item.canonical_code === 'PANEER'), false, 'Vegan compatibility excludes Paneer independently');
});

databaseTest('Cuisine hierarchy, contextual tags, alias search and family discovery avoid duplicate candidates', async () => {
  const indianLunch = await findEligibleFoodKnowledge({ mealKey: 'lunch', dietPattern: 'VEGETARIAN', cuisineCodes: ['INDIAN'], limit: 100 });
  assert.ok(indianLunch.some((item) => item.canonical_code === 'BHINDI_SABJI'));
  assert.ok(indianLunch.some((item) => item.canonical_code === 'BHINDI_ALOO'));
  assert.equal(new Set(indianLunch.map((item) => item.food_id)).size, indianLunch.length);
  const crunchy = await findEligibleFoodKnowledge({ contextCodes: ['CRUNCHY'], limit: 100 });
  assert.deepEqual(crunchy.map((item) => item.canonical_code), ['ROASTED_CHANA']);
  const alias = await searchFoodKnowledge('okra');
  assert.deepEqual(alias.map((item) => item.canonical_code), ['BHINDI_RAW']);
});

databaseTest('coverage counts canonical Foods separately from servings and excludes ingredients from Diet coverage', async () => {
  const coverage = await getFoodKnowledgeCoverage(FOOD_KNOWLEDGE_FIXTURE_MANIFEST.releaseVersion);
  assert.equal(coverage.food_count, FOOD_KNOWLEDGE_FIXTURE_MANIFEST.foods.length);
  assert.equal(coverage.food_version_count, FOOD_KNOWLEDGE_FIXTURE_MANIFEST.foods.length);
  assert.equal(coverage.serving_count, FOOD_KNOWLEDGE_FIXTURE_MANIFEST.foods.filter((food) => food.version.servings.length).length);
  assert.equal(coverage.ingredient_only_count, 4);
  assert.equal(coverage.diet_eligible_food_count, FOOD_KNOWLEDGE_FIXTURE_MANIFEST.foods.length - 4);
  assert.ok(coverage.family_count > 0);
  assert.ok(coverage.cuisine_count > 0);
  assert.equal(coverage.meal_head_count, 7);
});

databaseTest('database constraints reject duplicate identity, orphan relationships and self-components', async () => {
  const manifest = clone();
  const bhindi = manifest.foods.find((food) => food.canonicalCode === 'BHINDI_SABJI')!;
  await assert.rejects(pool.query(`insert into food_knowledge_food_profiles (food_id,canonical_code,food_type,client_consumable) values ($1,'BHINDI_SABJI','SABJI',true)`, [manifest.foods.find((food) => food.canonicalCode === 'BHINDI_ALOO')!.id]), /unique|duplicate/i);
  await assert.rejects(pool.query(`insert into food_knowledge_servings (id,food_version_id,serving_code,serving_name,grams) values ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003','X','X',1)`), /foreign key/i);
  await assert.rejects(pool.query(`insert into food_knowledge_components (id,food_version_id,component_food_id,component_role) values ('90000000-0000-4000-8000-000000000004',$1,$2,'PRIMARY')`, [bhindi.version.id, bhindi.id]), /FOOD_KNOWLEDGE_SELF_COMPONENT/);
  await assert.rejects(pool.query(`update food_knowledge_versions set nutrition_status='PARTIAL' where id=$1`, [bhindi.version.id]), /FOOD_KNOWLEDGE_VERSION_IMMUTABLE/);
  await assert.rejects(pool.query(`delete from food_knowledge_release_memberships where release_version=$1 and food_version_id=$2`, [manifest.releaseVersion, bhindi.version.id]), /FOOD_KNOWLEDGE_RELEASE_MEMBERSHIP_IMMUTABLE/);
});

databaseTest('successor releases retain identity while collision, content drift and provenance drift fail closed', async () => {
  const successor = clone();
  successor.releaseVersion = 'FITEATSY-FOOD-KNOWLEDGE-v1.1-fixture';
  successor.predecessorVersion = FOOD_KNOWLEDGE_FIXTURE_MANIFEST.releaseVersion;
  const bhindi = successor.foods.find((food) => food.canonicalCode === 'BHINDI_SABJI')!;
  bhindi.version.id = '91000000-0000-4000-8000-000000000001';
  bhindi.version.number = 2;
  bhindi.version.nutrients.energy_kcal = 97;
  const imported = await importFoodKnowledgeRelease(successor);
  assert.ok(imported.writes > 0);
  const versions = await pool.query('select food_id, version_number from food_knowledge_versions where food_id=$1 order by version_number', [bhindi.id]);
  assert.deepEqual(versions.rows.map((row) => Number(row.version_number)), [1, 2]);
  assert.ok(versions.rows.every((row) => row.food_id === bhindi.id));

  const collision = clone();
  collision.releaseVersion = 'FITEATSY-FOOD-KNOWLEDGE-collision';
  collision.predecessorVersion = FOOD_KNOWLEDGE_FIXTURE_MANIFEST.releaseVersion;
  collision.foods[4].id = '92000000-0000-4000-8000-000000000001';
  const collisionDryRun = await dryRunFoodKnowledgeRelease(collision);
  assert.ok(collisionDryRun.conflicts.some((item) => item.startsWith('CANONICAL_IDENTITY_COLLISION')));

  const contentDrift = clone();
  contentDrift.releaseVersion = 'FITEATSY-FOOD-KNOWLEDGE-content-drift';
  contentDrift.predecessorVersion = FOOD_KNOWLEDGE_FIXTURE_MANIFEST.releaseVersion;
  contentDrift.foods[4].version.nutrients.energy_kcal = 98;
  const contentDryRun = await dryRunFoodKnowledgeRelease(contentDrift);
  assert.ok(contentDryRun.conflicts.some((item) => item.startsWith('FOOD_VERSION_CONTENT_DRIFT')));

  const provenanceDrift = clone();
  provenanceDrift.releaseVersion = 'FITEATSY-FOOD-KNOWLEDGE-provenance-drift';
  provenanceDrift.predecessorVersion = FOOD_KNOWLEDGE_FIXTURE_MANIFEST.releaseVersion;
  provenanceDrift.sources[0].licenceCode = 'CHANGED';
  const provenanceDryRun = await dryRunFoodKnowledgeRelease(provenanceDrift);
  assert.ok(provenanceDryRun.conflicts.some((item) => item.startsWith('PROVENANCE_DRIFT')));
});
