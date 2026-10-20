import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repo=readFileSync(new URL('../../backend/src/modules/external-clients/external-diet-plans.repository.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.routes.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../../backend/src/db/migrations/0105_external_multi_diet_plans.sql',import.meta.url),'utf8');
const migrator=readFileSync(new URL('../../backend/src/db/migrator.ts',import.meta.url),'utf8');

test('migration removes the one-plan constraint and adds independent plan identity metadata',()=>{
  assert.match(migration,/drop constraint if exists external_diet_plans_tenant_id_client_id_key/i);
  assert.match(migration,/add column if not exists name/i);
  assert.match(migration,/revision_of_plan_id/i);
  assert.doesNotMatch(migration,/internal_|common_food|biomarker_observation/i);
});

test('migration transaction and ledger entry remain atomic under the governed runner',()=>{
  assert.doesNotMatch(migration,/^\s*(begin|commit|rollback)\s*;/im);
  assert.match(migrator,/await client\.query\('begin'\)/);
  assert.match(migrator,/await client\.query\(sql\);[\s\S]*insert into schema_migrations[\s\S]*await client\.query\('commit'\)/);
  assert.match(migrator,/catch \(error\) \{[\s\S]*rollbackQuietly\(client\)[\s\S]*throw error/);
  assert.match(migrator,/migrationPromise = null/);
});

test('migration is retry-safe before its ledger entry is committed',()=>{
  assert.match(migration,/drop constraint if exists/i);
  assert.equal((migration.match(/add column if not exists/gi)??[]).length,2);
  assert.equal((migration.match(/create index if not exists/gi)??[]).length,2);
  assert.match(migration,/where name is null or btrim\(name\) = ''/i);
});

test('all mutable authoring operations resolve the exact plan id in tenant and client scope',()=>{
  assert.match(repo,/draftContext\(account,clientId,planId\)/g);
  assert.match(repo,/where id=\$1 and tenant_id=\$2 and client_id=\$3/);
  assert.match(repo,/getExternalDietPlanById/);
  assert.doesNotMatch(repo,/update external_diet_plans set[^;]+where client_id=/i);
});

test('multiple-plan routes preserve accepted target validation',()=>{
  assert.match(routes,/dailyCalories:z\.number\(\)\.int\(\)\.min\(800\)\.max\(6000\)/);
  assert.match(routes,/dailyProtein:z\.number\(\)\.min\(20\)\.max\(400\)/);
  for(const route of ["get('/:id/diet-plans'","post('/:id/diet-plans'","put('/:id/diet-plans/:planId/draft'","post('/:id/diet-plans/:planId/publish'"])assert.ok(routes.includes(route));
});

test('published history remains immutable while an explicit duplicate creates a new draft version',()=>{
  assert.match(repo,/status='PUBLISHED',published_at=now\(\)/);
  assert.match(repo,/duplicateExternalDietPlanVersion/);
  assert.match(repo,/values\(\$1,\$2,\$3,\$4,\$5,'DRAFT'/);
});
