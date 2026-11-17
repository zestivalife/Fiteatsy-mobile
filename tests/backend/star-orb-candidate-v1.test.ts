import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateActivityBalanceCandidate, calculateActivityCandidate, calculateCalmCandidate,
  calculateMindCandidate, calculateNourishmentCandidate, calculateRecoveryCandidate,
  calculateSevenDayRecoveryCandidate, calculateSleepCandidate, resolveGovernedGoal
} from '../../packages/health-intelligence/dist/index.js';

const calculatedAt='2026-11-17T12:00:00.000Z';
const resolved=(value:number)=>({value,source:'USER' as const,status:'RESOLVED' as const,reason:'fixture'});
const loads=[50,50,50,50,50,50,50,55,55,55,55,55,55,55];
const rests=[80,80,80,80,80,80,80];
const nights=Array.from({length:7},(_,index)=>({asleepMinutes:450,opportunityMinutes:480,deepMinutes:90,remMinutes:100,bedtimeLocalMinute:1380+index*2,wakeLocalMinute:420+index*2}));

const completeScores=()=>{
  const sleep=calculateSleepCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'CURRENT',target:resolved(480),nights});
  const activityBalance=calculateActivityBalanceCandidate({dailyActivityLoad:loads,dailyRecoveryOrRest:rests}).value;
  return {
    activity:calculateActivityCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'CURRENT',steps:8000,exerciseMinutes:30,stepGoal:resolved(10000),exerciseGoal:resolved(30),dailyActivityLoad:loads,dailyRecoveryOrRest:rests}),
    sleep,
    nourishment:calculateNourishmentCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'CURRENT',proteinGrams:90,proteinTarget:resolved(100),hydrationMl:2000,hydrationTarget:resolved(2500),foodQualityDimensions:[80,90],approvedClinicalMarkerScores:[75,85]}),
    calm:calculateCalmCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'CURRENT',hrvType:'SDNN',currentHrv:55,hrvBaselineSameType:50,hrvHistoryDays:28,stressAssessment:{score:10,minimum:0,maximum:40,validatedScale:'PSS-10'},mindfulnessMinutes:15,mindfulnessGoal:resolved(20)}),
    mind:calculateMindCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'CURRENT',moodCheckIns:[70,80],validatedWellbeingScore:80,completedSessions:3,sessionGoal:resolved(4),emotionalWellbeingHistory:[70,72,74,76,78,80,82]}),
    recovery:calculateRecoveryCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'CURRENT',sleep,activityBalance,currentHrv:55,hrvBaselineSameType:50,currentRestingHeartRate:58,restingHeartRateBaseline:60,baselineDays:28,sleepBehaviour:90,activityDistribution:95,mindfulnessPractice:75,explicitLifestyleHabits:[80,90]})
  };
};

test('candidate golden fixture calculates every visible domain and central Recovery',()=>{
  const actual=completeScores();
  assert.deepEqual(Object.fromEntries(Object.entries(actual).map(([key,value])=>[key,value.score])),{
    activity:89.4,sleep:95.68,nourishment:84,calm:69,mind:78.85,recovery:86.25
  });
  for(const result of Object.values(actual)){
    assert.equal(result.status,'CALCULATED');
    assert.equal(result.activation,'CANDIDATE_ONLY');
    assert.equal(result.clinicalValidation,'PENDING');
    assert.equal(result.methodologyVersion,'1.0.0-candidate.1');
  }
});

test('goal resolver honours governed precedence and rejects display-only or invalid values',()=>{
  const timestamp='2026-11-01T00:00:00.000Z';
  const result=resolveGovernedGoal({
    user:{value:10000,source:'USER',active:false,approved:true,updatedAt:timestamp},
    consultant:{value:8000,source:'CONSULTANT',active:true,approved:true,updatedAt:timestamp},
    productDefault:{value:10000,source:'PRODUCT_DEFAULT',active:true,approved:true,updatedAt:timestamp}
  },{min:1000,max:50000});
  assert.deepEqual([result.value,result.source,result.status],[8000,'CONSULTANT','RESOLVED']);
  assert.equal(resolveGovernedGoal({productDefault:{value:10000,source:'PRODUCT_DEFAULT',active:true,approved:false,updatedAt:timestamp}},{min:1000,max:50000}).status,'GOAL_REQUIRED');
});

test('missing logs, goals, baselines, and clinical marker methods never become zero',()=>{
  const nourishment=calculateNourishmentCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'CURRENT',proteinGrams:0,proteinTarget:resolved(100),hydrationMl:0,hydrationTarget:resolved(2500),foodQualityDimensions:[],approvedClinicalMarkerScores:[]});
  assert.equal(nourishment.score,null);assert.equal(nourishment.status,'INSUFFICIENT_DATA');
  const activity=calculateActivityCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'CURRENT',steps:8000,exerciseMinutes:30,stepGoal:{value:null,source:null,status:'GOAL_REQUIRED',reason:'none'},exerciseGoal:resolved(30),dailyActivityLoad:loads,dailyRecoveryOrRest:rests});
  assert.equal(activity.score,null);assert.ok(activity.inputsMissing.includes('step_goal'));
  const invalidNights=nights.map(night=>({...night,asleepMinutes:0,deepMinutes:0,remMinutes:0}));
  const sleep=calculateSleepCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'CURRENT',target:resolved(480),nights:invalidNights});
  assert.equal(sleep.score,null);assert.ok(sleep.inputsMissing.includes('valid_sleep_stages'));
});

test('HRV baseline remains source-type specific and stale complete data is explicit',()=>{
  const calm=calculateCalmCandidate({healthDay:'2026-11-17',calculatedAt,freshness:'STALE',hrvType:'RMSSD',currentHrv:40,hrvBaselineSameType:35,hrvHistoryDays:28,stressAssessment:{score:8,minimum:0,maximum:40,validatedScale:'PSS-10'},mindfulnessMinutes:20,mindfulnessGoal:resolved(20)});
  assert.equal(calm.status,'STALE');assert.equal(calm.confidence,'LOW');assert.ok(calm.inputsUsed.includes('hrv_rmssd'));
});

test('seven-day trend calculates seven independent consecutive health days and preserves gaps',()=>{
  const days=['2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15','2026-11-16','2026-11-17'];
  const trend=calculateSevenDayRecoveryCandidate(days,day=>{
    const base=completeScores().recovery;const index=days.indexOf(day);
    return index===3?{...base,healthDay:day,score:null,status:'INSUFFICIENT_DATA' as const,inputsMissing:['sleep_score']}:{...base,healthDay:day,score:Number((70+index*3).toFixed(2))};
  });
  assert.deepEqual(trend.map(value=>value.score),[70,73,76,null,82,85,88]);
  assert.equal(new Set(trend.map(value=>value.healthDay)).size,7);
  assert.throws(()=>calculateSevenDayRecoveryCandidate([...days.slice(0,6),days[5]],()=>completeScores().recovery),/distinct/);
});
