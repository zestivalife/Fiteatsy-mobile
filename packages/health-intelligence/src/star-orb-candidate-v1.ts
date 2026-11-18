import {
  calculateActivityBalanceCandidate,
  calculateSleepConsistencyCandidate,
  STAR_ORB_METHODOLOGY_ID,
  STAR_ORB_METHODOLOGY_VERSION
} from './methodology-v1.js';

export type StarOrbStatus='CALCULATED'|'PARTIAL'|'INSUFFICIENT_DATA'|'METHODOLOGY_PENDING'|'NOT_APPLICABLE'|'STALE';
export type StarOrbConfidence='LOW'|'MODERATE'|'HIGH';
export type StarOrbScore={
  domain:string;score:number|null;status:StarOrbStatus;methodologyId:string;methodologyVersion:string;
  healthDay:string;calculatedAt:string;confidence:StarOrbConfidence;inputFreshness:string;
  inputsUsed:string[];inputsMissing:string[];contributingFactors:string[];explanation:string;
};
export type CandidateStarOrbScore=StarOrbScore&{activation:'CANDIDATE_ONLY';clinicalValidation:'PENDING'};

export type GoalSource='USER'|'CONSULTANT'|'PRODUCT_DEFAULT';
export type GovernedGoal={value:number;source:GoalSource;active:boolean;approved:boolean;updatedAt:string};
export type GoalResolution={value:number|null;source:GoalSource|null;status:'RESOLVED'|'GOAL_REQUIRED';reason:string};

const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v:number)=>Math.max(0,Math.min(100,v));
const round=(v:number)=>Number(clamp(v).toFixed(2));
const mean=(v:number[])=>v.reduce((s,n)=>s+n,0)/v.length;
const goal=(actual:number,target:number)=>clamp(Math.max(0,actual)/target*100);
const band=(value:number,low:number,high:number,outerLow:number,outerHigh:number)=>
  value>=low&&value<=high?100:value<low?clamp((value-outerLow)/(low-outerLow)*100):clamp((outerHigh-value)/(outerHigh-high)*100);
const confidence=(complete:boolean,history:number,highWindow:number,freshness:string):StarOrbConfidence=>
  freshness==='STALE'?'LOW':complete&&history>=highWindow?'HIGH':complete?'MODERATE':'LOW';
const score=(p:{domain:string;healthDay:string;calculatedAt:string;value:number|null;freshness:string;used:string[];missing:string[];factors:string[];history:number;highWindow:number;explanation:string;status?:StarOrbStatus}):CandidateStarOrbScore=>({
  domain:p.domain,score:p.value==null?null:round(p.value),status:p.status??(p.value==null?'INSUFFICIENT_DATA':p.freshness==='STALE'?'STALE':'CALCULATED'),
  methodologyId:STAR_ORB_METHODOLOGY_ID,methodologyVersion:STAR_ORB_METHODOLOGY_VERSION,healthDay:p.healthDay,calculatedAt:p.calculatedAt,
  confidence:confidence(p.value!=null,p.history,p.highWindow,p.freshness),inputFreshness:p.freshness,inputsUsed:p.used,inputsMissing:p.missing,
  contributingFactors:p.factors,explanation:p.explanation,activation:'CANDIDATE_ONLY',clinicalValidation:'PENDING'
});

export const resolveGovernedGoal=(goals:{user?:GovernedGoal|null;consultant?:GovernedGoal|null;productDefault?:GovernedGoal|null},limits:{min:number;max:number}):GoalResolution=>{
  for(const source of ['user','consultant','productDefault'] as const){const candidate=goals[source];
    if(candidate?.active&&candidate.approved&&finite(candidate.value)&&candidate.value>=limits.min&&candidate.value<=limits.max)
      return {value:candidate.value,source:candidate.source,status:'RESOLVED',reason:`Active approved ${candidate.source.toLowerCase()} goal.`};
  }
  return {value:null,source:null,status:'GOAL_REQUIRED',reason:`No active approved goal in [${limits.min}, ${limits.max}].`};
};

export type CandidateActivityInput={healthDay:string;calculatedAt:string;freshness:string;steps:number;exerciseMinutes:number;stepGoal:GoalResolution;exerciseGoal:GoalResolution;dailyActivityLoad:number[];dailyRecoveryOrRest:number[]};
export const calculateActivityCandidate=(i:CandidateActivityInput):CandidateStarOrbScore=>{
  const balance=calculateActivityBalanceCandidate(i);const missing:string[]=[];
  if(!finite(i.steps))missing.push('steps');if(!finite(i.exerciseMinutes))missing.push('exercise_minutes');if(i.stepGoal.value==null)missing.push('step_goal');if(i.exerciseGoal.value==null)missing.push('exercise_goal');if(balance.value==null)missing.push(...balance.missingDependencies.map(v=>`activity_balance:${v}`));
  const value=missing.length?null:goal(i.steps,i.stepGoal.value!)*.4+goal(i.exerciseMinutes,i.exerciseGoal.value!)*.4+balance.value!*.2;
  return score({domain:'activity',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value,freshness:i.freshness,used:value==null?[]:['steps','exercise_minutes','activity_balance'],missing,factors:value==null?[]:[`Steps ${round(goal(i.steps,i.stepGoal.value!))}`,`Exercise ${round(goal(i.exerciseMinutes,i.exerciseGoal.value!))}`,`Balance ${balance.value}`],history:i.dailyActivityLoad.length,highWindow:28,explanation:value==null?'Candidate Activity requires governed goals and AB-01 history.':'Candidate: Steps 40% + Exercise 40% + AB-01 20%.'});
};

export type SleepNight={asleepMinutes:number;opportunityMinutes:number;deepMinutes:number;remMinutes:number;bedtimeLocalMinute:number;wakeLocalMinute:number};
export const calculateSleepCandidate=(i:{healthDay:string;calculatedAt:string;freshness:string;target:GoalResolution;nights:SleepNight[]}):CandidateStarOrbScore=>{
  const nights=i.nights.slice(-7),today=nights.at(-1);const missing:string[]=[];
  if(!today)missing.push('wake_day_sleep');if(i.target.value==null)missing.push('sleep_target');if(nights.length<7)missing.push('7_valid_nights');
  const consistency=calculateSleepConsistencyCandidate({localBedtimeMinute:nights.map(n=>n.bedtimeLocalMinute),localWakeMinute:nights.map(n=>n.wakeLocalMinute)});
  if(consistency.value==null)missing.push(...consistency.missingDependencies.map(v=>`sleep_consistency:${v}`));
  if(today&&(!(today.opportunityMinutes>0)||!(today.asleepMinutes>0)||today.deepMinutes<0||today.remMinutes<0||today.deepMinutes+today.remMinutes>today.asleepMinutes))missing.push('valid_sleep_stages');
  let duration:number|null=null,quality:number|null=null;if(today&&i.target.value!=null){const target=i.target.value;duration=today.asleepMinutes<=target?goal(today.asleepMinutes,target):clamp(100-(today.asleepMinutes-target)/(target*.5)*100);
    const efficiency=clamp(today.asleepMinutes/today.opportunityMinutes*100);const deepPct=today.deepMinutes/today.asleepMinutes*100;const remPct=today.remMinutes/today.asleepMinutes*100;
    quality=efficiency*.5+band(deepPct,13,23,0,36)*.25+band(remPct,20,25,5,40)*.25;}
  const value=missing.length?null:duration!*.4+quality!*.4+consistency.value!*.2;
  return score({domain:'sleep',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value,freshness:i.freshness,used:value==null?[]:['asleep_minutes','sleep_efficiency','deep_sleep_pct','rem_sleep_pct','sleep_consistency'],missing,factors:value==null?[]:[`Duration ${round(duration!)}`,`Quality ${round(quality!)}`,`Consistency ${consistency.value}`],history:nights.length,highWindow:14,explanation:value==null?'Candidate Sleep requires a governed 360–600 minute target and seven complete wake-day nights.':'Candidate: duration 40%; quality (efficiency 50%, deep 25%, REM 25%) 40%; SC-01 20%.'});
};

export const calculateNourishmentCandidate=(i:{healthDay:string;calculatedAt:string;freshness:string;proteinGrams:number;proteinTarget:GoalResolution;hydrationMl:number;hydrationTarget:GoalResolution;foodQualityDimensions:number[];approvedClinicalMarkerScores:number[]}):CandidateStarOrbScore=>{
  const missing:string[]=[];if(!finite(i.proteinGrams)||i.proteinTarget.value==null)missing.push('protein_with_governed_target');if(!finite(i.hydrationMl)||i.hydrationTarget.value==null)missing.push('hydration_with_governed_target');if(!i.foodQualityDimensions.length||!i.foodQualityDimensions.every(finite))missing.push('complete_food_quality_dimensions');if(!i.approvedClinicalMarkerScores.length||!i.approvedClinicalMarkerScores.every(finite))missing.push('approved_marker_specific_scores');
  const components=missing.length?null:{protein:goal(i.proteinGrams,i.proteinTarget.value!),hydration:goal(i.hydrationMl,i.hydrationTarget.value!),food:mean(i.foodQualityDimensions.map(clamp)),clinical:mean(i.approvedClinicalMarkerScores.map(clamp))};
  const value=components?components.protein*.25+components.hydration*.2+components.food*.3+components.clinical*.25:null;
  return score({domain:'nourishment',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value,freshness:i.freshness,used:value==null?[]:['protein','hydration','food_quality','approved_clinical_markers'],missing,factors:components?Object.entries(components).map(([k,v])=>`${k} ${round(v)}`):[],history:1,highWindow:7,explanation:value==null?'Missing logs remain unknown; only approved marker-specific scores are accepted.':'Candidate: protein 25% + hydration 20% + food quality 30% + approved clinical markers 25%.'});
};

const baselineCandidate=(current:number,baseline:number,invert=false)=>clamp(50+(invert?-1:1)*(current/baseline-1)*100);
export const calculateCalmCandidate=(i:{healthDay:string;calculatedAt:string;freshness:string;hrvType:'SDNN'|'RMSSD';currentHrv:number;hrvBaselineSameType:number;hrvHistoryDays:number;stressAssessment:{score:number;minimum:number;maximum:number;validatedScale:string};mindfulnessMinutes:number;mindfulnessGoal:GoalResolution}):CandidateStarOrbScore=>{
  const missing:string[]=[];if(!(i.hrvHistoryDays>=14)||!(i.hrvBaselineSameType>0)||!(i.currentHrv>0))missing.push(`14_day_${i.hrvType.toLowerCase()}_baseline`);if(!(i.stressAssessment.maximum>i.stressAssessment.minimum)||!i.stressAssessment.validatedScale)missing.push('validated_stress_scale');if(i.mindfulnessGoal.value==null||!finite(i.mindfulnessMinutes))missing.push('mindfulness_with_governed_goal');
  const hrv=missing.some(v=>v.includes('baseline'))?null:baselineCandidate(i.currentHrv,i.hrvBaselineSameType);const stress=missing.includes('validated_stress_scale')?null:clamp((i.stressAssessment.maximum-i.stressAssessment.score)/(i.stressAssessment.maximum-i.stressAssessment.minimum)*100);const mindfulness=i.mindfulnessGoal.value==null?null:goal(i.mindfulnessMinutes,i.mindfulnessGoal.value);const value=missing.length?null:hrv!*.4+stress!*.3+mindfulness!*.3;
  return score({domain:'calm',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value,freshness:i.freshness,used:value==null?[]:[`hrv_${i.hrvType.toLowerCase()}`,'validated_stress_assessment','mindfulness_minutes'],missing,factors:value==null?[]:[`HRV ${round(hrv!)}`,`Stress ${round(stress!)}`,`Mindfulness ${round(mindfulness!)}`],history:i.hrvHistoryDays,highWindow:28,explanation:value==null?'Candidate Calm keeps SDNN and RMSSD baselines separate and requires a validated stress scale.':'Candidate: same-type HRV 40% + scale-specific stress 30% + mindfulness goal attainment 30%.'});
};

export const calculateMindCandidate=(i:{healthDay:string;calculatedAt:string;freshness:string;moodCheckIns:number[];validatedWellbeingScore:number;completedSessions:number;sessionGoal:GoalResolution;emotionalWellbeingHistory:number[]}):CandidateStarOrbScore=>{
  const missing:string[]=[];if(!i.moodCheckIns.length||!i.moodCheckIns.every(finite))missing.push('explicit_mood_checkins');if(!finite(i.validatedWellbeingScore))missing.push('validated_wellbeing_assessment');if(i.sessionGoal.value==null)missing.push('mental_wellness_session_goal');if(i.emotionalWellbeingHistory.length<7||!i.emotionalWellbeingHistory.every(finite))missing.push('7_day_emotional_wellbeing_history');
  const mood=i.moodCheckIns.length?mean(i.moodCheckIns.map(clamp)):null;const sessions=i.sessionGoal.value==null?null:goal(i.completedSessions,i.sessionGoal.value);const pattern=i.emotionalWellbeingHistory.length>=7?clamp(100-Math.sqrt(mean(i.emotionalWellbeingHistory.slice(-7).map(v=>(v-mean(i.emotionalWellbeingHistory.slice(-7)))**2)))):null;const value=missing.length?null:mood!*.4+clamp(i.validatedWellbeingScore)*.35+sessions!*.15+pattern!*.1;
  return score({domain:'mind',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value,freshness:i.freshness,used:value==null?[]:['mood_checkins','validated_wellbeing','mental_wellness_sessions','emotional_pattern'],missing,factors:value==null?[]:[`Mood ${round(mood!)}`,`Wellbeing ${round(i.validatedWellbeingScore)}`,`Sessions ${round(sessions!)}`,`Pattern ${round(pattern!)}`],history:i.emotionalWellbeingHistory.length,highWindow:14,explanation:value==null?'Candidate Mind uses explicit self-report and completed sessions only; it is non-diagnostic.':'Candidate: mood 40% + validated wellbeing 35% + completed sessions 15% + 7-day self-report stability 10%.'});
};

export type RecoveryCandidateInput={healthDay:string;calculatedAt:string;freshness:string;sleep:CandidateStarOrbScore;activityBalance:number|null;currentHrv:number;hrvBaselineSameType:number;currentRestingHeartRate:number;restingHeartRateBaseline:number;baselineDays:number;sleepBehaviour:number;activityDistribution:number;mindfulnessPractice:number;explicitLifestyleHabits:number[]};
export const calculateRecoveryCandidate=(i:RecoveryCandidateInput):CandidateStarOrbScore=>{
  const missing:string[]=[];if(i.sleep.score==null)missing.push('sleep_score');if(i.activityBalance==null)missing.push('activity_balance');if(i.baselineDays<14||!(i.hrvBaselineSameType>0)||!(i.restingHeartRateBaseline>0))missing.push('14_day_same_type_body_baseline');if(!i.explicitLifestyleHabits.length||!i.explicitLifestyleHabits.every(finite))missing.push('explicit_lifestyle_habits');
  const hrv=missing.includes('14_day_same_type_body_baseline')?null:baselineCandidate(i.currentHrv,i.hrvBaselineSameType);const rhr=missing.includes('14_day_same_type_body_baseline')?null:baselineCandidate(i.currentRestingHeartRate,i.restingHeartRateBaseline,true);const body=hrv==null||rhr==null?null:mean([hrv,rhr]);const lifestyle=i.explicitLifestyleHabits.length?mean(i.explicitLifestyleHabits.map(clamp)):null;const value=missing.length?null:i.sleep.score!*.4+body!*.3+i.activityBalance!*.2+lifestyle!*.1;
  return score({domain:'recovery',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value,freshness:i.freshness,used:value==null?[]:['sleep','same_type_hrv','resting_heart_rate','activity_balance','explicit_lifestyle_habits'],missing,factors:value==null?[]:[`Sleep ${i.sleep.score}`,`Body ${round(body!)}`,`Activity balance ${round(i.activityBalance!)}`,`Lifestyle ${round(lifestyle!)}`],history:i.baselineDays,highWindow:28,explanation:value==null?'Candidate Recovery requires complete independent children and personal baselines.':'Candidate: Sleep 40% + Body Recovery 30% + Activity Balance 20% + independent explicitly recorded Lifestyle Balance 10%; never Overall.'});
};

export const calculateSevenDayRecoveryCandidate=(healthDays:string[],calculate:(healthDay:string)=>CandidateStarOrbScore):CandidateStarOrbScore[]=>{
  if(healthDays.length!==7||new Set(healthDays).size!==7)throw new Error('Seven distinct health days are required.');
  const ordered=[...healthDays].sort();for(let n=1;n<ordered.length;n++){const prior=new Date(`${ordered[n-1]}T12:00:00Z`);prior.setUTCDate(prior.getUTCDate()+1);if(prior.toISOString().slice(0,10)!==ordered[n])throw new Error('Health days must be consecutive.');}
  return ordered.map(day=>{const result=calculate(day);if(result.healthDay!==day||result.domain!=='recovery')throw new Error('Recovery calculator returned the wrong health day or domain.');return result;});
};
