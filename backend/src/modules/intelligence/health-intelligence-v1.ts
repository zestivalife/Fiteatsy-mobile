export const HEALTH_INTELLIGENCE_VERSION='HEALTH_INTELLIGENCE_V1' as const;
export const HEALTH_INTELLIGENCE_CONFIG={version:HEALTH_INTELLIGENCE_VERSION,clinicalValidation:'PENDING' as const,
  targets:{sleepMinutes:null as number|null,steps:10_000,exerciseMinutes:30},
  weights:{sleep:{duration:.4,quality:.4,consistency:.2},activity:{steps:.4,exercise:.4,balance:.2},nutrition:{protein:.25,hydration:.2,foodQuality:.3,clinical:.25},calm:{hrv:.4,stress:.3,mindfulness:.3},stressRecovery:{hrv:.4,sleep:.3,adaptation:.3},recovery:{sleep:.4,body:.3,activityBalance:.2,lifestyle:.1},cycle:{phase:.4,symptoms:.3,energy:.3},overall:{activity:.15,sleep:.2,nutrition:.2,calm:.15,stressRecovery:.15,cycle:.15}}} as const;
export type ScoreStatus='CALCULATED'|'PARTIAL'|'INSUFFICIENT_DATA'|'METHODOLOGY_PENDING'|'NOT_APPLICABLE'|'STALE';
export type Confidence='HIGH'|'MODERATE'|'LOW';
export type ScoreResult={key:string;score:number|null;status:ScoreStatus;confidence:Confidence;trend:number|null;
 inputsUsed:string[];inputsMissing:string[];inputsNotApplicable:string[];methodologyPending:string[];contributingFactors:string[];
 recommendedActions:string[];explanation:string;freshness:'CURRENT'|'STALE'|'UNKNOWN';calculationVersion:typeof HEALTH_INTELLIGENCE_VERSION;calculatedAt:string};
type Values=Record<string,number|null|undefined>;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v:number)=>Math.max(0,Math.min(100,v));
const weighted=(key:string,values:Values,weights:Record<string,number>,pending:string[]=[],notApplicable:string[]=[],freshness:ScoreResult['freshness']='CURRENT'):ScoreResult=>{
 const expected=Object.keys(weights),used=expected.filter(k=>finite(values[k])),missing=expected.filter(k=>!used.includes(k)&&!notApplicable.includes(k));
 const unresolved=missing.filter(k=>pending.includes(k));const availableWeight=used.reduce((s,k)=>s+weights[k],0);
 const raw=availableWeight?used.reduce((s,k)=>s+(values[k] as number)*weights[k],0)/availableWeight:null;
 const completeness=used.length/Math.max(1,expected.length-notApplicable.length);const confidence:Confidence=freshness==='STALE'?'LOW':completeness===1?'HIGH':completeness>=.5?'MODERATE':'LOW';
 const status:ScoreStatus=freshness==='STALE'&&raw!==null?'STALE':unresolved.length?'METHODOLOGY_PENDING':raw===null?'INSUFFICIENT_DATA':missing.length?'PARTIAL':'CALCULATED';
 return {key,score:status==='METHODOLOGY_PENDING'||status==='INSUFFICIENT_DATA'?null:Number(clamp(raw as number).toFixed(2)),status,confidence,trend:null,
  inputsUsed:used,inputsMissing:missing,inputsNotApplicable:notApplicable,methodologyPending:unresolved,contributingFactors:used,
  recommendedActions:[],explanation:unresolved.length?`Methodology pending: ${unresolved.join(', ')}.`:raw===null?'Insufficient canonical data.':`Calculated from ${used.join(', ')}${missing.length?`; missing ${missing.join(', ')}`:''}.`,
  freshness,calculationVersion:HEALTH_INTELLIGENCE_VERSION,calculatedAt:new Date().toISOString()};
};
export const goalScore=(actual:number|null|undefined,target:number|null|undefined)=>finite(actual)&&finite(target)&&target>0?Math.min(100,actual/target*100):null;
export const sleepScore=(i:{minutes?:number|null;targetMinutes?:number|null;deep?:number|null;rem?:number|null;efficiency?:number|null;consistency?:number|null;freshness?:ScoreResult['freshness']})=>{
 const stages=[i.deep,i.rem,i.efficiency];const quality=stages.every(finite)?stages.reduce<number>((s,v)=>s+(v as number),0)/3:null;
 return weighted('sleep',{duration:goalScore(i.minutes,i.targetMinutes),quality,consistency:i.consistency},{...HEALTH_INTELLIGENCE_CONFIG.weights.sleep},['duration','quality','consistency'],[],i.freshness);
};
export const activityScore=(i:{steps?:number|null;stepGoal?:number|null;exerciseMinutes?:number|null;exerciseTarget?:number|null;balance?:number|null;freshness?:ScoreResult['freshness']})=>weighted('activity',{steps:goalScore(i.steps,i.stepGoal),exercise:goalScore(i.exerciseMinutes,i.exerciseTarget),balance:i.balance},{...HEALTH_INTELLIGENCE_CONFIG.weights.activity},['balance'],[],i.freshness);
export const calmScore=(i:{hrv?:number|null;stress?:number|null;mindfulness?:number|null;freshness?:ScoreResult['freshness']})=>weighted('calm',{hrv:i.hrv,stress:i.stress,mindfulness:i.mindfulness},{...HEALTH_INTELLIGENCE_CONFIG.weights.calm},['hrv'],[],i.freshness);
export const nutritionScore=(i:{protein?:number|null;hydration?:number|null;foodQuality?:number|null;clinical?:number|null;freshness?:ScoreResult['freshness']})=>weighted('nutrition',{protein:i.protein,hydration:i.hydration,foodQuality:i.foodQuality,clinical:i.clinical},{...HEALTH_INTELLIGENCE_CONFIG.weights.nutrition},['protein','hydration','foodQuality','clinical'],[],i.freshness);
export const stressRecoveryScore=(i:{hrv?:number|null;sleep?:number|null;adaptation?:number|null;freshness?:ScoreResult['freshness']})=>weighted('stress_recovery',{hrv:i.hrv,sleep:i.sleep,adaptation:i.adaptation},{...HEALTH_INTELLIGENCE_CONFIG.weights.stressRecovery},['adaptation'],[],i.freshness);
export const recoveryScore=(i:{sleep?:number|null;body?:number|null;activityBalance?:number|null;lifestyle?:number|null;freshness?:ScoreResult['freshness']})=>weighted('recovery',{sleep:i.sleep,body:i.body,activityBalance:i.activityBalance,lifestyle:i.lifestyle},{...HEALTH_INTELLIGENCE_CONFIG.weights.recovery},['body','activityBalance','lifestyle'],[],i.freshness);
export const cycleScore=(i:{applicable:boolean;phase?:number|null;symptoms?:number|null;energy?:number|null}):ScoreResult=>i.applicable?weighted('cycle',{phase:i.phase,symptoms:i.symptoms,energy:i.energy},{...HEALTH_INTELLIGENCE_CONFIG.weights.cycle},['phase','symptoms','energy']):({key:'cycle',score:null,status:'NOT_APPLICABLE',confidence:'LOW',trend:null,inputsUsed:[],inputsMissing:[],inputsNotApplicable:['cycle'],methodologyPending:[],contributingFactors:[],recommendedActions:[],explanation:'Cycle scoring is not applicable for this profile.',freshness:'UNKNOWN',calculationVersion:HEALTH_INTELLIGENCE_VERSION,calculatedAt:new Date().toISOString()});
export const overallScore=(scores:Record<string,ScoreResult>)=>weighted('health_intelligence',Object.fromEntries(Object.keys(HEALTH_INTELLIGENCE_CONFIG.weights.overall).map(k=>[k,scores[k]?.score])),{...HEALTH_INTELLIGENCE_CONFIG.weights.overall},Object.entries(scores).filter(([,s])=>s.status==='METHODOLOGY_PENDING').map(([k])=>k),Object.entries(scores).filter(([,s])=>s.status==='NOT_APPLICABLE').map(([k])=>k));
export const mindScore=():ScoreResult=>({...weighted('mind',{}, {methodology:1},['methodology']),explanation:'Numeric Mind methodology is not approved.'});
