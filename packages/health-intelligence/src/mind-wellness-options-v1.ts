export const SELF_REPORTED_MIND_WELLNESS_VERSION='SELF_REPORTED_MIND_WELLNESS_V1_PROPOSAL' as const;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const clamp=(value:number)=>Math.max(0,Math.min(100,value));
const mean=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/values.length;

/**
 * Non-diagnostic proposal only. It does not replace or redistribute the
 * candidate Mind formula's validated-wellbeing component.
 */
export const evaluateSelfReportedMindWellnessProposal=(input:{
  moodScores:number[];
  completedSessions:number;
  sessionGoal:number|null;
})=>{
  if(input.moodScores.length!==7||!input.moodScores.every(finite))return {score:null,status:'UNAVAILABLE' as const,version:SELF_REPORTED_MIND_WELLNESS_VERSION,reason:'SEVEN_DISTINCT_DAYS_OF_SELF_REPORTED_MOOD_REQUIRED' as const};
  if(!finite(input.completedSessions)||!finite(input.sessionGoal)||input.sessionGoal<=0)return {score:null,status:'UNAVAILABLE' as const,version:SELF_REPORTED_MIND_WELLNESS_VERSION,reason:'COMPLETED_SESSIONS_AND_EXPLICIT_GOAL_REQUIRED' as const};
  const recent=input.moodScores.slice(-7).map(clamp);const mood=mean(recent);const average=mean(recent);
  const stability=clamp(100-Math.sqrt(mean(recent.map(value=>(value-average)**2))));
  const sessions=clamp(input.completedSessions/input.sessionGoal*100);
  return {score:Number((mood*.6+sessions*.25+stability*.15).toFixed(2)),status:'PROPOSAL_ONLY' as const,version:SELF_REPORTED_MIND_WELLNESS_VERSION,label:'Non-diagnostic self-reported Mind Wellness' as const,weights:{mood:.6,sessions:.25,stability:.15}};
};
