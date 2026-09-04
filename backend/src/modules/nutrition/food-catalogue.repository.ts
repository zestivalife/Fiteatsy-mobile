import { pool } from '../../db/pool.js';

export async function listReferenceCatalogueFoods(input:{search?:string;category?:string;referenceState?:string;limit:number;offset:number}){
  const values:unknown[]=['BATCH_0_PAN_INDIA_FOOD_SEED']; const where=['batch_id=$1'];
  const bind=(value:unknown)=>{values.push(value);return `$${values.length}`;};
  if(input.search){const p=bind(input.search);where.push(`(lower(canonical_name) like '%'||lower(${p})||'%' or lower(common_names::text) like '%'||lower(${p})||'%')`);}
  if(input.category)where.push(`category=${bind(input.category)}`);
  if(input.referenceState)where.push(`reference_state=${bind(input.referenceState)}`);
  values.push(input.limit,input.offset);
  const result=await pool.query(`select id,canonical_name,canonical_name display_name,subcategory,common_names,category food_category,reference_state,
    reference_nutrition_per_100g nutrition_per_100g,'CATALOGUED_REFERENCE' catalogue_status,'REFERENCE_ONLY' nutrition_status,verification_status,batch_id source_batch_id,count(*) over()::int total_count
    from food_catalogue_reference_items where ${where.join(' and ')} order by canonical_name,id limit $${values.length-1} offset $${values.length}`,values);
  return {rows:result.rows,total:Number(result.rows[0]?.total_count??0)};
}
