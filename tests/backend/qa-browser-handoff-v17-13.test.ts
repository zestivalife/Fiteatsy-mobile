import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');

test('fixture-bound browser handoff migration is additive and role constrained',()=>{
  const sql=read('backend/src/db/migrations/0054_fixture_bound_qa_browser_handoffs.sql');
  assert.match(sql,/create table if not exists qa_browser_handoffs/);
  assert.match(sql,/DIET_PARTIAL_PLAN_HYDRATION_E2E/);
  assert.match(sql,/role in \('consultant', 'senior_consultant'\)/);
  assert.match(sql,/qa_fixture_set_id/);
});

test('exchange is atomic, short-lived, fixture-bound and QA-only',()=>{
  const source=read('backend/src/modules/auth/qa-browser-handoff.ts');
  assert.match(source,/3 \* 60 \* 1000/);
  assert.match(source,/30 \* 60 \* 1000/);
  assert.match(source,/for update of h,u,f/);
  assert.match(source,/account_purpose!=='QA_TEST'/);
  assert.match(source,/QA_HANDOFF_ALREADY_CONSUMED/);
  assert.match(source,/QA_CLIENT_ISOLATION_NOT_ESTABLISHED/);
  assert.match(source,/QA_SESSION_REVOKED/);
});

test('server exchange requires a non-browser bootstrap secret and does not log credentials',()=>{
  const routes=read('backend/src/modules/auth/auth.routes.ts');
  const source=read('backend/src/modules/auth/qa-browser-handoff.ts');
  assert.match(routes,/x-qa-bootstrap-secret/);
  assert.doesNotMatch(source,/console\.(log|info|error).*code/);
  assert.doesNotMatch(source,/console\.(log|info|error).*token/);
});
