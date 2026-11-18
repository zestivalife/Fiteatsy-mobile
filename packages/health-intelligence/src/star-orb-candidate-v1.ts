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
  inputsUsed:string[];inputsMissing:string[];contributingFactors:string[];explanation:string;componentCoverage:number;
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
// Reuse the established goal-independent fitness normalisation already used by
// the production health calculation engine. These are measurement reference
// scales, not user goals: the user's Personal Activity Goals remain independent.
export const normalizeMeasuredActivityComponent=(kind:'steps'|'exercise_minutes',value:number)=>
  finite(value)?clamp(Math.round(kind==='steps'?value/100:value/45*100)):null;
const partial=(components:Array<{name:string;value:number|null;weight:number}>)=>{
  const available=components.filter((component):component is {name:string;value:number;weight:number}=>finite(component.value));
  const availableWeight=available.reduce((sum,component)=>sum+component.weight,0);
  return {value:availableWeight?available.reduce((sum,component)=>sum+clamp(component.value)*component.weight,0)/availableWeight:null,
    used:available.map(component=>component.name),coverage:Number((availableWeight*100).toFixed(2)),complete:available.length===components.length};
};
const band=(value:number,low:number,high:number,outerLow:number,outerHigh:number)=>
  value>=low&&value<=high?100:value<low?clamp((value-outerLow)/(low-outerLow)*100):clamp((outerHigh-value)/(outerHigh-high)*100);
const confidence=(complete:boolean,history:number,highWindow:number,freshness:string):StarOrbConfidence=>
  freshness==='STALE'?'LOW':complete&&history>=highWindow?'HIGH':complete?'MODERATE':'LOW';
const score=(p:{domain:string;healthDay:string;calculatedAt:string;value:number|null;freshness:string;used:string[];missing:string[];factors:string[];history:number;highWindow:number;explanation:string;coverage?:number;status?:StarOrbStatus}):CandidateStarOrbScore=>({
  domain:p.domain,score:p.value==null?null:round(p.value),status:p.status??(p.value==null?'INSUFFICIENT_DATA':p.freshness==='STALE'?'STALE':(p.coverage??100)<100?'PARTIAL':'CALCULATED'),
  methodologyId:STAR_ORB_METHODOLOGY_ID,methodologyVersion:STAR_ORB_METHODOLOGY_VERSION,healthDay:p.healthDay,calculatedAt:p.calculatedAt,
  confidence:confidence(p.value!=null,p.history,p.highWindow,p.freshness),inputFreshness:p.freshness,inputsUsed:p.used,inputsMissing:p.missing,
  contributingFactors:p.factors,explanation:p.explanation,componentCoverage:p.value==null?0:p.coverage??100,activation:'CANDIDATE_ONLY',clinicalValidation:'PENDING'
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
  if(!finite(i.steps))missing.push('steps');if(!finite(i.exerciseMinutes))missing.push('exercise_minutes');if(balance.value==null)missing.push(...balance.missingDependencies.map(v=>`activity_balance:${v}`));
  const steps=normalizeMeasuredActivityComponent('steps',i.steps);
  const exercise=normalizeMeasuredActivityComponent('exercise_minutes',i.exerciseMinutes);
  const result=partial([{name:'steps',value:steps,weight:.4},{name:'exercise_minutes',value:exercise,weight:.4},{name:'activity_balance',value:balance.value,weight:.2}]);
  return score({domain:'activity',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value:result.value,freshness:i.freshness,used:result.used,missing,factors:[...(steps==null?[]:[`Steps ${round(steps)}`]),...(exercise==null?[]:[`Exercise ${round(exercise)}`]),...(balance.value==null?[]:[`Balance ${balance.value}`])],history:i.dailyActivityLoad.length,highWindow:28,coverage:result.coverage,explanation:result.value==null?'Activity needs at least one measured fitness component.':`Wellness Activity ${result.complete?'complete':'partial'} (${result.coverage}% component coverage).`});
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
  const result=partial([{name:'duration',value:duration,weight:.4},{name:'quality',value:quality,weight:.4},{name:'consistency',value:consistency.value,weight:.2}]);
  return score({domain:'sleep',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value:result.value,freshness:i.freshness,used:result.used,missing,factors:[...(duration==null?[]:[`Duration ${round(duration)}`]),...(quality==null?[]:[`Quality ${round(quality)}`]),...(consistency.value==null?[]:[`Consistency ${consistency.value}`])],history:nights.length,highWindow:14,coverage:result.coverage,explanation:result.value==null?'Sleep needs at least one valid component and an explicit duration goal.':`Wellness Sleep ${result.complete?'complete':'partial'} (${result.coverage}% component coverage).`});
};

export const calculateNourishmentCandidate=(i:{healthDay:string;calculatedAt:string;freshness:string;proteinGrams:number;proteinTarget:GoalResolution;hydrationMl:number;hydrationTarget:GoalResolution;foodQualityDimensions:number[];approvedClinicalMarkerScores:number[]}):CandidateStarOrbScore=>{
  const missing:string[]=[];if(!finite(i.proteinGrams)||i.proteinTarget.value==null)missing.push('protein_with_governed_target');if(!finite(i.hydrationMl)||i.hydrationTarget.value==null)missing.push('hydration_with_governed_target');if(!i.foodQualityDimensions.length||!i.foodQualityDimensions.every(finite))missing.push('complete_food_quality_dimensions');if(!i.approvedClinicalMarkerScores.length||!i.approvedClinicalMarkerScores.every(finite))missing.push('approved_marker_specific_scores');
  const components={protein:finite(i.proteinGrams)&&i.proteinTarget.value!=null?goal(i.proteinGrams,i.proteinTarget.value):null,hydration:finite(i.hydrationMl)&&i.hydrationTarget.value!=null?goal(i.hydrationMl,i.hydrationTarget.value):null,food:i.foodQualityDimensions.length&&i.foodQualityDimensions.every(finite)?mean(i.foodQualityDimensions.map(clamp)):null,clinical:i.approvedClinicalMarkerScores.length&&i.approvedClinicalMarkerScores.every(finite)?mean(i.approvedClinicalMarkerScores.map(clamp)):null};
  const result=partial([{name:'protein',value:components.protein,weight:.25},{name:'hydration',value:components.hydration,weight:.2},{name:'food_quality',value:components.food,weight:.3},{name:'approved_clinical_markers',value:components.clinical,weight:.25}]);
  return score({domain:'nourishment',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value:result.value,freshness:i.freshness,used:result.used,missing,factors:Object.entries(components).filter((entry):entry is [string,number]=>entry[1]!=null).map(([k,v])=>`${k} ${round(v)}`),history:1,highWindow:7,coverage:result.coverage,explanation:result.value==null?'No reliable nourishment component is available.':`Wellness Nourishment ${result.complete?'complete':'partial'} (${result.coverage}% component coverage).`});
};

const baselineCandidate=(current:number,baseline:number,invert=false)=>clamp(50+(invert?-1:1)*(current/baseline-1)*100);
export const calculateCalmCandidate=(i:{healthDay:string;calculatedAt:string;freshness:string;hrvType:'SDNN'|'RMSSD';currentHrv:number;hrvBaselineSameType:number;hrvHistoryDays:number;stressAssessment:{score:number;minimum:number;maximum:number;validatedScale:string};mindfulnessMinutes:number;mindfulnessGoal:GoalResolution}):CandidateStarOrbScore=>{
  const missing:string[]=[];if(!(i.hrvHistoryDays>=14)||!(i.hrvBaselineSameType>0)||!(i.currentHrv>0))missing.push(`14_day_${i.hrvType.toLowerCase()}_baseline`);if(!(i.stressAssessment.maximum>i.stressAssessment.minimum)||!i.stressAssessment.validatedScale)missing.push('validated_stress_scale');if(i.mindfulnessGoal.value==null||!finite(i.mindfulnessMinutes))missing.push('mindfulness_with_governed_goal');
  const hrv=missing.some(v=>v.includes('baseline'))?null:baselineCandidate(i.currentHrv,i.hrvBaselineSameType);const stress=missing.includes('validated_stress_scale')?null:clamp((i.stressAssessment.maximum-i.stressAssessment.score)/(i.stressAssessment.maximum-i.stressAssessment.minimum)*100);const mindfulness=i.mindfulnessGoal.value==null||!finite(i.mindfulnessMinutes)?null:goal(i.mindfulnessMinutes,i.mindfulnessGoal.value);const result=partial([{name:`hrv_${i.hrvType.toLowerCase()}`,value:hrv,weight:.4},{name:'validated_stress_assessment',value:stress,weight:.3},{name:'mindfulness_minutes',value:mindfulness,weight:.3}]);
  return score({domain:'calm',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value:result.value,freshness:i.freshness,used:result.used,missing,factors:[...(hrv==null?[]:[`HRV ${round(hrv)}`]),...(stress==null?[]:[`Stress ${round(stress)}`]),...(mindfulness==null?[]:[`Mindfulness ${round(mindfulness)}`])],history:i.hrvHistoryDays,highWindow:28,coverage:result.coverage,explanation:result.value==null?'Calm needs a valid HRV baseline, stress assessment, or mindfulness component.':`Wellness Calm ${result.complete?'complete':'partial'} (${result.coverage}% component coverage).`});
};

export const calculateMindCandidate=(i:{healthDay:string;calculatedAt:string;freshness:string;moodCheckIns:number[];validatedWellbeingScore:number;completedSessions:number;sessionGoal:GoalResolution;emotionalWellbeingHistory:number[]}):CandidateStarOrbScore=>{
  const missing:string[]=[];if(!i.moodCheckIns.length||!i.moodCheckIns.every(finite))missing.push('explicit_mood_checkins');if(!finite(i.validatedWellbeingScore))missing.push('validated_wellbeing_assessment');if(i.sessionGoal.value==null)missing.push('mental_wellness_session_goal');if(i.emotionalWellbeingHistory.length<7||!i.emotionalWellbeingHistory.every(finite))missing.push('7_day_emotional_wellbeing_history');
  const mood=i.moodCheckIns.length?mean(i.moodCheckIns.map(clamp)):null;const wellbeing=finite(i.validatedWellbeingScore)?clamp(i.validatedWellbeingScore):null;const sessions=i.sessionGoal.value==null||!finite(i.completedSessions)?null:goal(i.completedSessions,i.sessionGoal.value);const pattern=i.emotionalWellbeingHistory.length>=7?clamp(100-Math.sqrt(mean(i.emotionalWellbeingHistory.slice(-7).map(v=>(v-mean(i.emotionalWellbeingHistory.slice(-7)))**2)))):null;const result=partial([{name:'mood_checkins',value:mood,weight:.4},{name:'validated_wellbeing',value:wellbeing,weight:.35},{name:'mental_wellness_sessions',value:sessions,weight:.15},{name:'emotional_pattern',value:pattern,weight:.1}]);
  return score({domain:'mind',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value:result.value,freshness:i.freshness,used:result.used,missing,factors:[...(mood==null?[]:[`Mood ${round(mood)}`]),...(wellbeing==null?[]:[`Wellbeing ${round(wellbeing)}`]),...(sessions==null?[]:[`Sessions ${round(sessions)}`]),...(pattern==null?[]:[`Pattern ${round(pattern)}`])],history:i.emotionalWellbeingHistory.length,highWindow:14,coverage:result.coverage,explanation:result.value==null?'No explicit non-diagnostic Mind component is available.':`Wellness Mind ${result.complete?'complete':'partial'} (${result.coverage}% component coverage).`});
};

export type RecoveryCandidateInput={healthDay:string;calculatedAt:string;freshness:string;sleep:CandidateStarOrbScore;activityBalance:number|null;currentHrv:number;hrvBaselineSameType:number;currentRestingHeartRate:number;restingHeartRateBaseline:number;baselineDays:number;sleepBehaviour:number;activityDistribution:number;mindfulnessPractice:number;explicitLifestyleHabits:number[]};
export const calculateRecoveryCandidate=(i:RecoveryCandidateInput):CandidateStarOrbScore=>{
  const missing:string[]=[];if(i.sleep.score==null)missing.push('sleep_score');if(i.activityBalance==null)missing.push('activity_balance');if(i.baselineDays<14||!(i.hrvBaselineSameType>0)||!(i.restingHeartRateBaseline>0))missing.push('14_day_same_type_body_baseline');if(!i.explicitLifestyleHabits.length||!i.explicitLifestyleHabits.every(finite))missing.push('explicit_lifestyle_habits');
  const hrv=missing.includes('14_day_same_type_body_baseline')?null:baselineCandidate(i.currentHrv,i.hrvBaselineSameType);const rhr=missing.includes('14_day_same_type_body_baseline')?null:baselineCandidate(i.currentRestingHeartRate,i.restingHeartRateBaseline,true);const body=hrv==null||rhr==null?null:mean([hrv,rhr]);const lifestyle=i.explicitLifestyleHabits.length?mean(i.explicitLifestyleHabits.map(clamp)):null;const result=partial([{name:'sleep',value:i.sleep.score,weight:.4},{name:'body_recovery',value:body,weight:.3},{name:'activity_balance',value:i.activityBalance,weight:.2},{name:'lifestyle_balance',value:lifestyle,weight:.1}]);
  const enoughIndependentComponents=result.used.length>=2;const value=enoughIndependentComponents?result.value:null;
  return score({domain:'recovery',healthDay:i.healthDay,calculatedAt:i.calculatedAt,value,freshness:i.freshness,used:value==null?[]:result.used,missing,factors:value==null?[]:[...(i.sleep.score==null?[]:[`Sleep ${i.sleep.score}`]),...(body==null?[]:[`Body ${round(body)}`]),...(i.activityBalance==null?[]:[`Activity balance ${round(i.activityBalance)}`]),...(lifestyle==null?[]:[`Lifestyle ${round(lifestyle)}`])],history:i.baselineDays,highWindow:28,coverage:value==null?0:result.coverage,explanation:value==null?'Recovery requires at least two independent meaningful components.':`Wellness Recovery ${result.complete?'complete':'partial'} (${result.coverage}% component coverage).`});
};

export const calculateSevenDayRecoveryCandidate=(healthDays:string[],calculate:(healthDay:string)=>CandidateStarOrbScore):CandidateStarOrbScore[]=>{
  if(healthDays.length!==7||new Set(healthDays).size!==7)throw new Error('Seven distinct health days are required.');
  const ordered=[...healthDays].sort();for(let n=1;n<ordered.length;n++){const prior=new Date(`${ordered[n-1]}T12:00:00Z`);prior.setUTCDate(prior.getUTCDate()+1);if(prior.toISOString().slice(0,10)!==ordered[n])throw new Error('Health days must be consecutive.');}
  return ordered.map(day=>{const result=calculate(day);if(result.healthDay!==day||result.domain!=='recovery')throw new Error('Recovery calculator returned the wrong health day or domain.');return result;});
};
