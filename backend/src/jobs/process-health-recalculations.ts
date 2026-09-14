import { pathToFileURL } from 'node:url';
import { calculateCanonicalHealthScores } from '../modules/intelligence/canonical-health-calculation-engine.js';
import {
  claimPendingHealthRecalculations,
  completeHealthRecalculation,
  failHealthRecalculation,
  type HealthRecalculationQueueItem
} from '../modules/intelligence/health-aggregate-assertions.repository.js';

type RecalculationDependencies={
  claim:(limit:number)=>Promise<HealthRecalculationQueueItem[]>;
  calculate:(owner:{accountId:string;clientId:string},healthDay:string)=>Promise<unknown>;
  complete:(id:string)=>Promise<void>;
  fail:(id:string,errorCode:string)=>Promise<void>;
};

const productionDependencies:RecalculationDependencies={
  claim:claimPendingHealthRecalculations,
  calculate:calculateCanonicalHealthScores,
  complete:completeHealthRecalculation,
  fail:failHealthRecalculation
};

export const processPendingHealthRecalculations=async(
  limit=10,
  dependencies:RecalculationDependencies=productionDependencies
)=>{
  const items=await dependencies.claim(limit);
  const result={claimed:items.length,succeeded:0,failed:0};
  for(const item of items){
    try{
      await dependencies.calculate({accountId:item.userId,clientId:item.clientId},item.healthDay);
      await dependencies.complete(item.id);
      result.succeeded+=1;
    }catch(error){
      const code=error instanceof Error&&error.message?error.message:'RECALCULATION_FAILED';
      await dependencies.fail(item.id,code);
      result.failed+=1;
    }
  }
  return result;
};

export const scheduleHealthRecalculationProcessor=(intervalMs=60_000)=>{
  let running=false;
  const runSafely=()=>{
    if(running)return;
    running=true;
    void processPendingHealthRecalculations().catch(error=>{
      console.error('[HealthRecalculation] queue drain failed',error);
    }).finally(()=>{running=false;});
  };
  runSafely();
  const timer=setInterval(runSafely,intervalMs);
  timer.unref?.();
  return timer;
};

const isDirectRun=process.argv[1]!=null&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(isDirectRun){
  processPendingHealthRecalculations().then(result=>console.log('[HealthRecalculation] queue drain complete',result))
    .catch(error=>{console.error('[HealthRecalculation] queue drain failed',error);process.exitCode=1;});
}
