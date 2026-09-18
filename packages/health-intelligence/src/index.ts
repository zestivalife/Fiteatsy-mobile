export const HEALTH_INTELLIGENCE_VERSION = 'HEALTH_INTELLIGENCE_V1' as const;
export const HEALTH_INTELLIGENCE_CONFIG={version:HEALTH_INTELLIGENCE_VERSION,clinicalValidation:'PENDING' as const,
  targets:{sleepMinutes:null as number|null,steps:10_000,exerciseMinutes:30},
  weights:{sleep:{duration:.4,quality:.4,consistency:.2},activity:{steps:.4,exercise:.4,balance:.2},nutrition:{protein:.25,hydration:.2,foodQuality:.3,clinical:.25},calm:{hrv:.4,stress:.3,mindfulness:.3},stressRecovery:{hrv:.4,sleep:.3,adaptation:.3},recovery:{sleep:.4,body:.3,activityBalance:.2,lifestyle:.1},cycle:{phase:.4,symptoms:.3,energy:.3},overall:{activity:.15,sleep:.2,nutrition:.2,calm:.15,stressRecovery:.15,cycle:.15}}} as const;
export type ScoreStatus='CALCULATED'|'PARTIAL'|'INSUFFICIENT_DATA'|'METHODOLOGY_PENDING'|'NOT_APPLICABLE'|'STALE';
export type CanonicalHealthStatus='AVAILABLE'|'CALCULATING'|'CALIBRATING'|'NO_DATA'|'INSUFFICIENT_DATA'|'METHODOLOGY_PENDING'|'NOT_APPLICABLE'|'STALE'|'OFFLINE'|'UPLOAD_PENDING'|'ACTION_REQUIRED'|'ERROR';
export type HealthRuntimeState='IDLE'|'QUERYING'|'DATA_AVAILABLE'|'NO_VISIBLE_DATA'|'ERROR'|'TIMEOUT'|'UPLOAD_PENDING';
export const canonicalHealthStatus=(status:string|null|undefined,context:{hasCanonicalData?:boolean;hasPartialEvidence?:boolean;offline?:boolean}={}):CanonicalHealthStatus=>{
 const normalized=String(status??'').toUpperCase();
 if(normalized==='CALCULATED'||normalized==='AVAILABLE'||normalized==='DATA_AVAILABLE')return 'AVAILABLE';
 if(normalized==='PARTIAL')return 'ACTION_REQUIRED';
 if(normalized==='QUERYING'||normalized==='CALCULATING')return 'CALCULATING';
 if(normalized==='IDLE')return context.hasCanonicalData?'AVAILABLE':'CALIBRATING';
 if(normalized==='NO_VISIBLE_DATA')return context.hasPartialEvidence?'INSUFFICIENT_DATA':'NO_DATA';
 if(normalized==='TIMEOUT'||normalized==='ERROR')return context.offline?'OFFLINE':'ERROR';
 if(normalized==='CALIBRATING'||normalized==='NO_DATA'||normalized==='INSUFFICIENT_DATA'||normalized==='METHODOLOGY_PENDING'||normalized==='NOT_APPLICABLE'||normalized==='STALE'||normalized==='OFFLINE'||normalized==='UPLOAD_PENDING'||normalized==='ACTION_REQUIRED')return normalized as CanonicalHealthStatus;
 return context.hasCanonicalData?'AVAILABLE':'NO_DATA';
};
export const canonicalHealthStatusLabel=(status:string|null|undefined,context:{hasCanonicalData?:boolean;hasPartialEvidence?:boolean;offline?:boolean}={})=>({
 AVAILABLE:'Available',CALCULATING:'Calculating',CALIBRATING:'Calibrating',NO_DATA:'No data yet',INSUFFICIENT_DATA:'Not enough data',
 METHODOLOGY_PENDING:'Methodology pending',NOT_APPLICABLE:'Not applicable',STALE:'Update needed',OFFLINE:'Available offline',
 UPLOAD_PENDING:'Upload pending',ACTION_REQUIRED:'Action needed',ERROR:'Unavailable'
}[canonicalHealthStatus(status,context)]);
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

export const HEALTH_AGGREGATION_VERSION = 'HEALTH_AGGREGATION_V2' as const;
export type HealthAggregationMethod = 'DAILY_SUM'|'LATEST'|'DAILY_AVERAGE'|'SESSION_AGGREGATE'|'RAW_SERIES';
export type HealthMetricSemantics = {unit:string;display:HealthAggregationMethod;calculation:HealthAggregationMethod;freshHours:number};
export const HEALTH_METRIC_SEMANTICS = {
  steps:{unit:'count',display:'DAILY_SUM',calculation:'DAILY_SUM',freshHours:36},
  distance:{unit:'m',display:'DAILY_SUM',calculation:'DAILY_SUM',freshHours:36},
  active_energy:{unit:'kcal',display:'DAILY_SUM',calculation:'DAILY_SUM',freshHours:36},
  active_minutes:{unit:'min',display:'DAILY_SUM',calculation:'DAILY_SUM',freshHours:36},
  hydration_ml:{unit:'ml',display:'DAILY_SUM',calculation:'DAILY_SUM',freshHours:36},
  mindfulness_minutes:{unit:'min',display:'DAILY_SUM',calculation:'DAILY_SUM',freshHours:36},
  sleep_minutes:{unit:'min',display:'SESSION_AGGREGATE',calculation:'SESSION_AGGREGATE',freshHours:36},
  sleep_deep_minutes:{unit:'min',display:'SESSION_AGGREGATE',calculation:'SESSION_AGGREGATE',freshHours:36},
  sleep_core_minutes:{unit:'min',display:'SESSION_AGGREGATE',calculation:'SESSION_AGGREGATE',freshHours:36},
  sleep_rem_minutes:{unit:'min',display:'SESSION_AGGREGATE',calculation:'SESSION_AGGREGATE',freshHours:36},
  sleep_awake_minutes:{unit:'min',display:'SESSION_AGGREGATE',calculation:'SESSION_AGGREGATE',freshHours:36},
  workout_minutes:{unit:'min',display:'SESSION_AGGREGATE',calculation:'SESSION_AGGREGATE',freshHours:36},
  heart_rate:{unit:'bpm',display:'RAW_SERIES',calculation:'DAILY_AVERAGE',freshHours:36},
  resting_heart_rate:{unit:'bpm',display:'LATEST',calculation:'LATEST',freshHours:36},
  hrv_sdnn_ms:{unit:'ms',display:'RAW_SERIES',calculation:'DAILY_AVERAGE',freshHours:36},
  hrv_rmssd_ms:{unit:'ms',display:'RAW_SERIES',calculation:'DAILY_AVERAGE',freshHours:36},
  spo2:{unit:'pct',display:'RAW_SERIES',calculation:'DAILY_AVERAGE',freshHours:36},
  respiratory_rate:{unit:'brpm',display:'RAW_SERIES',calculation:'DAILY_AVERAGE',freshHours:36},
  weight:{unit:'kg',display:'LATEST',calculation:'LATEST',freshHours:168},
  stress_score:{unit:'score',display:'LATEST',calculation:'LATEST',freshHours:168}
} as const satisfies Record<string,HealthMetricSemantics>;

export type CanonicalObservation = {
  id?:string; metricType:string; value:number; unit:string; measuredAtISO:string;
  startAtISO?:string|null; endAtISO?:string|null; timezoneOffsetMinutes?:number|null;
  sourceProvider:string; sourceRecordId?:string|null; syncKey?:string|null; deleted?:boolean;
  sourceMetadata?:Record<string,unknown>|null;
};
export type CanonicalDailyAggregate = {
  healthDay:string; metricType:string; value:number; unit:string; method:HealthAggregationMethod;
  latest:number|null;average:number|null;minimum:number|null;maximum:number|null;
  sourceObservationIds:string[];sourceProvider:string;sourcePriority:number;
  aggregateVersion:typeof HEALTH_AGGREGATION_VERSION;lineageHash:string;latestMeasuredAtISO:string;
  calculatedAtISO:string; aggregateSource:'HEALTHKIT_STATISTICS'|'CANONICAL_RAW_RECOMPUTATION';
  rawLineageAvailable:boolean;
};
const validTime=(iso:string)=>Number.isFinite(Date.parse(iso));
const offsetDay=(iso:string,offset:number)=>new Date(Date.parse(iso)+offset*60000).toISOString().slice(0,10);
const metadataString=(o:CanonicalObservation,key:string)=>typeof o.sourceMetadata?.[key]==='string'?String(o.sourceMetadata?.[key]):'';
const UNIT_FACTORS:Record<string,Record<string,number>>={
  m:{m:1,km:1000},kcal:{kcal:1,kJ:1/4.184},kg:{kg:1,lb:0.45359237},ml:{ml:1,L:1000},
  min:{min:1,h:60},count:{count:1},bpm:{bpm:1},ms:{ms:1},pct:{pct:1,'%':1},brpm:{brpm:1},score:{score:1}
};
export const normalizeCanonicalObservation=(o:CanonicalObservation):CanonicalObservation|null=>{
  const semantics=HEALTH_METRIC_SEMANTICS[o.metricType as keyof typeof HEALTH_METRIC_SEMANTICS];
  if(!semantics)return null;const factor=UNIT_FACTORS[semantics.unit]?.[o.unit];
  if(factor==null||!Number.isFinite(o.value))return null;
  return {...o,value:o.value*factor,unit:semantics.unit};
};
export const canonicalHealthDay=(o:CanonicalObservation,fallbackOffsetMinutes:number)=>{
  const timestamp=o.metricType.startsWith('sleep_')||o.metricType==='workout_minutes'?(o.endAtISO||o.measuredAtISO):o.measuredAtISO;
  return offsetDay(timestamp,o.timezoneOffsetMinutes??fallbackOffsetMinutes);
};
export const healthSourcePriority=(o:CanonicalObservation)=>{
  if(metadataString(o,'measurementMethod')==='HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'||o.sourceProvider==='platform_aggregate')return 600;
  const source=metadataString(o,'sourceApplication').toLowerCase(); const device=JSON.stringify(o.sourceMetadata?.device??{}).toLowerCase();
  if(source.includes('watch')||device.includes('watch'))return 500;
  if(o.sourceProvider==='apple_health'&&(source.includes('health')||source.includes('iphone')||device.includes('iphone')))return 400;
  if(o.sourceProvider==='apple_health'||o.sourceProvider==='health_connect')return 300;
  if(o.sourceProvider==='manual')return 200;
  return 100;
};
const stableId=(o:CanonicalObservation)=>o.syncKey||o.sourceRecordId||o.id||`${o.sourceProvider}:${o.metricType}:${o.measuredAtISO}:${o.value}`;
const hash=(value:string)=>{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return `fnv1a-${(h>>>0).toString(16).padStart(8,'0')}`;};
const unionMinutes=(rows:CanonicalObservation[])=>{
  const intervals=rows.map(o=>[Date.parse(o.startAtISO||o.measuredAtISO),Date.parse(o.endAtISO||o.measuredAtISO)] as const)
    .filter(([s,e])=>Number.isFinite(s)&&Number.isFinite(e)&&e>s).sort((a,b)=>a[0]-b[0]);
  if(!intervals.length)return rows.reduce((s,o)=>s+o.value,0);
  let total=0,[start,end]=intervals[0];for(const [s,e] of intervals.slice(1)){if(s<=end+60_000)end=Math.max(end,e);else{total+=end-start;start=s;end=e;}}return (total+end-start)/60_000;
};
export const aggregateCanonicalHealthObservations=(input:CanonicalObservation[],options:{fallbackOffsetMinutes:number;nowMs?:number})=>{
  const now=options.nowMs??Date.now(); const futureLimit=now+5*60_000; const dedup=new Map<string,CanonicalObservation>();
  input.forEach(raw=>{const o=normalizeCanonicalObservation(raw);if(o&&!o.deleted&&validTime(o.measuredAtISO)&&Date.parse(o.measuredAtISO)<=futureLimit)dedup.set(stableId(o),o);});
  const groups=new Map<string,CanonicalObservation[]>();
  dedup.forEach(o=>{if(!(o.metricType in HEALTH_METRIC_SEMANTICS))return;const key=`${canonicalHealthDay(o,options.fallbackOffsetMinutes)}|${o.metricType}`;groups.set(key,[...(groups.get(key)??[]),o]);});
  return [...groups.entries()].map(([key,all])=>{const [healthDay,metricType]=key.split('|');const semantics=HEALTH_METRIC_SEMANTICS[metricType as keyof typeof HEALTH_METRIC_SEMANTICS];
    const maxPriority=Math.max(...all.map(healthSourcePriority));const rows=all.filter(o=>healthSourcePriority(o)===maxPriority);const sorted=[...rows].sort((a,b)=>b.measuredAtISO.localeCompare(a.measuredAtISO));
    const values=rows.map(o=>o.value);const average=values.reduce((s,v)=>s+v,0)/values.length;const method=semantics.calculation;
    const value=method==='DAILY_SUM'?values.reduce((s,v)=>s+v,0):method==='SESSION_AGGREGATE'?unionMinutes(rows):method==='LATEST'?sorted[0].value:average;
    const ids=rows.map(stableId).sort();const normalized=Number(value.toFixed(4));const authority=rows.some(o=>healthSourcePriority(o)===600);
    return {healthDay,metricType,value:normalized,unit:semantics.unit,method,
      latest:sorted[0]?.value??null,average:Number(average.toFixed(4)),minimum:Math.min(...values),maximum:Math.max(...values),sourceObservationIds:ids,
      sourceProvider:sorted[0].sourceProvider,sourcePriority:maxPriority,aggregateVersion:HEALTH_AGGREGATION_VERSION,
      lineageHash:hash(JSON.stringify([HEALTH_AGGREGATION_VERSION,healthDay,metricType,normalized,semantics.unit,ids])),latestMeasuredAtISO:sorted[0].measuredAtISO,
      calculatedAtISO:new Date(now).toISOString(),aggregateSource:(authority?'HEALTHKIT_STATISTICS':'CANONICAL_RAW_RECOMPUTATION') as CanonicalDailyAggregate['aggregateSource'],
      rawLineageAvailable:all.some(o=>healthSourcePriority(o)<600)};});
};
