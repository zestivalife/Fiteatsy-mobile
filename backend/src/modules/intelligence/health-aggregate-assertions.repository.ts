import crypto from 'node:crypto';
import {pool} from '../../db/pool.js';
import type {ClientOwnershipContext} from '../platform/platform.types.js';

export type AggregateAssertion={healthDay:string;metricType:string;value:number;unit:string;aggregateVersion:string;
  lineageHash:string;aggregateSource:string;rawLineageAvailable:boolean;calculatedAtISO:string};
export type BackendAggregate={date:string;metric:string;value:number;unit:string;lineageHash?:string};

export const persistAggregateAssertions=async(owner:ClientOwnershipContext,assertions:AggregateAssertion[],backend:BackendAggregate[])=>{
  const backendByKey=new Map(backend.map(row=>[`${row.date}|${row.metric}`,row]));const results=[];
  for(const assertion of assertions){const calculated=backendByKey.get(`${assertion.healthDay}|${assertion.metricType}`);
    const matches=Boolean(calculated&&calculated.unit===assertion.unit&&Math.abs(calculated.value-assertion.value)<0.0001);
    const parityStatus=calculated?(matches?'MATCH':'MISMATCH'):'PENDING';
    await pool.query(`insert into health_aggregate_assertions(id,user_id,client_id,health_day,metric_type,value,unit,
      aggregation_version,lineage_hash,aggregate_source,raw_lineage_available,calculated_at,backend_value,backend_lineage_hash,
      parity_status,reconciled_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,case when $15='PENDING' then null else now() end)
      on conflict(client_id,health_day,metric_type,aggregation_version) do update set value=excluded.value,unit=excluded.unit,
      lineage_hash=excluded.lineage_hash,aggregate_source=excluded.aggregate_source,raw_lineage_available=excluded.raw_lineage_available,
      calculated_at=excluded.calculated_at,backend_value=excluded.backend_value,backend_lineage_hash=excluded.backend_lineage_hash,
      parity_status=excluded.parity_status,reconciled_at=excluded.reconciled_at`,[`hassert_${crypto.randomUUID()}`,owner.accountId,
      owner.clientId,assertion.healthDay,assertion.metricType,assertion.value,assertion.unit,assertion.aggregateVersion,
      assertion.lineageHash,assertion.aggregateSource,assertion.rawLineageAvailable,assertion.calculatedAtISO,calculated?.value??null,
      calculated?.lineageHash??null,parityStatus]);
    results.push({healthDay:assertion.healthDay,metricType:assertion.metricType,status:parityStatus,localValue:assertion.value,
      backendValue:calculated?.value??null});
  }return results;
};

export const enqueueHealthRecalculation=async(owner:ClientOwnershipContext,healthDay:string,errorCode?:string)=>{
  await pool.query(`insert into health_intelligence_recalculation_queue(id,user_id,client_id,health_day,status,attempts,last_error_code)
    values($1,$2,$3,$4,'PENDING',1,$5) on conflict(client_id,health_day,status) do update set attempts=health_intelligence_recalculation_queue.attempts+1,
    last_error_code=excluded.last_error_code,requested_at=now()`,[`hrecalc_${crypto.randomUUID()}`,owner.accountId,owner.clientId,healthDay,errorCode??null]);
};

export type HealthRecalculationQueueItem={id:string;userId:string;clientId:string;healthDay:string;attempts:number};

export const claimPendingHealthRecalculations=async(limit=10):Promise<HealthRecalculationQueueItem[]>=>{
  const boundedLimit=Math.max(1,Math.min(50,Math.trunc(limit)));
  const result=await pool.query(`with pending as (
      select id from health_intelligence_recalculation_queue
      where status='PENDING' order by requested_at asc,id asc
      for update skip locked limit $1
    ) update health_intelligence_recalculation_queue queue
      set status='RUNNING',attempts=queue.attempts+1,last_error_code=null
      from pending where queue.id=pending.id
      returning queue.id,queue.user_id,queue.client_id,queue.health_day,queue.attempts`,[boundedLimit]);
  return result.rows.map(row=>({id:String(row.id),userId:String(row.user_id),clientId:String(row.client_id),
    healthDay:new Date(String(row.health_day)).toISOString().slice(0,10),attempts:Number(row.attempts)}));
};

export const completeHealthRecalculation=async(id:string)=>{
  await pool.query(`update health_intelligence_recalculation_queue set status='SUCCEEDED',completed_at=now(),last_error_code=null
    where id=$1 and status='RUNNING'`,[id]);
};

export const failHealthRecalculation=async(id:string,errorCode:string)=>{
  await pool.query(`update health_intelligence_recalculation_queue set status='FAILED',completed_at=now(),last_error_code=$2
    where id=$1 and status='RUNNING'`,[id,errorCode.slice(0,100)]);
};
