import crypto from 'node:crypto';
import { closePool, getPool } from '../src/db/pool.js';
import { migrateDatabase } from '../src/db/migrator.js';
import { createUsdaActivationV1733A2Records, FOOD_USDA_ACTIVATION_V17_33A2_ARTIFACT_SHA256 } from '../src/modules/nutrition/food-usda-activation-v17-33a2.js';

const records = createUsdaActivationV1733A2Records();

const main = async () => {
  await migrateDatabase();
  const client = await getPool().connect();
  let inserted = 0;
  let unchanged = 0;
  let auditInserted = 0;
  let auditUnchanged = 0;
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1,$2)', [20260907, 33]);
    for (const record of records) {
      const result = await client.query(
        `insert into food_catalogue_usda_activation_v17_33a2 (
          activation_id, reference_item_id, activation_type, governed_food_id, selected_fdc_id,
          source_mapping_id, nutrition_hash, serving_hash, operational_use_state, roles, meal_heads,
          generator_eligible, component_eligible, direct_add_eligible, alias_target_food_id,
          artifact_sha256, processor_version, activation_payload
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18::jsonb
        ) on conflict(reference_item_id) do update set
          activation_id=excluded.activation_id,
          activation_type=excluded.activation_type,
          governed_food_id=excluded.governed_food_id,
          selected_fdc_id=excluded.selected_fdc_id,
          source_mapping_id=excluded.source_mapping_id,
          nutrition_hash=excluded.nutrition_hash,
          serving_hash=excluded.serving_hash,
          operational_use_state=excluded.operational_use_state,
          roles=excluded.roles,
          meal_heads=excluded.meal_heads,
          generator_eligible=excluded.generator_eligible,
          component_eligible=excluded.component_eligible,
          direct_add_eligible=excluded.direct_add_eligible,
          alias_target_food_id=excluded.alias_target_food_id,
          artifact_sha256=excluded.artifact_sha256,
          processor_version=excluded.processor_version,
          activation_payload=excluded.activation_payload
        where food_catalogue_usda_activation_v17_33a2.activation_payload <> excluded.activation_payload
           or food_catalogue_usda_activation_v17_33a2.artifact_sha256 <> excluded.artifact_sha256`,
        [
          record.activationId,
          record.referenceItemId,
          record.activationType,
          record.governedFoodId,
          record.selectedFdcId,
          record.sourceMappingId,
          record.nutritionHash,
          record.servingHash,
          record.operationalUse,
          JSON.stringify(record.roles),
          JSON.stringify(record.mealHeads),
          record.generatorEligible,
          record.componentEligible,
          record.directAddEligible,
          record.activationType === 'ALIAS_EXISTING' ? record.existingGovernedFoodId : null,
          FOOD_USDA_ACTIVATION_V17_33A2_ARTIFACT_SHA256,
          record.processorVersion,
          JSON.stringify(record)
        ]
      );
      if (result.rowCount) inserted += 1;
      else unchanged += 1;
      for (const eventType of record.auditEvents) {
        const audit = await client.query(
          `insert into food_catalogue_usda_activation_audit_v17_33a2
           (id, activation_id, reference_item_id, event_type, processor_version, event_payload)
           values ($1,$2,$3,$4,$5,$6::jsonb)
           on conflict(activation_id, event_type, processor_version) do nothing`,
          [crypto.randomUUID(), record.activationId, record.referenceItemId, eventType, record.processorVersion, JSON.stringify({ artifactSha256: FOOD_USDA_ACTIVATION_V17_33A2_ARTIFACT_SHA256, selectedFdcId: record.selectedFdcId })]
        );
        if (audit.rowCount) auditInserted += 1;
        else auditUnchanged += 1;
      }
    }
    await client.query(
      `update food_catalogue_reference_items reference
       set processing_status='VERIFIED',
           processing_version='FOOD_USDA_ACTIVATION_V17_33A2',
           evidence_status='NUTRITION_VERIFIED',
           operational_use_state=activation.operational_use_state,
           target_roles=activation.roles
       from food_catalogue_usda_activation_v17_33a2 activation
       where reference.id=activation.reference_item_id
         and activation.artifact_sha256=$1`,
      [FOOD_USDA_ACTIVATION_V17_33A2_ARTIFACT_SHA256]
    );
    await client.query('commit');
    process.stdout.write(`${JSON.stringify({
      startingQueue: records.length,
      inserted,
      unchanged,
      auditInserted,
      auditUnchanged,
      newGovernedMappings: records.filter((record) => record.activationType === 'NEW_USDA_MAPPING').length,
      aliasesMerged: records.filter((record) => record.activationType === 'ALIAS_EXISTING').length,
      generatorActivations: records.filter((record) => record.generatorEligible).length,
      componentActivations: records.filter((record) => record.componentEligible).length,
      directAddActivations: records.filter((record) => record.directAddEligible).length,
      artifactSha256: FOOD_USDA_ACTIVATION_V17_33A2_ARTIFACT_SHA256
    })}\n`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
