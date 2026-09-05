import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from '../src/db/pool.js';
import { migrateDatabase } from '../src/db/migrator.js';

type Decision = {
  decisionId: string;
  referenceItemId: string;
  sourceRecordId: string;
  canonicalName: string;
  aliases: string[];
  category: string;
  subcategory: string | null;
  referenceState: string;
  targetRoles: string[];
  operationalUse: string;
  outcome: string;
  generatorEligible: boolean;
  componentEligible: boolean;
  directAddEligible?: boolean;
  sourceMapping: {
    sourceId: string;
    fdcId: number;
    sourceFoodId: string;
    sourceDisplayName: string;
    sourceCategory: string;
    sourceVersion: string;
    rightsStatus: string;
  } | null;
  nutritionVector: unknown;
  servingProfile: unknown;
  mealHeadEligibility: string[];
  evidenceStatus: string;
  rationale: string;
};
type Artifact = {
  schemaVersion: string;
  baselineSha: string;
  processorVersion: 'FOOD_UNBLOCK_V17_31';
  decisionCount: number;
  decisions: Decision[];
};

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = path.join(backendRoot, 'src/modules/nutrition/food-curation/data/food_unblock_v17_31_decisions.json');
const artifactBytes = fs.readFileSync(artifactPath);
const artifact = JSON.parse(artifactBytes.toString('utf8')) as Artifact;
const artifactSha256 = crypto.createHash('sha256').update(artifactBytes).digest('hex');

const ALLOWED = new Set([
  'ACTIVATED_GENERATOR',
  'ACTIVATED_COMPONENT_ONLY',
  'ACTIVATED_DIRECT_ADDABLE',
  'VERIFIED_INGREDIENT_ONLY',
  'VERIFIED_SECONDARY_ONLY',
  'SOURCE_MAPPED_NOT_GENERATOR',
  'SOURCE_FOUND_STATE_MISMATCH',
  'SERVING_PROFILE_INCOMPLETE',
  'ONTOLOGY_ROLE_INCOMPLETE',
  'PREPARED_PROVENANCE_REQUIRED',
  'EXTERNAL_SOURCE_REQUIRED',
  'NOT_SUITABLE_FOR_GENERATOR',
  'BLOCKED_BY_GOVERNANCE'
]);

const auditEventsFor = (decision: Decision) => {
  if (decision.outcome === 'EXTERNAL_SOURCE_REQUIRED' || decision.outcome === 'PREPARED_PROVENANCE_REQUIRED' || decision.outcome === 'BLOCKED_BY_GOVERNANCE') return ['FOOD_REMAINED_BLOCKED'];
  const events = ['OPERATIONAL_USE_ASSIGNED'];
  if (decision.sourceMapping) events.push('SOURCE_MAPPED');
  if (decision.nutritionVector) events.push('NUTRITION_VERIFIED');
  if (decision.servingProfile) events.push('SERVING_VERIFIED');
  if (decision.generatorEligible) events.push('GENERATOR_ACTIVATED');
  if (decision.componentEligible) events.push('COMPONENT_ACTIVATED');
  if (decision.directAddEligible) events.push('DIRECT_ADD_ACTIVATED');
  return events;
};

const validate = () => {
  if (artifact.schemaVersion !== 'FITEATSY_FOOD_UNBLOCK_V17_31') throw new Error('FOOD_UNBLOCK_ARTIFACT_INVALID');
  if (artifact.baselineSha !== '1f25614416943dcea1c6777a9412323ee774c283') throw new Error('FOOD_UNBLOCK_BASELINE_MISMATCH');
  if (artifact.processorVersion !== 'FOOD_UNBLOCK_V17_31') throw new Error('FOOD_UNBLOCK_PROCESSOR_MISMATCH');
  if (artifact.decisionCount !== 186 || artifact.decisions.length !== 186) throw new Error('FOOD_UNBLOCK_DECISION_COUNT_MISMATCH');
  if (new Set(artifact.decisions.map((decision) => decision.referenceItemId)).size !== 186) throw new Error('FOOD_UNBLOCK_DUPLICATE_REFERENCE_ITEM');
  for (const decision of artifact.decisions) {
    if (!ALLOWED.has(decision.outcome)) throw new Error(`FOOD_UNBLOCK_UNKNOWN_OUTCOME:${decision.outcome}`);
    if (decision.generatorEligible && decision.outcome !== 'ACTIVATED_GENERATOR') throw new Error(`FOOD_UNBLOCK_GENERATOR_BOUNDARY:${decision.referenceItemId}`);
    if ((decision.generatorEligible || decision.componentEligible || decision.directAddEligible) && (!decision.sourceMapping || !decision.nutritionVector || !decision.servingProfile)) throw new Error(`FOOD_UNBLOCK_ACTIVATION_EVIDENCE_MISSING:${decision.referenceItemId}`);
  }
};

const main = async () => {
  validate();
  await migrateDatabase();
  const client = await getPool().connect();
  let inserted = 0;
  let unchanged = 0;
  let auditInserted = 0;
  let auditUnchanged = 0;
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1,$2)', [20260905, 31]);
    for (const decision of artifact.decisions) {
      const result = await client.query(
        `insert into food_catalogue_v17_31_unblock_decisions (
          decision_id, reference_item_id, artifact_sha256, processor_version, canonical_identity, aliases,
          category, subcategory, exact_state, preparation_state, source_organisation, dataset, source_record,
          source_version, source_rights_status, nutrition_vector, serving_profile, roles, meal_head_eligibility,
          operational_use_state, generator_eligible, component_eligible, direct_add_eligible, evidence_status,
          decision_outcome, rationale, decision_payload
        ) values (
          $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,
          $20,$21,$22,$23,$24,$25,$26,$27::jsonb
        ) on conflict(reference_item_id) do update set
          decision_id=excluded.decision_id,
          artifact_sha256=excluded.artifact_sha256,
          processor_version=excluded.processor_version,
          canonical_identity=excluded.canonical_identity,
          aliases=excluded.aliases,
          category=excluded.category,
          subcategory=excluded.subcategory,
          exact_state=excluded.exact_state,
          preparation_state=excluded.preparation_state,
          source_organisation=excluded.source_organisation,
          dataset=excluded.dataset,
          source_record=excluded.source_record,
          source_version=excluded.source_version,
          source_rights_status=excluded.source_rights_status,
          nutrition_vector=excluded.nutrition_vector,
          serving_profile=excluded.serving_profile,
          roles=excluded.roles,
          meal_head_eligibility=excluded.meal_head_eligibility,
          operational_use_state=excluded.operational_use_state,
          generator_eligible=excluded.generator_eligible,
          component_eligible=excluded.component_eligible,
          direct_add_eligible=excluded.direct_add_eligible,
          evidence_status=excluded.evidence_status,
          decision_outcome=excluded.decision_outcome,
          rationale=excluded.rationale,
          decision_payload=excluded.decision_payload
        where food_catalogue_v17_31_unblock_decisions.artifact_sha256 <> excluded.artifact_sha256
           or food_catalogue_v17_31_unblock_decisions.decision_payload <> excluded.decision_payload`,
        [
          decision.decisionId,
          decision.referenceItemId,
          artifactSha256,
          artifact.processorVersion,
          decision.canonicalName,
          JSON.stringify(decision.aliases),
          decision.category,
          decision.subcategory,
          decision.referenceState,
          decision.referenceState,
          decision.sourceMapping?.sourceId ?? null,
          decision.sourceMapping ? 'USDA FoodData Central' : null,
          decision.sourceMapping ? String(decision.sourceMapping.fdcId) : null,
          decision.sourceMapping?.sourceVersion ?? null,
          decision.sourceMapping?.rightsStatus ?? null,
          JSON.stringify(decision.nutritionVector),
          JSON.stringify(decision.servingProfile),
          JSON.stringify(decision.targetRoles),
          JSON.stringify(decision.mealHeadEligibility),
          decision.operationalUse,
          decision.generatorEligible,
          decision.componentEligible,
          decision.directAddEligible === true,
          decision.evidenceStatus,
          decision.outcome,
          decision.rationale,
          JSON.stringify(decision)
        ]
      );
      if (result.rowCount) inserted += 1;
      else unchanged += 1;
      const auditEvents = auditEventsFor(decision);
      await client.query(
        `delete from food_catalogue_v17_31_unblock_audit
         where reference_item_id=$1 and processor_version=$2 and not (event_type=any($3::text[]))`,
        [decision.referenceItemId, artifact.processorVersion, auditEvents]
      );
      for (const eventType of auditEvents) {
        const audit = await client.query(
          `insert into food_catalogue_v17_31_unblock_audit (id, reference_item_id, decision_id, event_type, processor_version, event_payload)
           values ($1,$2,$3,$4,$5,$6::jsonb)
           on conflict(reference_item_id, event_type, processor_version) do nothing`,
          [crypto.randomUUID(), decision.referenceItemId, decision.decisionId, eventType, artifact.processorVersion, JSON.stringify({ outcome: decision.outcome, artifactSha256 })]
        );
        if (audit.rowCount) auditInserted += 1;
        else auditUnchanged += 1;
      }
    }
    if (inserted + unchanged !== 186) throw new Error('FOOD_UNBLOCK_PERSISTENCE_COUNT_MISMATCH');
    await client.query(
      `update food_catalogue_reference_items reference
       set processing_status='VERIFIED',
           processing_version='FOOD_UNBLOCK_V17_31',
           evidence_status=decision.evidence_status,
           operational_use_state=decision.operational_use_state,
           target_roles=decision.roles
       from food_catalogue_v17_31_unblock_decisions decision
       where reference.id=decision.reference_item_id
         and decision.artifact_sha256=$1`,
      [artifactSha256]
    );
    await client.query('commit');
    process.stdout.write(`${JSON.stringify({
      decisionCount: artifact.decisions.length,
      inserted,
      unchanged,
      auditInserted,
      auditUnchanged,
      newlyGeneratorEligible: artifact.decisions.filter((decision) => decision.generatorEligible).length,
      newlyComponentEligible: artifact.decisions.filter((decision) => decision.componentEligible).length,
      remainingBlocked: artifact.decisions.filter((decision) => !decision.generatorEligible && !decision.componentEligible && decision.directAddEligible !== true).length,
      artifactSha256
    })}\n`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
};

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closePool();
  process.exitCode = 1;
});
