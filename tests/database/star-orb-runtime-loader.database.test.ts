import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { ingestHealthObservations } from '../../backend/src/modules/health/health-observations.repository.js';
import { upsertDailyCheckIn } from '../../backend/src/modules/checkins/checkins.repository.js';
import { createAssessmentSession, saveAssessmentResponses, completeAssessmentSession } from '../../backend/src/modules/assessments/assessments.repository.js';
import { pss10Items } from '../../backend/src/modules/assessments/assessment-definitions.js';
import { loadStarOrbRuntimeInputs } from '../../backend/src/modules/intelligence/star-orb-runtime-loader.js';
import { buildCandidateStarOrbRuntimeDay } from '../../backend/src/modules/intelligence/candidate-star-orb-runtime.js';

const TENANT_ID='81000000-0000-4000-8000-000000000001';

test('database loader reads only the authenticated tenant client and fails closed for unavailable goal sources',async()=>{
  await resetBackendStateForTests();
  const userId=randomUUID();const clientId=randomUUID();const profileId=randomUUID();
  await pool.query(`insert into tenants(id,name,slug,tenant_type,status) values($1,'Star Orb QA','star-orb-qa','PRACTICE','active')`,[TENANT_ID]);
  await pool.query(`insert into users(id,name,email_normalized,role,status,account_purpose) values($1,'Star Orb Client',$2,'user','active','QA_TEST')`,[userId,`star-orb-${userId}@example.test`]);
  await pool.query(`insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status) values($1,$2,$3,'CLIENT','active')`,[randomUUID(),TENANT_ID,userId]);
  await pool.query(`insert into fiteatsy_clients(id,tenant_id,fiteatsy_client_id,account_user_id) values($1,$2,$3,$4)`,[clientId,TENANT_ID,`fc_star_${Date.now()}`,userId]);
  await pool.query(`insert into health_profiles(id,user_id,client_id,sleep_goal_hours) values($1,$2,$3,8)`,[profileId,userId,clientId]);
  const owner={accountId:userId,clientId};
  const healthDay=new Date().toISOString().slice(0,10);
  const previousDay=new Date(Date.parse(`${healthDay}T12:00:00.000Z`)-86_400_000).toISOString().slice(0,10);
  await ingestHealthObservations(owner,[
    {metricType:'steps',value:8200,unit:'count',measuredAtISO:`${healthDay}T10:00:00.000Z`,sourceProvider:'qa',sourceRecordId:'steps',syncKey:'qa:steps'},
    {metricType:'active_minutes',value:35,unit:'min',measuredAtISO:`${healthDay}T10:00:00.000Z`,sourceProvider:'qa',sourceRecordId:'active',syncKey:'qa:active'},
    {metricType:'sleep_minutes',value:470,unit:'min',measuredAtISO:`${healthDay}T06:30:00.000Z`,startAtISO:`${previousDay}T22:40:00.000Z`,endAtISO:`${healthDay}T06:30:00.000Z`,sourceProvider:'qa',sourceRecordId:'sleep',syncKey:'qa:sleep'},
    {metricType:'hrv_sdnn_ms',value:52,unit:'ms',measuredAtISO:`${healthDay}T07:00:00.000Z`,sourceProvider:'qa',sourceRecordId:'hrv',syncKey:'qa:hrv'},
    {metricType:'resting_heart_rate',value:61,unit:'bpm',measuredAtISO:`${healthDay}T07:00:00.000Z`,sourceProvider:'qa',sourceRecordId:'rhr',syncKey:'qa:rhr'}
  ]);
  await upsertDailyCheckIn(owner,{dateISO:healthDay,mood:4,energy:4,sleepQuality:4});
  const session=await createAssessmentSession(owner);
  await saveAssessmentResponses(owner,session.id,pss10Items.map(item=>({itemId:item.id,selectedValue:2})));
  await completeAssessmentSession(owner,session.id);

  const loaded=await loadStarOrbRuntimeInputs(userId,healthDay,{tenantId:TENANT_ID,timezone:'Asia/Kolkata'});
  assert.equal(loaded.owner.clientId,clientId);
  assert.equal(loaded.observations.length,5);
  assert.equal(loaded.goals.find(goal=>goal.kind==='sleep_minutes')?.value,480);
  assert.equal(loaded.mind[0]?.moodCheckIns[0],4);
  assert.equal(loaded.mind[0]?.completedSessions,null);
  assert.equal(loaded.assessments[0]?.kind,'PSS_10');
  assert.equal(loaded.sourceCoverage.activityGoals.status,'UNAVAILABLE');
  const result=buildCandidateStarOrbRuntimeDay(loaded,healthDay);
  assert.equal(result.activity.score,null);
  assert.ok(result.activity.inputsMissing.includes('step_goal'));
  await assert.rejects(loadStarOrbRuntimeInputs(userId,healthDay,{tenantId:'82000000-0000-4000-8000-000000000001',timezone:'Asia/Kolkata'}),/AUTHENTICATED_CLIENT_NOT_FOUND/);
});
