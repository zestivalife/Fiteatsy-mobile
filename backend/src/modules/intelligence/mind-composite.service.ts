import crypto from 'node:crypto';
import { calculateMindCompositeV1, MIND_CHECK_IN_VERSION, MIND_COMPOSITE_METHODOLOGY_VERSION, type MindCheckInAnswers } from '@fiteatsy/health-intelligence';
import { pool } from '../../db/pool.js';
import { buildCandidateStarOrbRuntimeWindow } from './candidate-star-orb-runtime.js';
import { loadStarOrbRuntimeInputs } from './star-orb-runtime-loader.js';

const source=(value:{score:number|null;status:string;healthDay:string;calculatedAt:string;methodologyVersion:string})=>({score:value.score,status:value.status,healthDay:value.healthDay,calculatedAt:value.calculatedAt,methodologyVersion:value.methodologyVersion});
const rowDto=(row:Record<string,unknown>)=>row?({
  id:String(row.id),healthDay:String(row.health_day).slice(0,10),questionnaireVersion:String(row.questionnaire_version),
  answers:row.answers,questionnaireScore:Number(row.questionnaire_score),methodologyVersion:String(row.methodology_version),
  sourceComponents:row.source_components,score:row.composite_score==null?null:Number(row.composite_score),status:String(row.score_status),
  componentCoverage:Number(row.component_coverage),inputsUsed:row.inputs_used,inputsMissing:row.inputs_missing,
  calculatedAt:new Date(String(row.updated_at)).toISOString(),submittedAt:new Date(String(row.submitted_at)).toISOString(),
  domain:'mind',methodologyId:MIND_COMPOSITE_METHODOLOGY_VERSION,confidence:Number(row.component_coverage)===100?'HIGH':'MODERATE',
  inputFreshness:'CURRENT',contributingFactors:row.inputs_used,explanation:Number(row.component_coverage)===100?'Calculated from the daily check-in and all eligible Star Orb domains.':`Estimated Mind score with ${Number(row.component_coverage)}% component coverage.`,activation:'CANDIDATE_ONLY',clinicalValidation:'PENDING'
}):null;

export async function getMindComposite(accountId:string,clientId:string,healthDay:string){
  const result=await pool.query(`select * from mind_check_in_composites where user_id=$1 and client_id=$2 and health_day=$3::date and methodology_version=$4`,[accountId,clientId,healthDay,MIND_COMPOSITE_METHODOLOGY_VERSION]);
  return result.rows[0]?rowDto(result.rows[0]):null;
}

export async function upsertMindComposite(accountId:string,clientId:string,healthDay:string,timezone:string,answers:MindCheckInAnswers,tenantId:string){
  const inputs=await loadStarOrbRuntimeInputs(accountId,healthDay,{tenantId,timezone});
  const day=buildCandidateStarOrbRuntimeWindow(inputs,healthDay).days.find(item=>item.healthDay===healthDay);
  if(!day)throw new Error('MIND_SOURCE_DAY_UNAVAILABLE');
  const result=calculateMindCompositeV1({answers,healthDay,sources:{calm:source(day.calm),sleep:source(day.sleep),activity:source(day.activity),nutrition:source(day.nourishment)}});
  const saved=await pool.query(`insert into mind_check_in_composites(id,user_id,client_id,health_day,questionnaire_version,answers,questionnaire_score,methodology_version,source_components,composite_score,score_status,component_coverage,inputs_used,inputs_missing)
    values($1,$2,$3,$4::date,$5,$6::jsonb,$7,$8,$9::jsonb,$10,$11,$12,$13::jsonb,$14::jsonb)
    on conflict(user_id,client_id,health_day,methodology_version) do update set answers=excluded.answers,questionnaire_score=excluded.questionnaire_score,source_components=excluded.source_components,composite_score=excluded.composite_score,score_status=excluded.score_status,component_coverage=excluded.component_coverage,inputs_used=excluded.inputs_used,inputs_missing=excluded.inputs_missing,submitted_at=now(),updated_at=now() returning *`,[
      `mind_${crypto.randomUUID()}`,accountId,clientId,healthDay,MIND_CHECK_IN_VERSION,JSON.stringify(answers),result.questionnaireScore,MIND_COMPOSITE_METHODOLOGY_VERSION,JSON.stringify(result.sourceComponents),result.score,result.status,result.componentCoverage,JSON.stringify(result.inputsUsed),JSON.stringify(result.inputsMissing)]);
  return rowDto(saved.rows[0]);
}

export async function recalculateMindCompositeIfPresent(accountId:string,clientId:string,healthDay:string,timezone:string,tenantId:string){
  const current=await getMindComposite(accountId,clientId,healthDay);
  if(!current)return null;
  return upsertMindComposite(accountId,clientId,healthDay,timezone,current.answers as MindCheckInAnswers,tenantId);
}
