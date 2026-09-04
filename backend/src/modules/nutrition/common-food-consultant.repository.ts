import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import type { GeneratedCombination, MealHead } from './common-food-engine.js';
import { canonicalHash } from './food-curation/canonical-food-foundation.js';

export type CombinationSnapshot = GeneratedCombination & { optionHash: string; snapshotVersion: number };

export async function recordCommonFoodGeneration(input: {
  id: string; clientId: string; consultantId: string; inputHash: string; candidateCount: number;
  eligibleCount: number; options: GeneratedCombination[]; shortages: unknown; durationMs: number;
}) {
  await pool.query(`insert into common_food_generation_runs
    (id,client_id,consultant_id,generator_version,ranking_version,template_version,catalogue_snapshot_version,
     input_context_sha256,candidate_count,eligible_count,rejected_count,top_options,shortages,duration_ms)
    values ($1,$2,$3,'COMMON_FOOD_COMBINATION_ENGINE_V1','COMMON_FOOD_RANKING_V1','INDIA_COMMON_MEAL_TEMPLATES_V2',
      'NUTRITION_CATALOGUE_V1_1',$4,$5,$6,$7,$8,$9,$10)`, [input.id,input.clientId,input.consultantId,
      input.inputHash,input.candidateCount,input.eligibleCount,Math.max(0,input.candidateCount-input.options.length),
      JSON.stringify(input.options),JSON.stringify(input.shortages),input.durationMs]);
}

export async function saveCombinationOption(input:{
  id:string; logicalOptionId:string; supersedesId?:string|null; planId:string; planVersionId:string; mealHead:MealHead; snapshot:CombinationSnapshot;
  expectedPlanVersionId:string;
}) {
  const client=await pool.connect();
  try {
    await client.query('begin');
    const locked=await client.query('select current_version_id from diet_plans where id=$1 and deleted_at is null for update',[input.planId]);
    if (!locked.rows[0]) throw Object.assign(new Error('DIET_PLAN_NOT_FOUND'),{code:'DIET_PLAN_NOT_FOUND'});
    if (String(locked.rows[0].current_version_id)!==input.expectedPlanVersionId) throw Object.assign(new Error('STALE_PLAN_VERSION'),{code:'STALE_PLAN_VERSION'});
    await client.query(`insert into diet_plan_combination_options
      (id,logical_option_id,supersedes_id,diet_plan_id,diet_plan_version_id,meal_head,source_type,generator_version,ranking_version,template_version,
       catalogue_snapshot_version,components_snapshot,nutrition_snapshot,diversity_signature,warnings,option_sha256,version)
      values($1,$2,$3,$4,$5,$6,'MANUAL_COMBINATION',$7,$8,$9,'NUTRITION_CATALOGUE_V1_1',$10,$11,$12,$13,$14,$15)`,
      [input.id,input.logicalOptionId,input.supersedesId??null,input.planId,input.planVersionId,input.mealHead,input.snapshot.generatorVersion,input.snapshot.rankingVersion,
       input.snapshot.templateVersion,JSON.stringify(input.snapshot.components),JSON.stringify(input.snapshot.nutrition),
       input.snapshot.diversitySignature,JSON.stringify(input.snapshot.warnings),input.snapshot.optionHash,input.snapshot.snapshotVersion]);
    await client.query('commit');
  } catch(error){await client.query('rollback');throw error;} finally {client.release();}
}

export async function getCombinationOption(id:string,planId:string,planVersionId?:string):Promise<CombinationSnapshot|null>{
  const result=await pool.query(`select * from diet_plan_combination_options where (logical_option_id=$1 or id=$1) and diet_plan_id=$2 and ($3::uuid is null or diet_plan_version_id=$3) order by version desc limit 1`,[id,planId,planVersionId??null]);
  const row=result.rows[0]; if(!row)return null;
  return {combinationId:String(row.logical_option_id),mealHead:String(row.meal_head) as MealHead,components:row.components_snapshot,
    nutrition:row.nutrition_snapshot,templateId:`TPL_${row.meal_head}`,templateVersion:String(row.template_version),
    generatorVersion:String(row.generator_version),rankingVersion:String(row.ranking_version),diversitySignature:String(row.diversity_signature),
    preferenceScore:0,nutritionScore:0,overallScore:0,warnings:row.warnings,shortages:[],optionHash:String(row.option_sha256),snapshotVersion:Number(row.version)};
}

export async function listCombinationOptions(planId:string,planVersionId:string){
  const result=await pool.query(`with selected as (
      select logical_option_id,option_snapshot_id,meal_head,display_order from diet_plan_option_selections
      where diet_plan_id=$1 and diet_plan_version_id=$2
    ), legacy as (
      select logical_option_id,id option_snapshot_id,meal_head,row_number() over(partition by meal_head order by created_at desc,version desc,id desc) display_order
      from (select distinct on (logical_option_id) logical_option_id,meal_head,created_at,version,id
        from diet_plan_combination_options where diet_plan_id=$1 and diet_plan_version_id=$2
        order by logical_option_id,version desc,created_at desc,id desc) latest
      where not exists(select 1 from selected)
    )
    select logical_option_id,option_snapshot_id,meal_head,display_order from selected
    union all select logical_option_id,option_snapshot_id,meal_head,display_order from legacy where display_order<=5
    order by meal_head,display_order`,[planId,planVersionId]);
  return Promise.all(result.rows.map((row)=>getCombinationOption(String(row.option_snapshot_id),planId,planVersionId)));
}

export async function replaceCombinationOptionSelection(input:{planId:string;planVersionId:string;expectedPlanVersionId:string;options:CombinationSnapshot[]}){
 const client=await pool.connect();
 try{
  await client.query('begin');
  const locked=await client.query('select current_version_id from diet_plans where id=$1 and deleted_at is null for update',[input.planId]);
  if(!locked.rows[0])throw Object.assign(new Error('DIET_PLAN_NOT_FOUND'),{code:'DIET_PLAN_NOT_FOUND'});
  if(String(locked.rows[0].current_version_id)!==input.expectedPlanVersionId||input.planVersionId!==input.expectedPlanVersionId)throw Object.assign(new Error('STALE_PLAN_VERSION'),{code:'STALE_PLAN_VERSION'});
  const snapshotIds=new Map<string,string>();
  for(const option of input.options){
   const prior=await client.query('select id,version from diet_plan_combination_options where logical_option_id=$1 and diet_plan_id=$2 order by version desc limit 1',[option.combinationId,input.planId]);
   const version=Number(prior.rows[0]?.version??0)+1;const id=crypto.randomUUID();const optionHash=canonicalHash({logicalOptionId:option.combinationId,version,option});
   await client.query(`insert into diet_plan_combination_options
    (id,logical_option_id,supersedes_id,diet_plan_id,diet_plan_version_id,meal_head,source_type,generator_version,ranking_version,template_version,catalogue_snapshot_version,components_snapshot,nutrition_snapshot,diversity_signature,warnings,option_sha256,version)
    values($1,$2,$3,$4,$5,$6,'MANUAL_COMBINATION',$7,$8,$9,'NUTRITION_CATALOGUE_V1_1',$10,$11,$12,$13,$14,$15)`,
    [id,option.combinationId,prior.rows[0]?.id??null,input.planId,input.planVersionId,option.mealHead,option.generatorVersion,option.rankingVersion,option.templateVersion,JSON.stringify(option.components),JSON.stringify(option.nutrition),option.diversitySignature,JSON.stringify(option.warnings),optionHash,version]);
   snapshotIds.set(option.combinationId,id);
  }
  await client.query('delete from diet_plan_option_selections where diet_plan_version_id=$1',[input.planVersionId]);
  const order=new Map<string,number>();
  for(const option of input.options){const displayOrder=(order.get(option.mealHead)??0)+1;order.set(option.mealHead,displayOrder);await client.query(`insert into diet_plan_option_selections(diet_plan_id,diet_plan_version_id,logical_option_id,option_snapshot_id,meal_head,display_order) values($1,$2,$3,$4,$5,$6)`,[input.planId,input.planVersionId,option.combinationId,snapshotIds.get(option.combinationId),option.mealHead,displayOrder]);}
  await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 return listCombinationOptions(input.planId,input.planVersionId);
}

export async function freezeCombinationOptionsForLifecycle(planId:string,planVersionId:string){
  const options=(await listCombinationOptions(planId,planVersionId)).filter((x):x is CombinationSnapshot=>x!==null);
  const snapshotHash=canonicalHash({planId,planVersionId,options});
  const result=await pool.query(`update diet_plan_versions set common_food_options=$3::jsonb,common_food_snapshot_hash=$4,updated_at=now() where id=$2 and diet_plan_id=$1 and lifecycle_status in ('draft','changes_requested','submitted_for_review') returning id`,[planId,planVersionId,JSON.stringify(options),snapshotHash]);
  if(!result.rowCount)throw Object.assign(new Error('LIFECYCLE_SNAPSHOT_FREEZE_FAILED'),{code:'LIFECYCLE_SNAPSHOT_FREEZE_FAILED'});
  return {options,snapshotHash};
}
