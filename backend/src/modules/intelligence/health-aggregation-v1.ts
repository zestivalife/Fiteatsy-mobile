import type { HealthObservationRecord } from '../health/health-observations.repository.js';
import { aggregateCanonicalHealthObservations, HEALTH_INTELLIGENCE_VERSION, HEALTH_METRIC_SEMANTICS } from '@fiteatsy/health-intelligence';
export const METRIC_REGISTRY=HEALTH_METRIC_SEMANTICS;
export type DailyAggregate={date:string;metric:string;value:number;unit:string;method:string;observationIds:string[];freshness:'CURRENT'|'STALE'};
export const aggregateDaily=(observations:HealthObservationRecord[],now=Date.now()):DailyAggregate[]=>{
 return aggregateCanonicalHealthObservations(observations.map(o=>({...o,deleted:Boolean(o.deletedAtISO)})),{fallbackOffsetMinutes:0,nowMs:now})
  .map(row=>{const rule=METRIC_REGISTRY[row.metricType as keyof typeof METRIC_REGISTRY];return {date:row.healthDay,metric:row.metricType,value:row.value,
    unit:row.unit,method:row.method,observationIds:row.sourceObservationIds,
    freshness:now-Date.parse(row.latestMeasuredAtISO)<=rule.freshHours*3600000?'CURRENT':'STALE'};});
};
export const baseline=(rows:DailyAggregate[],metric:string,today:string)=>{const eligible=rows.filter(r=>r.metric===metric&&r.date<=today).sort((a,b)=>b.date.localeCompare(a.date));const avg=(n:number)=>{const v=eligible.slice(0,n);return v.length?v.reduce((s,r)=>s+r.value,0)/v.length:null;};const current=eligible.find(r=>r.date===today)?.value??null,b7=avg(7),b28=avg(28);return {today:current,sevenDayAverage:b7,twentyEightDayBaseline:b28,trend:current!=null&&b7!=null?current-b7:null,deviation:current!=null&&b28!=null?current-b28:null,calculationVersion:HEALTH_INTELLIGENCE_VERSION};};
