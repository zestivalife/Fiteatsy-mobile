import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../backend/src/modules/nutrition/common-food-consultant.service.ts', import.meta.url),
  'utf8',
);
const nutritionService = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
const nutritionStore = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.store.ts', import.meta.url), 'utf8');
const catalogueRepository = readFileSync(new URL('../../backend/src/modules/nutrition/food-catalogue.repository.ts', import.meta.url), 'utf8');
const projectionRepository = readFileSync(new URL('../../backend/src/modules/nutrition/food-explorer-projection.repository.ts', import.meta.url), 'utf8');
const projectionMigration = readFileSync(new URL('../../backend/src/db/migrations/0069_food_explorer_search_projection.sql', import.meta.url), 'utf8');
const projectionIdentityMigration = readFileSync(new URL('../../backend/src/db/migrations/0070_food_explorer_projection_source_identity.sql', import.meta.url), 'utf8');

test('Food Explorer reads a prepared projection without caching the authorization boundary', () => {
  const authorization = source.indexOf('canAccessConsultantNutritionClient(input.clientId,input.account');
  const contextResolution = source.indexOf('resolveClientMealGenerationContext({account,clientId,mealHead:q.mealHead})');

  assert.ok(authorization >= 0, 'the assignment authorization check must remain present');
  assert.ok(contextResolution > authorization, 'Explorer must use the resolver with mandatory authorization');
  assert.doesNotMatch(source, /explorerContextCache/);
  assert.match(source, /searchFoodExplorerProjection/);
  assert.doesNotMatch(source, /cachedExplorerSupportData/);
});

test('Food Explorer projection paginates and aggregates in PostgreSQL', () => {
  assert.match(projectionRepository, /order by stable_sort_key,projection_id limit/);
  assert.match(projectionRepository, /await Promise\.all\(\[page,aggregate\]\)/);
  assert.match(projectionRepository, /count\(\*\)::int total/);
  assert.match(projectionRepository, /cross join lateral unnest\(roles\)/);
});

test('Food Explorer does not transfer reference identities already embedded in the governed runtime catalogue', () => {
  assert.match(source, /excludeIds:practicalFoodMasterRows\.map\(food=>food\.id\)/);
  assert.match(catalogueRepository, /not \(id = any\(\$\{bind\(input\.excludeIds\)\}::text\[\]\)\)/);
});

test('projection refresh is transactional, idempotent and search-indexed', () => {
  assert.match(projectionRepository, /create temporary table next_food_explorer_projection/);
  assert.match(projectionRepository, /pg_advisory_xact_lock/);
  assert.match(projectionRepository, /validateFoodExplorerProjectionRecords/);
  assert.match(projectionRepository, /delete from food_explorer_search_projection/);
  assert.match(projectionRepository, /insert into food_explorer_search_projection select \* from next_food_explorer_projection/);
  assert.match(projectionMigration, /gin_trgm_ops/);
  assert.match(projectionMigration, /canonical_identity_key text not null unique/);
  assert.match(projectionRepository, /sourceType==='GOVERNED'\?300:r\.sourceType==='REFERENCE'\?200:100/);
});

test('projection physical identity is source-aware and independent from semantic identity', () => {
  assert.match(source, /foodExplorerProjectionId/);
  assert.ok(source.includes('`${sourceType}\\0${sourceRecordId}\\0${canonicalIdentityKey}`'));
  assert.match(source, /sourceRecordId=String\(item\.id\)/);
  assert.match(projectionRepository, /FOOD_EXPLORER_PROJECTION_DUPLICATE_\$\{kind\}/);
  assert.match(projectionIdentityMigration, /food_explorer_projection_source_key_uq/);
});

test('Food Explorer cold context avoids the full Nutrition workspace projection', () => {
  assert.match(source, /getCurrentDietPlanForClient\(registered\.internalClientId,registered\.accountId\)/);
  assert.match(source, /getFoodPreferenceProfile\(input\.clientId,registered\.internalClientId\)/);
  assert.match(source, /const \[canAccess,registered\]=await Promise\.all/);
  assert.match(source, /const \[prefs,latest,biomarkers\]=await Promise\.all/);
  assert.match(nutritionService, /const context = await getRegisteredConsultantClientAccessContext\(/);
  assert.match(nutritionStore, /select row_to_json\(dp\) as plan, row_to_json\(dpv\) as version/);
});
