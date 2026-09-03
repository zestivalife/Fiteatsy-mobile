import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('production QA fixture provisioning is narrow, explicit, and fail-closed', () => {
  const script = read('../../backend/src/jobs/provision-common-food-production-qa.ts');
  assert.match(script, /ALLOW_PRODUCTION_QA_FIXTURES/);
  assert.match(script, /QA_FIXTURE_PURPOSE/);
  assert.match(script, /COMMON_FOOD_ENGINE_E2E/);
  assert.match(script, /RAILWAY_PRODUCTION_RUNTIME_REQUIRED/);
  assert.match(script, /account_purpose = 'QA_TEST'/);
  assert.match(script, /--deactivate/);
  assert.doesNotMatch(script, /console\.log\([^)]*token/);
});

test('production QA fixture schema is purpose-limited and auditable', () => {
  const migration = read('../../backend/src/db/migrations/0052_production_qa_fixture_sets.sql');
  assert.match(migration, /environment = 'PRODUCTION_QA'/);
  assert.match(migration, /purpose = 'COMMON_FOOD_ENGINE_E2E'/);
  assert.match(migration, /DEACTIVATED/);
  assert.match(migration, /qa_fixture_entities/);
  assert.match(migration, /audit_reference/);
});

test('no public production-QA provisioning route is introduced', () => {
  const routes = read('../../backend/src/modules/admin/admin.routes.ts');
  assert.doesNotMatch(routes, /production-qa|qa-fixture-sets|COMMON_FOOD_ENGINE_E2E/i);
});
