import { pool } from '../../db/pool.js';

export async function listReferenceCatalogueFoods(input:{search?:string;category?:string;referenceState?:string;limit:number;offset:number}){
  const values:unknown[]=['BATCH_0_PAN_INDIA_FOOD_SEED']; const where=['batch_id=$1'];
  const bind=(value:unknown)=>{values.push(value);return `$${values.length}`;};
  if(input.search){const p=bind(input.search);where.push(`(lower(canonical_name) like '%'||lower(${p})||'%' or lower(common_names::text) like '%'||lower(${p})||'%')`);}
  if(input.category)where.push(`category=${bind(input.category)}`);
  if(input.referenceState)where.push(`reference_state=${bind(input.referenceState)}`);
  values.push(input.limit,input.offset);
  const result=await pool.query(`select reference.id,reference.canonical_name,reference.canonical_name display_name,reference.subcategory,reference.common_names,reference.category food_category,reference.reference_state,
    reference.reference_nutrition_per_100g nutrition_per_100g,'CATALOGUED_REFERENCE' catalogue_status,'REFERENCE_ONLY' nutrition_status,reference.verification_status,reference.batch_id source_batch_id,
    reference.processing_status,reference.processing_version,reference.operational_use_state,reference.target_roles,reference.evidence_status,decision.outcome verification_outcome,count(*) over()::int total_count
    from food_catalogue_reference_items reference left join food_catalogue_p0_verification_decisions decision on decision.reference_item_id=reference.id
    where ${where.map(clause=>clause.replaceAll('batch_id','reference.batch_id').replaceAll('canonical_name','reference.canonical_name').replaceAll('common_names','reference.common_names').replaceAll('category','reference.category').replaceAll('reference_state','reference.reference_state')).join(' and ')} order by reference.canonical_name,reference.id limit $${values.length-1} offset $${values.length}`,values);
  return {rows:result.rows,total:Number(result.rows[0]?.total_count??0)};
}

export async function referenceCatalogueSummary(){
  const [totals,groups,states]=await Promise.all([
    pool.query(`select count(*)::int total,count(*) filter(where verification_status ilike '%pending%' or verification_status ilike '%reference%')::int nutrition_pending from food_catalogue_reference_items where batch_id=$1`,['BATCH_0_PAN_INDIA_FOOD_SEED']),
    pool.query(`select category label,count(*)::int count from food_catalogue_reference_items where batch_id=$1 group by category order by count desc,label`,['BATCH_0_PAN_INDIA_FOOD_SEED']),
    pool.query(`select reference_state label,count(*)::int count from food_catalogue_reference_items where batch_id=$1 group by reference_state order by count desc,label`,['BATCH_0_PAN_INDIA_FOOD_SEED']),
  ]);
  return {totals:totals.rows[0]??{total:0,nutrition_pending:0},groups:groups.rows,states:states.rows};
}

export async function listNutritionVerificationQueue(){
  const result=await pool.query(`select id,canonical_name,common_names,category,subcategory,reference_state,
    verification_priority priority,case verification_priority when 'P0' then 100 when 'P1' then 60 else 30 end priority_score,
    processing_status,processing_version,operational_use_state,target_roles,evidence_status,
    'AUTHORITATIVE_SOURCE_AND_SERVING_VERIFICATION_REQUIRED' pending_reason
    from food_catalogue_reference_items where batch_id=$1 order by priority_score desc,category,canonical_name`,['BATCH_0_PAN_INDIA_FOOD_SEED']);
  const counts=Object.fromEntries(['P0','P1','P2'].map(priority=>[priority,result.rows.filter(row=>row.priority===priority).length]));
  const processingCounts=Object.fromEntries([...new Set(result.rows.map(row=>row.processing_status))].sort().map(status=>[status,result.rows.filter(row=>row.processing_status===status).length]));
  return {items:result.rows,counts,processingCounts,total:result.rows.length,p0Processed:result.rows.filter(row=>row.priority==='P0'&&row.processing_status==='TRIAGED_PENDING_EVIDENCE').length,releaseSafety:'NO_REFERENCE_NUTRITION_ACTIVATED'};
}
