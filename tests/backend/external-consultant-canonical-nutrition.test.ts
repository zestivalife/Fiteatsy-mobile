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
  assert.match(store, /external_source_version = \$2/);
  assert.match(store, /verification_status = 'verified'/);
  assert.match(store, /on conflict \(care_case_id,user_id\) do update/);
});

test('nutrition selection is preferred without replacing another consultant plan', () => {
  const store = read('backend/src/modules/nutrition/nutrition.store.ts');
  assert.match(store, /left join client_active_diet_plan_selections selection/);
  assert.match(store, /order by \(selection.id is not null\) desc/);
});
