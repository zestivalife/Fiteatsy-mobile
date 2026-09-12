import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export type FoodExplorerProjectionRecord={
 projectionId:string;canonicalIdentityKey:string;sourceType:'GOVERNED'|'REFERENCE'|'APPROVED_PROPOSAL';sourceRecordId:string;
 sourceTrace:Array<{sourceType:string;sourceRecordId:string}>;canonicalName:string;normalizedName:string;aliases:string[];normalizedSearchText:string;
 category:string;family:string|null;foodState:string|null;nutritionStatus:string;generatorEligibility:string;entityType:string;operationalUseState:string;
 roles:string[];mealHeads:string[];vegetarianClass:string|null;active:boolean;searchable:boolean;manualAddable:boolean;generatorEligible:boolean;
 clientConsumable:boolean;pendingVerification:boolean;kcalPer100g:number|null;proteinPer100g:number|null;stableSortKey:string;displayPayload:Record<string,unknown>;
};

const hash=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function replaceFoodExplorerProjection(records:FoodExplorerProjectionRecord[]){
 const ordered=[...records].sort((a,b)=>a.canonicalIdentityKey.localeCompare(b.canonicalIdentityKey));
 const projectionHash=hash(ordered);const projectionVersion=`FOOD_EXPLORER_${projectionHash.slice(0,16)}`;
 const client=await pool.connect();
 try{await client.query('begin');await client.query('create temporary table next_food_explorer_projection (like food_explorer_search_projection including defaults) on commit drop');
  const refreshedAt=new Date().toISOString();const rows=ordered.map(r=>({projection_id:r.projectionId,canonical_identity_key:r.canonicalIdentityKey,source_type:r.sourceType,source_record_id:r.sourceRecordId,source_trace:r.sourceTrace,canonical_name:r.canonicalName,normalized_name:r.normalizedName,aliases:r.aliases,normalized_search_text:r.normalizedSearchText,category:r.category,family:r.family,food_state:r.foodState,nutrition_status:r.nutritionStatus,generator_eligibility:r.generatorEligibility,entity_type:r.entityType,operational_use_state:r.operationalUseState,roles:r.roles,meal_heads:r.mealHeads,vegetarian_class:r.vegetarianClass,active:r.active,searchable:r.searchable,manual_addable:r.manualAddable,generator_eligible:r.generatorEligible,client_consumable:r.clientConsumable,pending_verification:r.pendingVerification,kcal_per_100g:r.kcalPer100g,protein_per_100g:r.proteinPer100g,stable_sort_key:r.stableSortKey,source_priority:r.sourceType==='GOVERNED'?300:r.sourceType==='REFERENCE'?200:100,display_payload:r.displayPayload,projection_version:projectionVersion,projection_hash:hash(r),updated_at:refreshedAt}));
  await client.query(`insert into next_food_explorer_projection select * from jsonb_populate_recordset(null::food_explorer_search_projection,$1::jsonb)`,[JSON.stringify(rows)]);
  await client.query('delete from food_explorer_search_projection');
  await client.query('insert into food_explorer_search_projection select * from next_food_explorer_projection');
  const sourceCounts=Object.fromEntries(['GOVERNED','REFERENCE','APPROVED_PROPOSAL'].map(type=>[type,ordered.filter(row=>row.sourceType===type).length]));
  await client.query(`insert into food_explorer_projection_releases(projection_version,projection_hash,row_count,source_counts) values($1,$2,$3,$4)
    on conflict(projection_version) do update set projection_hash=excluded.projection_hash,row_count=excluded.row_count,source_counts=excluded.source_counts`,[projectionVersion,projectionHash,ordered.length,sourceCounts]);
  await client.query('commit');return {projectionVersion,projectionHash,rowCount:ordered.length,sourceCounts};
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}

export type ProjectionSearch={scope?:'ALL'|'RECOMMENDED';search?:string;category?:string;family?:string;referenceState?:string;nutritionStatus?:string;generatorEligibility?:string;entityType?:string;componentRole?:string;dietClass?:string;mealHead?:string;proteinMin?:number;proteinMax?:number;caloriesMin?:number;caloriesMax?:number;limit:number;offset:number;allowedIds?:string[]};
const filters=(input:ProjectionSearch)=>{const values:unknown[]=[];const where=['active','searchable'];const bind=(v:unknown)=>{values.push(v);return `$${values.length}`;};
 if(input.scope!=='ALL'){where.push('generator_eligible','client_consumable');if(input.allowedIds)where.push(`projection_id=any(${bind(input.allowedIds)}::text[])`);}
 if(input.search)where.push(`normalized_search_text like '%'||${bind(input.search.toLowerCase())}||'%'`);
 if(input.category)where.push(`category=${bind(input.category)}`);if(input.family)where.push(`family=${bind(input.family)}`);if(input.referenceState)where.push(`food_state=${bind(input.referenceState)}`);
 if(input.nutritionStatus)where.push(input.nutritionStatus==='NUTRITION_PENDING'?`(nutrition_status=${bind(input.nutritionStatus)} or pending_verification)`: `nutrition_status=${bind(input.nutritionStatus)}`);
 if(input.generatorEligibility)where.push(`generator_eligibility=${bind(input.generatorEligibility)}`);if(input.entityType)where.push(`entity_type=${bind(input.entityType)}`);
 if(input.componentRole)where.push(`${bind(input.componentRole)}=any(roles)`);if(input.dietClass)where.push(`vegetarian_class=${bind(input.dietClass)}`);
 if(input.proteinMin!=null)where.push(`protein_per_100g>=${bind(input.proteinMin)}`);if(input.proteinMax!=null)where.push(`protein_per_100g<=${bind(input.proteinMax)}`);
 if(input.caloriesMin!=null)where.push(`kcal_per_100g>=${bind(input.caloriesMin)}`);if(input.caloriesMax!=null)where.push(`kcal_per_100g<=${bind(input.caloriesMax)}`);
 return {values,sql:where.join(' and ')};};

export async function searchFoodExplorerProjection(input:ProjectionSearch){const {values,sql}=filters(input);const pageValues=[...values,input.limit,input.offset];
 const page=pool.query(`select display_payload from food_explorer_search_projection where ${sql} order by stable_sort_key,projection_id limit $${values.length+1} offset $${values.length+2}`,pageValues);
 const aggregate=pool.query(`with filtered as (select category,food_state,nutrition_status,generator_eligibility,entity_type,operational_use_state,roles,manual_addable,pending_verification,display_payload from food_explorer_search_projection where ${sql}) select
  count(*)::int total,count(*) filter(where nutrition_status='NUTRITION_VERIFIED')::int nutrition_verified,count(*) filter(where nutrition_status='REFERENCE_ONLY')::int reference_only,count(*) filter(where generator_eligibility='ELIGIBLE')::int generator_eligible,count(*) filter(where pending_verification)::int nutrition_pending,
  count(*) filter(where display_payload->>'preparedEligibility'='PRODUCTION_ACTIVE')::int prepared_active,
  (select projection_version from food_explorer_projection_releases order by activated_at desc limit 1) projection_version,
  (select row_count from food_explorer_projection_releases order by activated_at desc limit 1)::int projection_row_count,
  coalesce((select jsonb_agg(x order by x.count desc,x.value) from (select category value,count(*)::int count from filtered group by category)x),'[]') categories,
  coalesce((select jsonb_agg(x order by x.count desc,x.value) from (select food_state value,count(*)::int count from filtered group by food_state)x),'[]') states,
  coalesce((select jsonb_agg(x order by x.count desc,x.value) from (select nutrition_status value,count(*)::int count from filtered group by nutrition_status)x),'[]') nutrition_statuses,
  coalesce((select jsonb_agg(x order by x.count desc,x.value) from (select generator_eligibility value,count(*)::int count from filtered group by generator_eligibility)x),'[]') generator_eligibilities,
  coalesce((select jsonb_agg(x order by x.count desc,x.value) from (select entity_type value,count(*)::int count from filtered group by entity_type)x),'[]') entity_types,
  coalesce((select jsonb_agg(x order by x.count desc,x.value) from (select operational_use_state value,count(*)::int count from filtered group by operational_use_state)x),'[]') operational_states,
  coalesce((select jsonb_agg(x order by x.count desc,x.value) from (select role value,count(*)::int count from filtered cross join lateral unnest(roles) role group by role)x),'[]') roles from filtered`,values);
 const [p,a]=await Promise.all([page,aggregate]);return {items:p.rows.map(row=>row.display_payload),summary:a.rows[0]};}
