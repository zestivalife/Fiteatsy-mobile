import test from 'node:test';
import assert from 'node:assert/strict';
import {processPendingHealthRecalculations} from '../../backend/src/jobs/process-health-recalculations.ts';

test('durable health recalculation queue drains through canonical score calculation and acknowledges success',async()=>{
  const calls:string[]=[];
  const result=await processPendingHealthRecalculations(10,{
    claim:async()=>[{id:'queue-1',userId:'user-1',clientId:'client-1',healthDay:'2026-09-14',attempts:2}],
    calculate:async(owner,day)=>{calls.push(`calculate:${owner.accountId}:${owner.clientId}:${day}`);return[];},
    complete:async id=>{calls.push(`complete:${id}`);},
    fail:async()=>{throw new Error('unexpected failure acknowledgement');}
  });
  assert.deepEqual(result,{claimed:1,succeeded:1,failed:0});
  assert.deepEqual(calls,['calculate:user-1:client-1:2026-09-14','complete:queue-1']);
});

test('each claimed queue item is processed exactly once and an empty second drain is idempotent',async()=>{
  let pending=true;let calculations=0;let completions=0;
  const dependencies={
    claim:async()=>pending?[{id:'queue-1',userId:'user-1',clientId:'client-1',healthDay:'2026-09-14',attempts:2}]:[],
    calculate:async()=>{calculations+=1;},
    complete:async()=>{completions+=1;pending=false;},
    fail:async()=>{throw new Error('unexpected failure acknowledgement');}
  };
  assert.deepEqual(await processPendingHealthRecalculations(10,dependencies),{claimed:1,succeeded:1,failed:0});
  assert.deepEqual(await processPendingHealthRecalculations(10,dependencies),{claimed:0,succeeded:0,failed:0});
  assert.equal(calculations,1);assert.equal(completions,1);
});

test('failed canonical recalculation is acknowledged without preventing later items from draining',async()=>{
  const failed:string[]=[];const completed:string[]=[];
  const result=await processPendingHealthRecalculations(10,{
    claim:async()=>[
      {id:'bad',userId:'user-1',clientId:'client-1',healthDay:'2026-09-13',attempts:2},
      {id:'good',userId:'user-1',clientId:'client-1',healthDay:'2026-09-14',attempts:2}
    ],
    calculate:async(_owner,day)=>{if(day==='2026-09-13')throw new Error('TEMPORARY_SCORE_FAILURE');},
    complete:async id=>{completed.push(id);},fail:async(id,code)=>{failed.push(`${id}:${code}`);}
  });
  assert.deepEqual(result,{claimed:2,succeeded:1,failed:1});
  assert.deepEqual(failed,['bad:TEMPORARY_SCORE_FAILURE']);assert.deepEqual(completed,['good']);
});
