import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import before from '../../backend/src/modules/nutrition/food-curation/data/food_unblock_v17_31_before.json' with { type: 'json' };
import artifact from '../../backend/src/modules/nutrition/food-curation/data/food_unblock_v17_31_decisions.json' with { type: 'json' };
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';

test('v17.31 before artifact captures exactly the persisted blocked cohort contract', () => {
  assert.equal(before.schemaVersion, 'FITEATSY_FOOD_UNBLOCK_V17_31_BEFORE');
  assert.equal(before.baselineSha, '1f25614416943dcea1c6777a9412323ee774c283');
  assert.equal(before.blockedCount, 186);
  assert.equal(before.records.length, 186);
  assert.equal(new Set(before.records.map((item) => item.referenceItemId)).size, 186);
  assert.equal(before.records.filter((item) => item.existingOperationalUse === 'DIRECT_ADDABLE').length, 40);
  assert.equal(before.records.filter((item) => item.existingOperationalUse === 'COMPONENT_ADDABLE').length, 3);
  assert.equal(before.records.filter((item) => item.existingOperationalUse === 'INGREDIENT_ONLY').length, 96);
  assert.equal(before.records.filter((item) => item.existingOperationalUse === 'PREPARATION_REQUIRED').length, 47);
});

test('v17.31 activates only exact repository-governed French beans evidence', () => {
  assert.equal(artifact.schemaVersion, 'FITEATSY_FOOD_UNBLOCK_V17_31');
  assert.equal(artifact.processorVersion, 'FOOD_UNBLOCK_V17_31');
  assert.equal(artifact.decisionCount, 186);
  assert.equal(artifact.newlyGeneratorEligible, 0);
  assert.equal(artifact.newlySourceMappedNotGenerator, 1);
  assert.equal(artifact.totalRemainingBlocked, 185);
  const mapped = artifact.decisions.filter((decision) => decision.outcome === 'SOURCE_MAPPED_NOT_GENERATOR');
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].referenceItemId, 'BATCH0_85');
  assert.equal(mapped[0].canonicalName, 'French beans');
  assert.equal(mapped[0].sourceMapping.fdcId, 2346400);
  assert.equal(mapped[0].operationalUse, 'COMPONENT_ADDABLE');
  assert.deepEqual(mapped[0].targetRoles, ['VEGETABLE']);
  assert.ok(artifact.decisions.filter((decision) => decision.outcome === 'EXTERNAL_SOURCE_REQUIRED').every((decision) => decision.sourceMapping === null));
});

test('v17.31 runtime overlay adds French beans searchability without duplicate source activation', () => {
  const active = commonFoodCatalogue.filter((food) => food.active);
  const generator = active.filter((food) => food.generatorEligible && food.clientConsumable);
  const component = active.filter((food) => food.clientConsumable);
  const greenBeans = commonFoodCatalogue.find((food) => food.sourceMappingId === 'USDA_FDC:2346400');
  assert.equal(commonFoodCatalogue.length, 80);
  assert.equal(generator.length, 63);
  assert.equal(component.length, 72);
  assert.equal(greenBeans?.displayName, 'Green beans');
  assert.equal(greenBeans?.aliases.includes('french beans'), true);
  assert.equal(commonFoodCatalogue.filter((food) => food.sourceMappingId === 'USDA_FDC:2346400').length, 1);
});

test('v17.31 importer and migration preserve additive ledger/audit contract', () => {
  const migration = readFileSync(new URL('../../backend/src/db/migrations/0058_food_unblock_v17_31.sql', import.meta.url), 'utf8');
  const importer = readFileSync(new URL('../../backend/scripts/import-food-unblock-v17-31.ts', import.meta.url), 'utf8');
  for (const outcome of ['ACTIVATED_DIRECT_ADDABLE', 'VERIFIED_INGREDIENT_ONLY', 'PREPARED_PROVENANCE_REQUIRED', 'EXTERNAL_SOURCE_REQUIRED']) assert.match(migration, new RegExp(outcome));
  for (const event of ['SOURCE_MAPPED', 'NUTRITION_VERIFIED', 'SERVING_VERIFIED', 'OPERATIONAL_USE_ASSIGNED', 'GENERATOR_ACTIVATED', 'FOOD_REMAINED_BLOCKED']) assert.match(migration, new RegExp(event));
  assert.match(importer, /on conflict\(reference_item_id\) do update set/);
  assert.match(importer, /delete from food_catalogue_v17_31_unblock_audit/);
  assert.match(createHash('sha256').update(readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/food_unblock_v17_31_decisions.json', import.meta.url))).digest('hex'), /^[a-f0-9]{64}$/);
});
