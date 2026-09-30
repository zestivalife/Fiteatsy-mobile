import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HealthObservationDraft } from '../types';
import { aggregateCanonicalHealthObservations, canonicalHealthDay, type CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';

const VERSION=3;
const SHARDS=256;
const qManifestKey=(scope:string)=>`@fiteatsy/health-queue-v${VERSION}:manifest:${scope}`;
const qKey=(scope:string,shard:number)=>`@fiteatsy/health-queue-v${VERSION}:${scope}:${shard}`;
const hManifestKey=(scope:string)=>`@fiteatsy/health-history-v${VERSION}:manifest:${scope}`;
const hKey=(scope:string,bucket:string)=>`@fiteatsy/health-history-v${VERSION}:${scope}:${bucket}`;
const migrationKey=(scope:string)=>`@fiteatsy/health-queue-v${VERSION}:migration:${scope}`;
const quarantineKey=(scope:string)=>`@fiteatsy/health-queue-v${VERSION}:quarantine:${scope}`;
const legacyKey=(scope:string,version:number)=>`@fiteatsy/health-sync-local-v${version}:${scope}`;
const identity=(item:HealthObservationDraft)=>item.syncKey??`${item.sourceProvider}:${item.metricType}:${item.sourceRecordId??item.measuredAtISO}`;
const hash=(value:string)=>{let result=2166136261;for(let i=0;i<value.length;i+=1){result^=value.charCodeAt(i);result=Math.imul(result,16777619);}return result>>>0;};
const shardFor=(key:string)=>hash(key)%SHARDS;
const bucketFor=(item:HealthObservationDraft,fallbackOffsetMinutes:number)=>encodeURIComponent(
  `${canonicalHealthDay(item,fallbackOffsetMinutes)}|${item.metricType}`);
type QueueRow={observation:HealthObservationDraft;updatedAtISO:string};
type QueueManifest={shards:number[];counts:Record<string,number>;pendingCount:number};
type HistoryManifest={buckets:string[]};
const parse=<T>(value:string|null,fallback:T):T=>{if(!value)return fallback;try{return JSON.parse(value)as T;}catch{return fallback;}};
const qManifest=async(scope:string)=>parse<QueueManifest>(await AsyncStorage.getItem(qManifestKey(scope)),{shards:[],counts:{},pendingCount:0});
const hManifest=async(scope:string)=>parse<HistoryManifest>(await AsyncStorage.getItem(hManifestKey(scope)),{buckets:[]});
const qShard=async(scope:string,shard:number)=>parse<Record<string,QueueRow>>(await AsyncStorage.getItem(qKey(scope,shard)),{});
const hBucket=async(scope:string,bucket:string)=>parse<Record<string,HealthObservationDraft>>(await AsyncStorage.getItem(hKey(scope,bucket)),{});
const scopeOperations=new Map<string,Promise<unknown>>();
const serializeScope=<T>(scope:string,operation:()=>Promise<T>):Promise<T>=>{
  const previous=scopeOperations.get(scope)??Promise.resolve();
  const current=previous.catch(()=>undefined).then(operation);scopeOperations.set(scope,current);
  return current.finally(()=>{if(scopeOperations.get(scope)===current)scopeOperations.delete(scope);});
};

export type ShardedPersistResult={pendingCount:number;latestByMetric:Record<string,HealthObservationDraft>};
export type HealthQueueMigrationSummary={totalBefore:number;acknowledgedRemoved:number;duplicatesRemoved:number;
  poisonQuarantined:number;uniquePendingRetained:number;totalAfter:number;dataLoss:'NONE'};
const persistShardedHealthBatchUnlocked=async(scope:string,items:HealthObservationDraft[],fallbackOffsetMinutes:number):Promise<ShardedPersistResult>=>{
  const [queue,history]=await Promise.all([qManifest(scope),hManifest(scope)]);const latestByMetric:Record<string,HealthObservationDraft>={};
  const byBucket=new Map<string,HealthObservationDraft[]>();
  items.forEach(item=>{const bucket=bucketFor(item,fallbackOffsetMinutes);byBucket.set(bucket,[...(byBucket.get(bucket)??[]),item]);
    const latest=latestByMetric[item.metricType];if(!item.deleted&&(!latest||item.measuredAtISO>=latest.measuredAtISO))latestByMetric[item.metricType]=item;});
  const enqueue:HealthObservationDraft[]=[];
  for(const [bucket,rows]of byBucket){const stored=await hBucket(scope,bucket);
    rows.forEach(row=>{const key=identity(row);if(JSON.stringify(stored[key])!==JSON.stringify(row))enqueue.push(row);stored[key]=row;});
    await AsyncStorage.setItem(hKey(scope,bucket),JSON.stringify(stored));if(!history.buckets.includes(bucket))history.buckets.push(bucket);}
  const byShard=new Map<number,HealthObservationDraft[]>();enqueue.forEach(item=>{const shard=shardFor(identity(item));byShard.set(shard,[...(byShard.get(shard)??[]),item]);});
  const updatedAtISO=new Date().toISOString();
  for(const [shard,rows]of byShard){const stored=await qShard(scope,shard);const before=Object.keys(stored).length;
    rows.forEach(row=>{stored[identity(row)]={observation:row,updatedAtISO};});const after=Object.keys(stored).length;
    await AsyncStorage.setItem(qKey(scope,shard),JSON.stringify(stored));if(!queue.shards.includes(shard))queue.shards.push(shard);
    queue.counts[String(shard)]=after;queue.pendingCount+=after-before;}
  await AsyncStorage.multiSet([[qManifestKey(scope),JSON.stringify(queue)],[hManifestKey(scope),JSON.stringify(history)]]);
  return{pendingCount:queue.pendingCount,latestByMetric};
};
export function persistShardedHealthBatch(scope:string,items:HealthObservationDraft[],fallbackOffsetMinutes:number) {
  return serializeScope(scope,()=>persistShardedHealthBatchUnlocked(scope,items,fallbackOffsetMinutes));
}
export const countShardedPending=async(scope:string)=>(await qManifest(scope)).pendingCount;
export const readShardedPending=async(scope:string,limit:number)=>{const manifest=await qManifest(scope);
  const output:{recordKey:string;observation:HealthObservationDraft}[]=[];
  for(const shard of manifest.shards){const rows=await qShard(scope,shard);for(const [recordKey,row]of Object.entries(rows).sort(([,a],[,b])=>a.updatedAtISO.localeCompare(b.updatedAtISO))){
    output.push({recordKey,observation:row.observation});if(output.length>=limit)return output;}}return output;};
export function acknowledgeShardedPending(scope:string,keys:string[]) { return serializeScope(scope,async()=>{const manifest=await qManifest(scope);const grouped=new Map<number,string[]>();
  keys.forEach(key=>{const shard=shardFor(key);grouped.set(shard,[...(grouped.get(shard)??[]),key]);});
  for(const[shard,recordKeys]of grouped){const rows=await qShard(scope,shard);let removed=0;recordKeys.forEach(key=>{if(rows[key]){delete rows[key];removed+=1;}});
    const count=Object.keys(rows).length;if(count)await AsyncStorage.setItem(qKey(scope,shard),JSON.stringify(rows));else await AsyncStorage.removeItem(qKey(scope,shard));
    manifest.pendingCount=Math.max(0,manifest.pendingCount-removed);manifest.counts[String(shard)]=count;if(!count)manifest.shards=manifest.shards.filter(value=>value!==shard);}
  await AsyncStorage.setItem(qManifestKey(scope),JSON.stringify(manifest));return manifest.pendingCount;}); }
export const recomputeShardedAggregates=async(scope:string,presentation:HealthObservationDraft[],fallbackOffsetMinutes:number,nowMs:number)=>{
  const manifest=await hManifest(scope);const presentationBuckets=new Map<string,HealthObservationDraft[]>();presentation.forEach(item=>{
    const row={...item,sourceProvider:item.sourceMetadata?.measurementMethod==='HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'?'platform_aggregate':item.sourceProvider};
    const bucket=bucketFor(row,fallbackOffsetMinutes);presentationBuckets.set(bucket,[...(presentationBuckets.get(bucket)??[]),row]);});
  const output:CanonicalDailyAggregate[]=[];for(const bucket of new Set([...manifest.buckets,...presentationBuckets.keys()])){
    const rows=[...Object.values(await hBucket(scope,bucket)),...(presentationBuckets.get(bucket)??[])];
    output.push(...aggregateCanonicalHealthObservations(rows,{fallbackOffsetMinutes,nowMs}));}return output;};

export const removeShardedQueueForTests=async(scope:string)=>{const manifest=await qManifest(scope);
  await AsyncStorage.multiRemove([...manifest.shards.map(shard=>qKey(scope,shard)),qManifestKey(scope)]);};

const validObservation=(value:unknown):value is HealthObservationDraft=>{if(!value||typeof value!=='object')return false;
  const item=value as Partial<HealthObservationDraft>;return typeof item.metricType==='string'&&typeof item.value==='number'
    &&Number.isFinite(item.value)&&typeof item.unit==='string'&&typeof item.measuredAtISO==='string'
    &&Number.isFinite(Date.parse(item.measuredAtISO))&&typeof item.sourceProvider==='string';};

/** Yield legacy record entries without materialising the legacy records map. */
function* legacyRecords(raw:string):Generator<[string,unknown]>{const marker='"records"';let cursor=raw.indexOf(marker);if(cursor<0)return;
  cursor=raw.indexOf('{',cursor+marker.length)+1;if(cursor<=0)return;
  while(cursor<raw.length){while(cursor<raw.length&&/[\s,]/.test(raw[cursor]))cursor+=1;if(raw[cursor]==='}')return;if(raw[cursor]!=='"')return;
    const keyStart=cursor;cursor+=1;let escaped=false;while(cursor<raw.length){const char=raw[cursor++];if(char==='"'&&!escaped)break;
      escaped=char==='\\'&&!escaped;if(char!=='\\')escaped=false;}let key:string;try{key=JSON.parse(raw.slice(keyStart,cursor))as string;}catch{return;}
    while(cursor<raw.length&&/\s/.test(raw[cursor]))cursor+=1;if(raw[cursor]!==':')return;cursor+=1;while(cursor<raw.length&&/\s/.test(raw[cursor]))cursor+=1;
    const start=cursor;let depth=0;let quoted=false;escaped=false;while(cursor<raw.length){const char=raw[cursor++];if(quoted){if(char==='"'&&!escaped)quoted=false;
      escaped=char==='\\'&&!escaped;if(char!=='\\')escaped=false;continue;}if(char==='"'){quoted=true;continue;}if(char==='{'||char==='[')depth+=1;
      if(char==='}'||char===']'){depth-=1;if(depth===0)break;}}
    try{yield[key,JSON.parse(raw.slice(start,cursor))];}catch{yield[key,null];}}
}

/**
 * One-time V1/V2 migration. Only one legacy string is resident at a time and
 * each record is copied in 100-row batches. Legacy blobs are retained as a
 * recoverable archive; V3 never opens them again after the completion marker.
 */
export const migrateLegacyHealthQueueToShards=async(scope:string):Promise<HealthQueueMigrationSummary>=>{
  const completed=parse<HealthQueueMigrationSummary|null>(await AsyncStorage.getItem(migrationKey(scope)),null);if(completed)return completed;
  const summary:HealthQueueMigrationSummary={totalBefore:0,acknowledgedRemoved:0,duplicatesRemoved:0,poisonQuarantined:0,
    uniquePendingRetained:0,totalAfter:await countShardedPending(scope),dataLoss:'NONE'};const quarantine:{recordKey:string;reason:string}[]=[];
  for(const version of[2,1]){const raw=await AsyncStorage.getItem(legacyKey(scope,version));if(!raw)continue;let batch:HealthObservationDraft[]=[];
    const flush=async()=>{if(!batch.length)return;const before=await countShardedPending(scope);await persistShardedHealthBatch(scope,batch,-new Date().getTimezoneOffset());
      const after=await countShardedPending(scope);summary.uniquePendingRetained+=after-before;summary.duplicatesRemoved+=batch.length-(after-before);batch=[];
      await new Promise<void>(resolve=>setTimeout(resolve,0));};
    for(const[recordKey,value]of legacyRecords(raw)){summary.totalBefore+=1;const row=value as{observation?:unknown;uploaded?:unknown}|null;
      if(row?.uploaded===true){summary.acknowledgedRemoved+=1;continue;}if(!validObservation(row?.observation)){summary.poisonQuarantined+=1;
        if(quarantine.length<1000)quarantine.push({recordKey,reason:'INVALID_LEGACY_OBSERVATION'});continue;}batch.push(row.observation);if(batch.length>=100)await flush();}
    await flush();}
  summary.totalAfter=await countShardedPending(scope);await AsyncStorage.multiSet([
    [quarantineKey(scope),JSON.stringify({count:summary.poisonQuarantined,items:quarantine})],
    [migrationKey(scope),JSON.stringify(summary)]
  ]);return summary;
};
