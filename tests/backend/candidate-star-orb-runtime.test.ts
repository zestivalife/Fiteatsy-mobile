import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCandidateStarOrbRuntimeDay,
  buildCandidateStarOrbRuntimeWindow,
  CANDIDATE_RUNTIME_ACTIVATION,
  type CandidateRuntimeRepositories,
  type RuntimeGoal
} from '../../backend/src/modules/intelligence/candidate-star-orb-runtime.js';
import { buildHealthIntelligenceV1 } from '../../backend/src/modules/intelligence/health-intelligence-projection.js';
import type { CanonicalObservation } from '../../packages/health-intelligence/dist/index.js';

const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const through='2026-11-17';
const shifted=(offset:number)=>new Date(Date.parse(`${through}T12:00:00.000Z`)+offset*86_400_000).toISOString().slice(0,10);
const goals:RuntimeGoal[]=[
  ['steps',10000],['exercise_minutes',30],['sleep_minutes',480],['protein_grams',100],['hydration_ml',2500],['mindfulness_minutes',20],['mind_sessions',4]
].map(([kind,value])=>({kind:kind as RuntimeGoal['kind'],value:Number(value),source:'USER',active:true,approved:true,updatedAt:'2026-10-01T00:00:00.000Z',effectiveFrom:'2026-10-01'}));

const observations:CanonicalObservation[]=[];
for(let offset=-34;offset<=0;offset+=1){
  const day=shifted(offset);const sequence=offset+34;const end=`${day}T06:30:00.000Z`;const start=new Date(Date.parse(end)-480*60_000).toISOString();
  const add=(metricType:string,value:number,unit:string,at=`${day}T12:00:00.000Z`,extra:Partial<CanonicalObservation>={})=>observations.push({id:`${metricType}-${day}`,metricType,value,unit,measuredAtISO:at,sourceProvider:'apple_health',sourceRecordId:`${metricType}-${day}`,syncKey:`${metricType}-${day}`,timezoneOffsetMinutes:0,...extra});
  add('steps',7000+sequence*100,'count');add('active_minutes',20+sequence%11,'min');add('hydration_ml',1900+sequence*10,'ml');add('mindfulness_minutes',10+sequence%8,'min');
  add('hrv_sdnn_ms',45+sequence*.3,'ms');add('resting_heart_rate',64-sequence*.08,'bpm');
  add('sleep_minutes',430+sequence%25,'min',end,{startAtISO:start,endAtISO:end});
  add('sleep_deep_minutes',82+sequence%5,'min',end,{startAtISO:new Date(Date.parse(start)+120*60_000).toISOString(),endAtISO:new Date(Date.parse(start)+204*60_000).toISOString()});
  add('sleep_rem_minutes',95+sequence%5,'min',end,{startAtISO:new Date(Date.parse(start)+300*60_000).toISOString(),endAtISO:new Date(Date.parse(start)+397*60_000).toISOString()});
}

const repositories:CandidateRuntimeRepositories={
  observations,goals,fallbackOffsetMinutes:0,nowISO:'2026-11-17T13:00:00.000Z',
  nutrition:Array.from({length:7},(_,index)=>({healthDay:shifted(index-6),complete:true,proteinGrams:82+index*2,foodQualityDimensions:[76+index,82+index],foodQualityStatus:'PROPOSAL_ONLY' as const,foodQualityReason:'NON_DIAGNOSTIC_CONSUMED_FOOD_PROJECTION',approvedClinicalMarkerScores:[78+index]})),
  assessments:Array.from({length:7},(_,index)=>[
    {healthDay:shifted(index-6),kind:'PSS_10' as const,score:14-index,minimum:0,maximum:40,validated:true},
    {healthDay:shifted(index-6),kind:'WELLBEING' as const,score:62+index*2,minimum:0,maximum:100,validated:true}
  ]).flat(),
  mind:Array.from({length:7},(_,index)=>({healthDay:shifted(index-6),moodCheckIns:[3+index%2,4],completedSessions:2+index%3,emotionalWellbeing:[3,3,4,4,4,5,4]})),
  lifestyle:[]
};

test('runtime adapters calculate eligible domains and Recovery stays partial without genuine lifestyle habits',()=>{
  const result=buildCandidateStarOrbRuntimeDay(repositories,through);
  const values=Object.fromEntries(Object.entries(result).filter(([key])=>key!=='healthDay'&&key!=='proposals').map(([key,value])=>[key,(value as {score:number|null}).score]));
  assert.deepEqual(values,{activity:86.27,sleep:94.88,nourishment:87.92,calm:65.42,mind:66.8,recovery:80.87});
  assert.ok(result.recovery.inputsMissing.includes('explicit_lifestyle_habits'));
  assert.equal(result.recovery.status,'PARTIAL');
  for(const [key,value] of Object.entries(result).filter(([key,value])=>key!=='proposals'&&typeof value==='object'))assert.equal((value as {activation:string}).activation,'CANDIDATE_ONLY');
  assert.equal(result.proposals.everydayNourishment.status,'PROPOSAL_ONLY');
  assert.equal(result.proposals.selfReportedMindWellness.status,'PROPOSAL_ONLY');
});

test('runtime Recovery consumes complete explicit lifestyle records without inferring omitted habits',()=>{
  const complete={...repositories,lifestyle:Array.from({length:7},(_,index)=>({healthDay:shifted(index-6),habitScores:[100,100,0,100]}))};
  assert.deepEqual(buildCandidateStarOrbRuntimeWindow(complete,through).days.map(day=>day.recovery.score),[80.84,81.36,81.13,80.7,80.31,80.28,80.28]);
  const current=buildCandidateStarOrbRuntimeDay(complete,'2026-11-17');
  assert.equal(current.recovery.inputsMissing.includes('explicit_lifestyle_habits'),false);
  assert.equal(typeof current.recovery.score,'number');
  const omitted={...complete,lifestyle:complete.lifestyle.map(row=>row.healthDay==='2026-11-17'?{...row,habitScores:[]}:row)};
  const omittedDay=buildCandidateStarOrbRuntimeDay(omitted,'2026-11-17');
  assert.equal(omittedDay.recovery.score,80.87);
  assert.equal(omittedDay.recovery.status,'PARTIAL');
});

test('seven-day runtime window preserves seven distinct truthful partial calculations',()=>{
  const result=buildCandidateStarOrbRuntimeWindow(repositories,through);
  assert.equal(result.activation,CANDIDATE_RUNTIME_ACTIVATION);assert.equal(result.days.length,7);
  assert.equal(new Set(result.days.map(day=>day.healthDay)).size,7);
  assert.deepEqual(result.days.map(day=>day.recovery.score),[81.49,82.06,81.81,81.33,80.9,80.87,80.87]);
});

test('missing governed inputs fail closed and candidate values do not leak into production projection',()=>{
  const missing=buildCandidateStarOrbRuntimeDay({...repositories,goals:[]},through);
  assert.equal(missing.activity.score,null);assert.ok(missing.activity.inputsMissing.includes('step_goal'));
  assert.equal(missing.sleep.score,100);assert.equal(missing.sleep.status,'PARTIAL');
  assert.equal(missing.nourishment.score,84.55);assert.equal(missing.nourishment.status,'PARTIAL');
  assert.ok(missing.sleep.inputsMissing.includes('sleep_target'));
  assert.ok(missing.nourishment.inputsMissing.includes('protein_with_governed_target'));
  const production=buildHealthIntelligenceV1(observations.map((item,index)=>({...item,id:item.id??String(index),userId:'u',clientId:'c',qualityStatus:'accepted',createdAtISO:item.measuredAtISO,providerUpdatedAtISO:null,providerVersion:null,deletedAtISO:null,sourceMetadata:item.sourceMetadata??null,startAtISO:item.startAtISO??null,endAtISO:item.endAtISO??null})) as never,through);
  assert.equal(production.scores.recovery.score,null);assert.equal(production.scores.recovery.status,'METHODOLOGY_PENDING');
});

test('sealed Home binds each visible node to its matching production canonical domain',()=>{
  const source=readFileSync(resolve(repositoryRoot,'src/screens/home/HomeScreen.tsx'),'utf8');
  for(const domain of ['activity','sleep','nutrition','calm','mind','recovery']) {
    assert.ok(source.includes(`health.candidateIntelligence?.scores.${domain}.score ?? health.canonicalIntelligence?.scores.${domain}.score`));
  }
  const routes=readFileSync(resolve(repositoryRoot,'backend/src/modules/intelligence/intelligence.routes.ts'),'utf8');
  assert.ok(routes.includes("intelligenceRouter.get('/candidate-validation'"));
  assert.ok(routes.includes('candidateValidationEnabled()'));
});
