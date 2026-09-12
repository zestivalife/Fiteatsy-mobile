import { closePool, pool } from '../db/pool.js';

async function main(){
 if(process.env.RAILWAY_ENVIRONMENT_NAME!=='qa-diet-builder-acceptance')throw new Error('QA_ENVIRONMENT_REQUIRED');
 const cases:Record<string,[string,unknown[]]>={
  text:[`select display_payload from food_explorer_search_projection where active and searchable and normalized_search_text like '%'||$1||'%' order by stable_sort_key,projection_id limit 20`,['performance']],
  alias:[`select display_payload from food_explorer_search_projection where active and searchable and normalized_search_text like '%'||$1||'%' order by stable_sort_key,projection_id limit 20`,['qa approved alias 1']],
  category:[`select display_payload from food_explorer_search_projection where active and searchable and category=$1 order by stable_sort_key,projection_id limit 20`,['vegetable']],
  count:[`select count(*) from food_explorer_search_projection where active and searchable and normalized_search_text like '%'||$1||'%'`,['performance']],
  facets:[`select category,count(*) from food_explorer_search_projection where active and searchable group by category order by count(*) desc,category`,[]],
  page:[`select display_payload from food_explorer_search_projection where active and searchable order by stable_sort_key,projection_id limit 20 offset 40`,[]],
 };
 const report:Record<string,unknown>={};for(const [name,[sql,values]] of Object.entries(cases)){const result=await pool.query(`explain (analyze,buffers,format json) ${sql}`,values);const plan=result.rows[0]['QUERY PLAN'][0];report[name]={planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],plan:plan.Plan['Node Type'],index:plan.Plan['Index Name']??plan.Plan.Plans?.[0]?.['Index Name']??null,rows:plan.Plan['Actual Rows'],sharedHit:plan.Plan['Shared Hit Blocks'],sharedRead:plan.Plan['Shared Read Blocks'],tempRead:plan.Plan['Temp Read Blocks'],tempWritten:plan.Plan['Temp Written Blocks']};}
 console.log(JSON.stringify(report));
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'QA_EXPLAIN_FAILED');process.exitCode=1;}).finally(closePool);
