import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { listGovernedGoals, reviseGovernedGoal } from '../../backend/src/modules/intelligence/governed-goals.repository.js';

const tenantId='83000000-0000-4000-8000-000000000001';
const setup=async()=>{
  await resetBackendStateForTests();const accountId=randomUUID();const clientId=randomUUID();
  await pool.query(`insert into tenants(id,name,slug,tenant_type,status) values($1,'Goal QA','goal-qa','PRACTICE','active')`,[tenantId]);
  await pool.query(`insert into users(id,name,email_normalized,role,status,account_purpose) values($1,'Goal Client',$2,'user','active','QA_TEST')`,[accountId,`goal-${accountId}@example.test`]);
  await pool.query(`insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status) values($1,$2,$3,'CLIENT','active')`,[randomUUID(),tenantId,accountId]);
  await pool.query(`insert into fiteatsy_clients(id,tenant_id,fiteatsy_client_id,account_user_id) values($1,$2,$3,$4)`,[clientId,tenantId,`goal_${Date.now()}`,accountId]);
  return {accountId,clientId,tenantId};
};

test('governed goal revisions are serialized, immutable and day-boundary safe',async()=>{
  const owner=await setup();
  const first=await reviseGovernedGoal(owner,{kind:'steps',value:8000,effectiveFrom:'2026-11-18',source:'USER'});
  const duplicate=await reviseGovernedGoal(owner,{kind:'steps',value:8000,effectiveFrom:'2026-11-18',source:'USER'});
  assert.equal(duplicate.id,first.id);
  await assert.rejects(reviseGovernedGoal(owner,{kind:'steps',value:9000,effectiveFrom:'2026-11-18',source:'USER'}),/GOAL_SAME_DAY_REVISION_CONFLICT/);
  await assert.rejects(reviseGovernedGoal(owner,{kind:'steps',value:7000,effectiveFrom:'2026-11-17',source:'USER'}),/GOAL_BACKDATED_REVISION_REJECTED/);
  await reviseGovernedGoal(owner,{kind:'steps',value:9000,effectiveFrom:'2026-11-20',source:'USER'});
  const rows=await listGovernedGoals(owner);assert.equal(rows.length,2);
  assert.equal(rows[0].effective_through instanceof Date?rows[0].effective_through.toISOString().slice(0,10):String(rows[0].effective_through).slice(0,10),'2026-11-19');assert.equal(rows[0].status,'superseded');
  assert.equal(rows[1].status,'active');assert.equal(Number(rows[1].revision),2);
});

test('concurrent initial goal requests converge without duplicate active history and remain tenant scoped',async()=>{
  const owner=await setup();
  const results=await Promise.all([
    reviseGovernedGoal(owner,{kind:'exercise_minutes',value:30,effectiveFrom:'2026-11-18',source:'USER'}),
    reviseGovernedGoal(owner,{kind:'exercise_minutes',value:30,effectiveFrom:'2026-11-18',source:'USER'})
  ]);
  assert.equal(results[0].id,results[1].id);assert.equal((await listGovernedGoals(owner)).length,1);
  assert.equal((await listGovernedGoals({...owner,tenantId:'84000000-0000-4000-8000-000000000001'})).length,0);
});
