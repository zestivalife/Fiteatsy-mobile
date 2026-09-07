import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../src/db/pool.js';
import { migrateDatabase } from '../src/db/migrator.js';

type SourceAssessment = { assessmentId:string; sourceName:string; sourceUrl:string; rightsStatus:string; electronicProductReuse:string; nutritionUseDecision:string; numericValuesIngested:boolean };
type Decision = { decisionId:string; referenceItemId:string; evidenceClass:string; ifctRightsStatus:string; ifctNumericValuesIngested:boolean; activationEligible:boolean; finalDecision:string; processorVersion:string };
type LabRequest = { labRequestId:string; referenceItemId:string; evidenceClass:string; sampleCountry:string; preferredAccreditation:string; requiredScope:string; requiredAnalytes:string[]; requiredBasis:string; status:string };
type Artifact<T> = { schemaVersion:string; artifactSha256:string; cohortCount?:number; queueCount?:number; assessmentCount?:number; assessments?:T[]; decisions?:T[]; records?:T[] };
const load = <T>(filename:string) => JSON.parse(readFileSync(new URL(`../src/modules/nutrition/food-curation/data/${filename}`, import.meta.url), 'utf8')) as Artifact<T>;
const sources = load<SourceAssessment>('food_india_source_assessment_v17_35.json') as Artifact<SourceAssessment> & { assessments: SourceAssessment[] };
const decisions = load<Decision>('food_india_resolution_v17_35.json') as Artifact<Decision> & { decisions: Decision[] };
const labQueue = load<LabRequest>('food_india_lab_queue_v17_35.json') as Artifact<LabRequest> & { records: LabRequest[] };

const validate = () => {
  if (sources.schemaVersion !== 'FITEATSY_FOOD_INDIA_SOURCE_ASSESSMENT_V17_35' || sources.assessmentCount !== 8 || sources.assessments?.length !== 8) throw new Error('V17_35_SOURCE_ASSESSMENT_INVALID');
  if (decisions.schemaVersion !== 'FITEATSY_FOOD_INDIA_RESOLUTION_V17_35' || decisions.cohortCount !== 123 || decisions.decisions?.length !== 123) throw new Error('V17_35_DECISIONS_INVALID');
  if (labQueue.schemaVersion !== 'FITEATSY_FOOD_INDIA_LAB_QUEUE_V17_35' || labQueue.queueCount !== 123 || labQueue.records?.length !== 123) throw new Error('V17_35_LAB_QUEUE_INVALID');
  if (decisions.decisions.some((item) => item.ifctNumericValuesIngested || item.activationEligible || item.finalDecision !== 'INDIA_LAB_VALIDATION_REQUIRED')) throw new Error('V17_35_RIGHTS_BOUNDARY_VIOLATION');
};

const main = async () => {
  validate();
  await migrateDatabase();
  const client = await getPool().connect();
  let persisted = 0;
  let unchanged = 0;
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1,$2)', [20260907, 35]);
    for (const item of sources.assessments) {
      const result = await client.query(`insert into food_india_source_assessments_v17_35 (assessment_id,source_name,source_url,rights_status,electronic_product_reuse,nutrition_use_decision,numeric_values_ingested,artifact_sha256,assessment_payload) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) on conflict(assessment_id) do update set rights_status=excluded.rights_status,electronic_product_reuse=excluded.electronic_product_reuse,nutrition_use_decision=excluded.nutrition_use_decision,numeric_values_ingested=excluded.numeric_values_ingested,artifact_sha256=excluded.artifact_sha256,assessment_payload=excluded.assessment_payload,updated_at=now() where food_india_source_assessments_v17_35.assessment_payload <> excluded.assessment_payload or food_india_source_assessments_v17_35.artifact_sha256 <> excluded.artifact_sha256`, [item.assessmentId,item.sourceName,item.sourceUrl,item.rightsStatus,item.electronicProductReuse,item.nutritionUseDecision,item.numericValuesIngested,sources.artifactSha256,JSON.stringify(item)]);
      result.rowCount ? persisted++ : unchanged++;
    }
    for (const item of decisions.decisions) {
      const result = await client.query(`insert into food_india_resolution_v17_35 (decision_id,reference_item_id,final_decision,evidence_class,ifct_rights_status,ifct_numeric_values_ingested,activation_eligible,artifact_sha256,processor_version,decision_payload) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) on conflict(reference_item_id) do update set final_decision=excluded.final_decision,evidence_class=excluded.evidence_class,ifct_rights_status=excluded.ifct_rights_status,ifct_numeric_values_ingested=excluded.ifct_numeric_values_ingested,activation_eligible=excluded.activation_eligible,artifact_sha256=excluded.artifact_sha256,processor_version=excluded.processor_version,decision_payload=excluded.decision_payload,updated_at=now() where food_india_resolution_v17_35.decision_payload <> excluded.decision_payload or food_india_resolution_v17_35.artifact_sha256 <> excluded.artifact_sha256`, [item.decisionId,item.referenceItemId,item.finalDecision,item.evidenceClass,item.ifctRightsStatus,item.ifctNumericValuesIngested,item.activationEligible,decisions.artifactSha256,item.processorVersion,JSON.stringify(item)]);
      result.rowCount ? persisted++ : unchanged++;
    }
    for (const item of labQueue.records) {
      const result = await client.query(`insert into food_india_lab_queue_v17_35 (lab_request_id,reference_item_id,status,evidence_class,sample_country,preferred_accreditation,required_scope,required_analytes,required_basis,artifact_sha256,request_payload) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb) on conflict(reference_item_id) do update set status=excluded.status,evidence_class=excluded.evidence_class,sample_country=excluded.sample_country,preferred_accreditation=excluded.preferred_accreditation,required_scope=excluded.required_scope,required_analytes=excluded.required_analytes,required_basis=excluded.required_basis,artifact_sha256=excluded.artifact_sha256,request_payload=excluded.request_payload,updated_at=now() where food_india_lab_queue_v17_35.request_payload <> excluded.request_payload or food_india_lab_queue_v17_35.artifact_sha256 <> excluded.artifact_sha256`, [item.labRequestId,item.referenceItemId,item.status,item.evidenceClass,item.sampleCountry,item.preferredAccreditation,item.requiredScope,JSON.stringify(item.requiredAnalytes),item.requiredBasis,labQueue.artifactSha256,JSON.stringify(item)]);
      result.rowCount ? persisted++ : unchanged++;
    }
    await client.query(`update food_catalogue_reference_items reference set processing_status='TRIAGED_PENDING_EVIDENCE',processing_version='FOOD_INDIA_EVIDENCE_RESOLUTION_V17_35',evidence_status='INDIA_LAB_VALIDATION_REQUIRED' from food_india_resolution_v17_35 decision where reference.id=decision.reference_item_id and decision.artifact_sha256=$1`, [decisions.artifactSha256]);
    const counts = await Promise.all([
      client.query('select count(*)::int count from food_india_source_assessments_v17_35 where artifact_sha256=$1',[sources.artifactSha256]),
      client.query('select count(*)::int count from food_india_resolution_v17_35 where artifact_sha256=$1',[decisions.artifactSha256]),
      client.query('select count(*)::int count from food_india_lab_queue_v17_35 where artifact_sha256=$1',[labQueue.artifactSha256]),
    ]);
    if (Number(counts[0].rows[0].count) !== 8 || Number(counts[1].rows[0].count) !== 123 || Number(counts[2].rows[0].count) !== 123) throw new Error('V17_35_PERSISTENCE_COUNT_MISMATCH');
    await client.query('commit');
    process.stdout.write(`${JSON.stringify({ sourceAssessments:8, decisions:123, labQueue:123, persisted, unchanged, activationQueue:0, ifctNumericValues:0, decisionArtifactSha256:decisions.artifactSha256 })}\n`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
};

void main().catch(async (error) => { console.error(error instanceof Error ? error.message : error); await closePool(); process.exitCode = 1; });
