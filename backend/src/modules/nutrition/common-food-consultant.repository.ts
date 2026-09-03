import { pool } from '../../db/pool.js';
import type { GeneratedCombination, MealHead } from './common-food-engine.js';

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

export async function getCombinationOption(id:string,planId:string):Promise<CombinationSnapshot|null>{
  const result=await pool.query(`select * from diet_plan_combination_options where (logical_option_id=$1 or id=$1) and diet_plan_id=$2 order by version desc limit 1`,[id,planId]);
  const row=result.rows[0]; if(!row)return null;
  return {combinationId:String(row.logical_option_id),mealHead:String(row.meal_head) as MealHead,components:row.components_snapshot,
    nutrition:row.nutrition_snapshot,templateId:`TPL_${row.meal_head}`,templateVersion:String(row.template_version),
    generatorVersion:String(row.generator_version),rankingVersion:String(row.ranking_version),diversitySignature:String(row.diversity_signature),
    preferenceScore:0,nutritionScore:0,overallScore:0,warnings:row.warnings,shortages:[],optionHash:String(row.option_sha256),snapshotVersion:Number(row.version)};
}

export async function listCombinationOptions(planId:string,planVersionId:string){
  const result=await pool.query(`select distinct on (logical_option_id) logical_option_id from diet_plan_combination_options where diet_plan_id=$1 and diet_plan_version_id=$2 order by logical_option_id,version desc`,[planId,planVersionId]);
  return Promise.all(result.rows.map((row)=>getCombinationOption(String(row.logical_option_id),planId)));
}
