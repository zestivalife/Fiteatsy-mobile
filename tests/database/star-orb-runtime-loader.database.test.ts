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
import { buildCandidateStarOrbRuntimeWindow } from '../../backend/src/modules/intelligence/candidate-star-orb-runtime.js';
import { addHealthEvent, createCareCaseIfMissing } from '../../backend/src/modules/platform/platform.store.js';
import { reviseGovernedGoal } from '../../backend/src/modules/intelligence/governed-goals.repository.js';

test('database loader reads only the authenticated tenant client and fails closed for unavailable goal sources',async()=>{
  await resetBackendStateForTests();
  const userId=randomUUID();const clientId=randomUUID();const profileId=randomUUID();const tenantId=randomUUID();
  await pool.query(`insert into tenants(id,name,slug,tenant_type,status) values($1,'Star Orb QA',$2,'PRACTICE','active')`,[tenantId,`star-orb-qa-${tenantId}`]);
  await pool.query(`insert into users(id,name,email_normalized,role,status,account_purpose) values($1,'Star Orb Client',$2,'user','active','QA_TEST')`,[userId,`star-orb-${userId}@example.test`]);
  await pool.query(`insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status) values($1,$2,$3,'CLIENT','active')`,[randomUUID(),tenantId,userId]);
  await pool.query(`insert into fiteatsy_clients(id,tenant_id,fiteatsy_client_id,account_user_id) values($1,$2,$3,$4)`,[clientId,tenantId,`fc_star_${Date.now()}`,userId]);
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

  const loaded=await loadStarOrbRuntimeInputs(userId,healthDay,{tenantId,timezone:'Asia/Kolkata'});
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

test('persisted observations, governed goals and explicit lifestyle events calculate seven independent Recovery days',async()=>{
  await resetBackendStateForTests();const tenantId=randomUUID();const userId=randomUUID();const clientId=randomUUID();const profileId=randomUUID();
  await pool.query(`insert into tenants(id,name,slug,tenant_type,status) values($1,'Recovery QA',$2,'PRACTICE','active')`,[tenantId,`recovery-qa-${tenantId}`]);
  await pool.query(`insert into users(id,name,email_normalized,role,status,account_purpose) values($1,'Recovery Client',$2,'user','active','QA_TEST')`,[userId,`recovery-${userId}@example.test`]);
  await pool.query(`insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status) values($1,$2,$3,'CLIENT','active')`,[randomUUID(),tenantId,userId]);
  await pool.query(`insert into fiteatsy_clients(id,tenant_id,fiteatsy_client_id,account_user_id) values($1,$2,$3,$4)`,[clientId,tenantId,`fc_recovery_${Date.now()}`,userId]);
  const through=new Date().toISOString().slice(0,10);const shift=(offset:number)=>new Date(Date.parse(`${through}T12:00:00.000Z`)+offset*86_400_000).toISOString().slice(0,10);
  await pool.query(`insert into health_profiles(id,user_id,client_id,sleep_goal_hours,created_at,updated_at) values($1,$2,$3,8,$4,$4)`,[profileId,userId,clientId,`${shift(-40)}T00:00:00.000Z`]);
  const owner={accountId:userId,clientId,tenantId};const careCase=await createCareCaseIfMissing(owner,profileId);
  await reviseGovernedGoal(owner,{kind:'steps',value:10000,effectiveFrom:shift(-40),source:'USER'});await reviseGovernedGoal(owner,{kind:'exercise_minutes',value:30,effectiveFrom:shift(-40),source:'USER'});await reviseGovernedGoal(owner,{kind:'mind_sessions',value:4,effectiveFrom:shift(-40),source:'USER'});
  const observations=[] as Parameters<typeof ingestHealthObservations>[1];
  for(let offset=-34;offset<=0;offset+=1){const day=shift(offset);const index=offset+34;const end=`${day}T06:30:00.000Z`;const start=new Date(Date.parse(end)-480*60_000).toISOString();const add=(metricType:string,value:number,unit:string,extra:Record<string,unknown>={})=>observations.push({metricType,value,unit,measuredAtISO:end,sourceProvider:'qa',sourceRecordId:`${metricType}:${day}`,syncKey:`qa:${metricType}:${day}`,...extra} as never);
    add('steps',7000+index*100,'count');add('active_minutes',20+index%11,'min');add('hrv_sdnn_ms',45+index*.3,'ms');add('resting_heart_rate',64-index*.08,'bpm');add('mindfulness_minutes',20,'min');add('sleep_minutes',430+index%25,'min',{startAtISO:start,endAtISO:end});add('sleep_deep_minutes',82+index%5,'min',{startAtISO:new Date(Date.parse(start)+120*60_000).toISOString(),endAtISO:new Date(Date.parse(start)+204*60_000).toISOString()});add('sleep_rem_minutes',95+index%5,'min',{startAtISO:new Date(Date.parse(start)+300*60_000).toISOString(),endAtISO:new Date(Date.parse(start)+397*60_000).toISOString()});}
  await ingestHealthObservations({accountId:userId,clientId},observations);
  const habits=['consistent_daily_routine','recovery_rest_practice','evening_screen_boundary','outdoor_daylight_routine'];
  for(let offset=-6;offset<=0;offset+=1)for(const [index,habitType] of habits.entries())await addHealthEvent({careCaseId:careCase.id,userId,type:'lifestyle_habit_recorded' as never,summary:'lifestyle habit recorded',payload:{contractVersion:'LIFESTYLE_BALANCE_V1_PROPOSAL',habitType,healthDay:shift(offset),completed:index!==2,revision:1,recordStatus:'active',source:'mobile.tracker',schemaVersion:1},replayKey:`${careCase.id}:${shift(offset)}:${habitType}`,eventTimeISO:`${shift(offset)}T12:00:00.000Z`});
  for(let offset=-6;offset<=0;offset+=1)await upsertDailyCheckIn({accountId:userId,clientId},{dateISO:shift(offset),mood:4,energy:4,sleepQuality:4});
  for(let offset=-3;offset<=0;offset+=1)await addHealthEvent({careCaseId:careCase.id,userId,type:'focus_session_completed' as never,summary:'focus completed',payload:{status:'completed',healthDay:shift(offset),durationMinutes:10},replayKey:`${careCase.id}:focus:${shift(offset)}`,eventTimeISO:`${shift(offset)}T13:00:00.000Z`});
  const loaded=await loadStarOrbRuntimeInputs(userId,through,{tenantId,timezone:'UTC'});assert.equal(loaded.lifestyle.length,7);assert.equal(loaded.sourceCoverage.lifestyle.status,'INTEGRATED');
  const window=buildCandidateStarOrbRuntimeWindow(loaded,through);assert.equal(window.days.length,7);assert.deepEqual(window.days.map(day=>day.recovery.score),[80.84,81.36,81.13,80.7,80.31,80.28,80.28]);assert.equal(window.days.at(-1)?.proposals.selfReportedMindWellness.score,85);
  for(const day of window.days){assert.equal(day.recovery.inputsMissing.length,0);assert.equal(day.recovery.contributingFactors.some(item=>item.startsWith('Lifestyle ')),true);}
});
