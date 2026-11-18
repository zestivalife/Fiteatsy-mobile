import {
  aggregateCanonicalHealthObservations,
  calculateActivityBalanceCandidate,
  calculateActivityCandidate,
  calculateCalmCandidate,
  calculateMindCandidate,
  calculateNourishmentCandidate,
  calculateRecoveryCandidate,
  calculateSevenDayRecoveryCandidate,
  calculateSleepCandidate,
  resolveGovernedGoal,
  evaluateEverydayNutritionProposal,
  evaluateSelfReportedMindWellnessProposal,
  type CandidateStarOrbScore,
  type CanonicalObservation,
  type GoalSource,
  type GovernedGoal,
  type SleepNight
} from '@fiteatsy/health-intelligence';

export const CANDIDATE_RUNTIME_ACTIVATION = 'ISOLATED_VALIDATION_ONLY' as const;

export type RuntimeGoal = GovernedGoal & {
  kind:'steps'|'exercise_minutes'|'sleep_minutes'|'protein_grams'|'hydration_ml'|'mindfulness_minutes'|'mind_sessions';
  effectiveFrom:string;effectiveThrough?:string|null;
};
export type RuntimeNutritionDay={healthDay:string;complete:boolean;proteinGrams:number;foodQualityDimensions:number[];foodQualityStatus:'PROPOSAL_ONLY'|'UNAVAILABLE';foodQualityReason:string;approvedClinicalMarkerScores:number[]};
export type RuntimeAssessment={healthDay:string;kind:'PSS_10'|'WELLBEING';score:number;minimum:number;maximum:number;validated:boolean};
export type RuntimeMindDay={healthDay:string;moodCheckIns:number[];completedSessions:number|null;emotionalWellbeing:number[]};
export type RuntimeLifestyleDay={healthDay:string;habitScores:number[]};
export type CandidateRuntimeRepositories={
  observations:CanonicalObservation[];goals:RuntimeGoal[];nutrition:RuntimeNutritionDay[];
  assessments:RuntimeAssessment[];mind:RuntimeMindDay[];lifestyle:RuntimeLifestyleDay[];fallbackOffsetMinutes:number;nowISO:string;
};
export type CandidateRuntimeDay={healthDay:string;activity:CandidateStarOrbScore;sleep:CandidateStarOrbScore;nourishment:CandidateStarOrbScore;calm:CandidateStarOrbScore;mind:CandidateStarOrbScore;recovery:CandidateStarOrbScore;proposals:{everydayNourishment:ReturnType<typeof evaluateEverydayNutritionProposal>;selfReportedMindWellness:ReturnType<typeof evaluateSelfReportedMindWellnessProposal>}};

const dayMs=86_400_000;
const dayShift=(day:string,offset:number)=>new Date(Date.parse(`${day}T12:00:00.000Z`)+offset*dayMs).toISOString().slice(0,10);
const minuteOfLocalDay=(iso:string,offset:number)=>{const local=new Date(Date.parse(iso)+offset*60_000);return local.getUTCHours()*60+local.getUTCMinutes();};
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const clamp=(value:number)=>Math.max(0,Math.min(100,value));
const mean=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/values.length;
const scale=(value:number,minimum:number,maximum:number)=>clamp((value-minimum)/(maximum-minimum)*100);

const goalFor=(goals:RuntimeGoal[],kind:RuntimeGoal['kind'],healthDay:string,limits:{min:number;max:number})=>{
  const eligible=goals.filter(goal=>goal.kind===kind&&goal.effectiveFrom<=healthDay&&(!goal.effectiveThrough||goal.effectiveThrough>=healthDay));
  const latest=(source:GoalSource)=>eligible.filter(goal=>goal.source===source).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]??null;
  return resolveGovernedGoal({user:latest('USER'),consultant:latest('CONSULTANT'),productDefault:latest('PRODUCT_DEFAULT')},limits);
};

const metric=(aggregates:ReturnType<typeof aggregateCanonicalHealthObservations>,healthDay:string,metricType:string)=>
  aggregates.find(row=>row.healthDay===healthDay&&row.metricType===metricType)?.value??null;

const sleepNights=(repositories:CandidateRuntimeRepositories,throughDay:string):SleepNight[]=>{
  const firstDay=dayShift(throughDay,-6);const sessions=repositories.observations.filter(row=>row.metricType==='sleep_minutes'&&row.startAtISO&&row.endAtISO)
    .filter(row=>{const wakeDay=new Date(Date.parse(row.endAtISO!)+(row.timezoneOffsetMinutes??repositories.fallbackOffsetMinutes)*60_000).toISOString().slice(0,10);return wakeDay>=firstDay&&wakeDay<=throughDay;});
  const byDay=new Map<string,CanonicalObservation[]>();sessions.forEach(row=>{const offset=row.timezoneOffsetMinutes??repositories.fallbackOffsetMinutes;const day=new Date(Date.parse(row.endAtISO!)+offset*60_000).toISOString().slice(0,10);byDay.set(day,[...(byDay.get(day)??[]),row]);});
  return [...byDay.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,rows])=>{
    const offset=rows.at(-1)?.timezoneOffsetMinutes??repositories.fallbackOffsetMinutes;
    const starts=rows.map(row=>Date.parse(row.startAtISO!));const ends=rows.map(row=>Date.parse(row.endAtISO!));
    const start=new Date(Math.min(...starts)).toISOString();const end=new Date(Math.max(...ends)).toISOString();
    const asleep=rows.filter(row=>row.metricType==='sleep_minutes').reduce((sum,row)=>sum+row.value,0);
    const stage=(type:string)=>repositories.observations.filter(row=>row.metricType===type&&row.endAtISO&&new Date(Date.parse(row.endAtISO)+offset*60_000).toISOString().slice(0,10)===new Date(Date.parse(end)+offset*60_000).toISOString().slice(0,10)).reduce((sum,row)=>sum+row.value,0);
    return {asleepMinutes:asleep,opportunityMinutes:(Math.max(...ends)-Math.min(...starts))/60_000,deepMinutes:stage('sleep_deep_minutes'),remMinutes:stage('sleep_rem_minutes'),bedtimeLocalMinute:minuteOfLocalDay(start,offset),wakeLocalMinute:minuteOfLocalDay(end,offset)};
  });
};

export const buildCandidateStarOrbRuntimeDay=(repositories:CandidateRuntimeRepositories,healthDay:string):CandidateRuntimeDay=>{
  const aggregates=aggregateCanonicalHealthObservations(repositories.observations,{fallbackOffsetMinutes:repositories.fallbackOffsetMinutes,nowMs:Date.parse(repositories.nowISO)});
  const freshness=Date.parse(repositories.nowISO)-Date.parse(`${healthDay}T23:59:59.999Z`)>36*60*60_000?'STALE':'CURRENT';
  const steps=metric(aggregates,healthDay,'steps');const exercise=metric(aggregates,healthDay,'active_minutes')??metric(aggregates,healthDay,'workout_minutes');
  const activityLoads=Array.from({length:14},(_,index)=>{const day=dayShift(healthDay,index-13);const s=metric(aggregates,day,'steps');const e=metric(aggregates,day,'active_minutes')??metric(aggregates,day,'workout_minutes');const sg=goalFor(repositories.goals,'steps',day,{min:1000,max:50000});const eg=goalFor(repositories.goals,'exercise_minutes',day,{min:5,max:300});return s==null||e==null||sg.value==null||eg.value==null?NaN:clamp(s/sg.value*50+e/eg.value*50);});
  const rest=Array.from({length:7},(_,index)=>{const day=dayShift(healthDay,index-6);const asleep=metric(aggregates,day,'sleep_minutes');const target=goalFor(repositories.goals,'sleep_minutes',day,{min:360,max:600});return asleep==null||target.value==null?NaN:clamp(asleep/target.value*100);});
  const activity=calculateActivityCandidate({healthDay,calculatedAt:repositories.nowISO,freshness,steps:steps??NaN,exerciseMinutes:exercise??NaN,stepGoal:goalFor(repositories.goals,'steps',healthDay,{min:1000,max:50000}),exerciseGoal:goalFor(repositories.goals,'exercise_minutes',healthDay,{min:5,max:300}),dailyActivityLoad:activityLoads,dailyRecoveryOrRest:rest});
  const nights=sleepNights(repositories,healthDay);const sleep=calculateSleepCandidate({healthDay,calculatedAt:repositories.nowISO,freshness,target:goalFor(repositories.goals,'sleep_minutes',healthDay,{min:360,max:600}),nights});
  const nutrition=repositories.nutrition.find(row=>row.healthDay===healthDay&&row.complete);const nourishment=calculateNourishmentCandidate({healthDay,calculatedAt:repositories.nowISO,freshness,proteinGrams:nutrition?.proteinGrams??NaN,proteinTarget:goalFor(repositories.goals,'protein_grams',healthDay,{min:20,max:300}),hydrationMl:metric(aggregates,healthDay,'hydration_ml')??NaN,hydrationTarget:goalFor(repositories.goals,'hydration_ml',healthDay,{min:500,max:6000}),foodQualityDimensions:nutrition?.foodQualityDimensions??[],approvedClinicalMarkerScores:nutrition?.approvedClinicalMarkerScores??[]});
  const hrvType=metric(aggregates,healthDay,'hrv_sdnn_ms')!=null?'SDNN' as const:'RMSSD' as const;const hrvMetric=hrvType==='SDNN'?'hrv_sdnn_ms':'hrv_rmssd_ms';const hrvHistory=Array.from({length:28},(_,index)=>metric(aggregates,dayShift(healthDay,index-28),hrvMetric)).filter(finite);const currentHrv=metric(aggregates,healthDay,hrvMetric);const pss=repositories.assessments.find(row=>row.healthDay===healthDay&&row.kind==='PSS_10'&&row.validated);const calm=calculateCalmCandidate({healthDay,calculatedAt:repositories.nowISO,freshness,hrvType,currentHrv:currentHrv??NaN,hrvBaselineSameType:hrvHistory.length?mean(hrvHistory):NaN,hrvHistoryDays:hrvHistory.length,stressAssessment:{score:pss?.score??NaN,minimum:pss?.minimum??0,maximum:pss?.maximum??0,validatedScale:pss?'PSS-10':''},mindfulnessMinutes:metric(aggregates,healthDay,'mindfulness_minutes')??NaN,mindfulnessGoal:goalFor(repositories.goals,'mindfulness_minutes',healthDay,{min:1,max:180})});
  const mindDay=repositories.mind.find(row=>row.healthDay===healthDay);const wellbeing=repositories.assessments.find(row=>row.healthDay===healthDay&&row.kind==='WELLBEING'&&row.validated);const mind=calculateMindCandidate({healthDay,calculatedAt:repositories.nowISO,freshness,moodCheckIns:mindDay?.moodCheckIns.map(value=>scale(value,1,5))??[],validatedWellbeingScore:wellbeing?scale(wellbeing.score,wellbeing.minimum,wellbeing.maximum):NaN,completedSessions:mindDay?.completedSessions??NaN,sessionGoal:goalFor(repositories.goals,'mind_sessions',healthDay,{min:1,max:20}),emotionalWellbeingHistory:mindDay?.emotionalWellbeing.map(value=>scale(value,1,5))??[]});
  const activityBalance=calculateActivityBalanceCandidate({dailyActivityLoad:activityLoads,dailyRecoveryOrRest:rest}).value;const rhrHistory=Array.from({length:28},(_,index)=>metric(aggregates,dayShift(healthDay,index-28),'resting_heart_rate')).filter(finite);const currentRhr=metric(aggregates,healthDay,'resting_heart_rate');const lifestyle=repositories.lifestyle.find(row=>row.healthDay===healthDay);const recovery=calculateRecoveryCandidate({healthDay,calculatedAt:repositories.nowISO,freshness,sleep,activityBalance,currentHrv:currentHrv??NaN,hrvBaselineSameType:hrvHistory.length?mean(hrvHistory):NaN,currentRestingHeartRate:currentRhr??NaN,restingHeartRateBaseline:rhrHistory.length?mean(rhrHistory):NaN,baselineDays:Math.min(hrvHistory.length,rhrHistory.length),sleepBehaviour:sleep.score??NaN,activityDistribution:activityBalance??NaN,mindfulnessPractice:metric(aggregates,healthDay,'mindfulness_minutes')??NaN,explicitLifestyleHabits:lifestyle?.habitScores??[]});
  const proteinTarget=goalFor(repositories.goals,'protein_grams',healthDay,{min:20,max:300}).value;const hydrationTarget=goalFor(repositories.goals,'hydration_ml',healthDay,{min:500,max:6000}).value;const hydration=metric(aggregates,healthDay,'hydration_ml');
  const everydayNourishment=evaluateEverydayNutritionProposal({protein:nutrition&&proteinTarget?clamp(nutrition.proteinGrams/proteinTarget*100):NaN,hydration:hydration!=null&&hydrationTarget?clamp(hydration/hydrationTarget*100):NaN,foodQuality:nutrition?.foodQualityDimensions.length?mean(nutrition.foodQualityDimensions):NaN});
  const requiredMindDays=Array.from({length:7},(_,index)=>dayShift(healthDay,index-6));
  const recentMind=requiredMindDays.map(day=>repositories.mind.find(row=>row.healthDay===day)??null);
  const moodScores=recentMind.flatMap(row=>row?.moodCheckIns.length?[scale(row.moodCheckIns.at(-1)!,1,5)]:[]);
  const sessionGoal=goalFor(repositories.goals,'mind_sessions',healthDay,{min:1,max:20}).value;
  const selfReportedMindWellness=evaluateSelfReportedMindWellnessProposal({
    moodScores,
    completedSessions:recentMind.reduce((sum,row)=>sum+(row?.completedSessions??0),0),
    // mind_sessions is the explicit goal for this same seven-day proposal
    // interval. Multiplying it by seven would silently change its unit.
    sessionGoal
  });
  return {healthDay,activity,sleep,nourishment,calm,mind,recovery,proposals:{everydayNourishment,selfReportedMindWellness}};
};

export const buildCandidateStarOrbRuntimeWindow=(repositories:CandidateRuntimeRepositories,throughHealthDay:string)=>{
  const days=Array.from({length:7},(_,index)=>dayShift(throughHealthDay,index-6));
  const byDay=new Map(days.map(day=>[day,buildCandidateStarOrbRuntimeDay(repositories,day)]));
  const recovery=calculateSevenDayRecoveryCandidate(days,day=>byDay.get(day)!.recovery);
  return {activation:CANDIDATE_RUNTIME_ACTIVATION,methodologyVersion:recovery[0]?.methodologyVersion??null,days:days.map((day,index)=>({...byDay.get(day)!,recovery:recovery[index]}))};
};
