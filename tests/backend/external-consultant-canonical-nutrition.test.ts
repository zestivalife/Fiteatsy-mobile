import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('external consultant plan migration keeps independent plans and one explicit selection', () => {
  const migration = read('backend/src/db/migrations/0067_external_consultant_canonical_nutrition.sql');
  assert.match(migration, /external_source_system, external_connection_id, external_plan_id/);
  assert.match(migration, /diet_plan_versions_external_source_version_unique/);
  assert.match(migration, /unique \(care_case_id, user_id\)/);
});

test('external plan ingestion is idempotent and validates governed foods', () => {
  const store = read('backend/src/modules/external-consultants/external-diet-plan.store.ts');
  assert.match(store, /external_source_version = \$3/);
  assert.match(store, /isPublishableGovernedFoodSnapshot/);
  assert.match(store, /ExternalDietPlanFoodReferenceError/);
  assert.match(store, /on conflict \(care_case_id,user_id\) do update/);
  assert.match(store, /id, tenant_id, care_case_id, user_id/);
  assert.match(store, /id,tenant_id,diet_plan_id,version_number/);
  assert.match(store, /where tenant_id = \$1 and external_source_system/);
});

test('delegated generation excludes reference-only foods that publication rejects', () => {
  const service = read('backend/src/modules/nutrition/common-food-consultant.service.ts');
  const delegated = service.slice(service.indexOf('export async function generateDelegatedCommonFoodPlan'), service.indexOf('type FoodSearchQuery'));
  assert.match(delegated, /foods:governedCommonFoodCatalogue/);
  assert.doesNotMatch(delegated, /generateMealCombinations\(\{foods,/);
});

test('publication errors identify affected foods without exposing catalogue identifiers', () => {
  const routes = read('backend/src/modules/external-consultants/external-consultant-access.routes.ts');
  assert.match(routes, /invalidFoods: error\.invalidReferences\.map\(\(\{ displayName, mealHead \}\)/);
  assert.doesNotMatch(routes, /invalidFoods:[^\n]+foodId/);
});

test('nutrition selection is preferred without replacing another consultant plan', () => {
  const store = read('backend/src/modules/nutrition/nutrition.store.ts');
  assert.match(store, /left join client_active_diet_plan_selections selection/);
  assert.match(store, /order by \(selection.id is not null\) desc/);
});
