import { closePool, pool } from '../db/pool.js';
import { createAuthSession } from '../modules/auth/auth.repository.js';

const percentile=(values:number[],p:number)=>{const sorted=[...values].sort((a,b)=>a-b);return Number(sorted[Math.ceil(sorted.length*p)-1].toFixed(2));};
const metric=(values:number[])=>({samples:values.length,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),maxMs:Number(Math.max(...values).toFixed(2))});

async function main(){
 if(process.env.NODE_ENV!=='production'||process.env.RAILWAY_ENVIRONMENT_NAME!=='qa-diet-builder-acceptance')throw new Error('QA_ENVIRONMENT_REQUIRED');
 const user=await pool.query("select id,account_purpose,status from users where id='QA_PERF_CONSULTANT_001'");if(user.rows[0]?.account_purpose!=='QA_TEST'||user.rows[0]?.status!=='active')throw new Error('QA_PERF_IDENTITY_REQUIRED');
 const client=await pool.query("select fiteatsy_client_id from fiteatsy_clients where account_user_id='QA_PERF_CLIENT_001' and status='active'");if(!client.rows[0])throw new Error('QA_PERF_CLIENT_REQUIRED');
 const session=await createAuthSession('QA_PERF_CONSULTANT_001',{userAgent:'food-explorer-private-qa-benchmark',ipAddress:null});
 const base=`http://127.0.0.1:${process.env.PORT??'8080'}/v1/consultants/clients/${client.rows[0].fiteatsy_client_id}/common-foods`;
 const cases={unfiltered:'scope=ALL&limit=20&offset=0',text:'scope=ALL&search=performance&limit=20&offset=0',alias:'scope=ALL&search=qa%20approved%20alias%201&limit=20&offset=0',category:'scope=ALL&category=vegetable&limit=20&offset=0',proposal:'scope=ALL&search=qa%20approved%20food&limit=20&offset=0',recommended:'scope=RECOMMENDED&mealHead=BREAKFAST&limit=20&offset=0',pagination:'scope=ALL&limit=20&offset=40'};
 const results:Record<string,ReturnType<typeof metric>>={};const samples:Record<string,any>={};let responseBytes=0;
 try{for(const [name,query] of Object.entries(cases)){const timings:number[]=[];for(let i=0;i<20;i++){const started=performance.now();const response=await fetch(`${base}?${query}&benchmark=${name}-${i}`,{headers:{authorization:`Bearer ${session.token}`}});const bytes=new Uint8Array(await response.arrayBuffer());if(response.status!==200)throw new Error(`BENCHMARK_HTTP_${response.status}:${name}`);responseBytes=Math.max(responseBytes,bytes.length);timings.push(performance.now()-started);if(i===0)samples[name]=JSON.parse(new TextDecoder().decode(bytes));}results[name]=metric(timings);}
  if(!samples.alias.items.some((item:any)=>item.aliases?.some((alias:string)=>alias.toLowerCase().includes('qa approved alias 1'))))throw new Error('ALIAS_PARITY_FAILED');
  if(!samples.proposal.items.some((item:any)=>String(item.displayName).toLowerCase().includes('qa approved food')))throw new Error('PROPOSAL_PARITY_FAILED');
  if(samples.category.items.some((item:any)=>item.category!=='vegetable'))throw new Error('CATEGORY_PARITY_FAILED');
  if(samples.pagination.offset!==40||samples.pagination.items.some((item:any)=>samples.unfiltered.items.some((first:any)=>first.id===item.id)))throw new Error('PAGINATION_PARITY_FAILED');
  for(const value of Object.values(samples) as any[])if(value.items.length>value.limit||value.total<value.items.length||!Array.isArray(value.facets.categories))throw new Error('RESPONSE_PARITY_FAILED');
  const concurrentStarted=performance.now();const concurrent=await Promise.all(Array.from({length:10},(_,i)=>fetch(`${base}?scope=ALL&search=qa&limit=20&offset=${i*20}&benchmark=concurrent-${i}`,{headers:{authorization:`Bearer ${session.token}`}})));if(concurrent.some(response=>response.status!==200))throw new Error('CONCURRENT_REQUEST_FAILED');const concurrentMs=Number((performance.now()-concurrentStarted).toFixed(2));
  const all=Object.values(results).flatMap(result=>[result.p95Ms]);console.log(JSON.stringify({environment:'qa-diet-builder-acceptance',path:'RAILWAY_PRIVATE_DATABASE',results,coldP95Ms:Number(Math.max(...all).toFixed(2)),responseBytes,parity:{catalogue:'PASS',search:'PASS',aliases:'PASS',proposals:'PASS',facets:'PASS',totals:'PASS',pagination:'PASS',auth:'PASS'},concurrent:{requests:10,totalMs:concurrentMs,bounded:concurrentMs<2000}}));
 }finally{await pool.query('update auth_sessions set revoked_at=now() where id=$1',[session.session.id]);}
}

void main().catch(error=>{console.error(error instanceof Error?error.message:'QA_BENCHMARK_FAILED');process.exitCode=1;}).finally(closePool);
