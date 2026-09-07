import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sources from '../../backend/src/modules/nutrition/food-curation/data/food_india_source_assessment_v17_35.json' with { type: 'json' };
import decisions from '../../backend/src/modules/nutrition/food-curation/data/food_india_resolution_v17_35.json' with { type: 'json' };
import labQueue from '../../backend/src/modules/nutrition/food-curation/data/food_india_lab_queue_v17_35.json' with { type: 'json' };
import closure from '../../backend/src/modules/nutrition/food-curation/data/food_catalogue_closure_v17_34.json' with { type: 'json' };
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';

test('v17.35 processes exactly the frozen 123-item blocked cohort', () => {
  const blocked = closure.records.filter((item) => item.terminalState === 'BLOCKED_EVIDENCE');
  assert.equal(decisions.baselineSha, '6b90f3fe06cf6ff1402cc8852dda208076615ea7');
  assert.equal(decisions.cohortCount, 123);
  assert.equal(decisions.decisions.length, 123);
  assert.deepEqual(new Set(decisions.decisions.map((item) => item.referenceItemId)), new Set(blocked.map((item) => item.referenceItemId)));
  assert.deepEqual(decisions.evidenceClassCounts, { DAIRY:16, GLOBAL_GENERIC_COMMODITY:26, INDIA_SPECIFIC_COMMODITY:28, PROTEIN:8, RAW_INGREDIENT:45 });
});

test('v17.35 prohibits IFCT electronic product ingestion without written permission', () => {
  const ifct = sources.assessments.find((item) => item.assessmentId === 'V1735_SOURCE_IFCT2017_NIN');
  assert.equal(sources.ifctElectronicReuseCleared, false);
  assert.equal(ifct?.rightsStatus, 'PRIOR_WRITTEN_PERMISSION_REQUIRED');
  assert.equal(ifct?.electronicProductReuse, 'NOT_CLEARED');
  assert.equal(ifct?.nutritionUseDecision, 'PROHIBITED');
  assert.equal(ifct?.numericValuesIngested, false);
  assert.match(ifct?.sourceDocumentSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(decisions.ifctNumericValueCount, 0);
  assert.ok(decisions.decisions.every((item) => item.ifctNumericValuesIngested === false && item.nutritionVector === null));
});

test('v17.35 records the reusable India-first alternative but rejects incomplete activation evidence', () => {
  const ogd = sources.assessments.find((item) => item.assessmentId === 'V1735_SOURCE_OGD_ICAR_NUTRIENT_WATER_PRODUCTIVITY');
  assert.equal(ogd?.rightsStatus, 'GODL_REUSE_ALLOWED_WITH_ATTRIBUTION');
  assert.equal(ogd?.electronicProductReuse, 'CLEARED');
  assert.equal(ogd?.nutritionUseDecision, 'NOT_ACTIVATION_ELIGIBLE');
  assert.equal(ogd?.numericValuesIngested, false);
  assert.equal(sources.activationEligibleAlternativeCount, 0);
  assert.equal(decisions.activationQueueCount, 0);
});

test('v17.35 fails every unresolved identity closed into the India lab queue', () => {
  assert.deepEqual(decisions.decisionCounts, { INDIA_LAB_VALIDATION_REQUIRED:123 });
  assert.equal(labQueue.queueCount, 123);
  assert.equal(labQueue.records.length, 123);
  assert.equal(new Set(labQueue.records.map((item) => item.referenceItemId)).size, 123);
  for (const item of decisions.decisions) {
    assert.equal(item.finalDecision, 'INDIA_LAB_VALIDATION_REQUIRED');
    assert.equal(item.activationEligible, false);
    assert.equal(item.selectedSource, null);
    assert.equal(commonFoodCatalogue.some((food) => food.id === item.referenceItemId), false, item.referenceItemId);
  }
  for (const item of labQueue.records) {
    assert.equal(item.sampleCountry, 'INDIA');
    assert.equal(item.preferredAccreditation, 'NABL_ISO_IEC_17025');
    assert.equal(item.requiredScope, 'FOOD_PROXIMATE_ANALYSIS');
    assert.deepEqual(item.requiredAnalytes, ['ENERGY_KCAL','PROTEIN_G','CARBOHYDRATE_G','FAT_G','FIBRE_G','MOISTURE_G','ASH_G']);
  }
});

test('v17.35 migration and importer enforce idempotent fail-closed persistence', () => {
  const migration = readFileSync(new URL('../../backend/src/db/migrations/0062_food_india_evidence_resolution_v17_35.sql', import.meta.url), 'utf8');
  const importer = readFileSync(new URL('../../backend/scripts/import-food-india-resolution-v17-35.ts', import.meta.url), 'utf8');
  assert.match(migration, /check\(not ifct_numeric_values_ingested\)/);
  assert.match(migration, /check\(not activation_eligible\)/);
  assert.match(importer, /on conflict\(reference_item_id\) do update/g);
  assert.match(importer, /V17_35_PERSISTENCE_COUNT_MISMATCH/);
});
