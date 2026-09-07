import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import decisions from '../../backend/src/modules/nutrition/food-curation/data/food_usda_mapping_v17_32b1_decisions.json' with { type: 'json' };
import before from '../../backend/src/modules/nutrition/food-curation/data/food_usda_mapping_v17_32b1_before.json' with { type: 'json' };
import queue from '../../backend/src/modules/nutrition/food-curation/data/food_usda_activation_queue_v17_32b2.json' with { type: 'json' };

const terminalDecisions = new Set([
  'READY_FOR_NEW_USDA_MAPPING',
  'EXISTING_GOVERNED_IDENTITY_ALIAS',
  'USDA_FOUND_STATE_MISMATCH',
  'USDA_FOUND_IDENTITY_AMBIGUOUS',
  'USDA_FOUND_NUTRIENTS_INCOMPLETE',
  'USDA_NO_EXACT_RECORD',
  'NOT_GLOBAL_GENERIC_AFTER_REVIEW',
]);
const ready = decisions.decisions.filter((item) => item.finalDecision === 'READY_FOR_NEW_USDA_MAPPING');
const aliases = decisions.decisions.filter((item) => item.finalDecision === 'EXISTING_GOVERNED_IDENTITY_ALIAS');
const queued = new Set(['READY_FOR_NEW_USDA_MAPPING', 'EXISTING_GOVERNED_IDENTITY_ALIAS']);

test('v17.32B-1 processes exactly the global generic commodity cohort', () => {
  assert.equal(before.schemaVersion, 'FITEATSY_FOOD_USDA_MAPPING_V17_32B1_BEFORE');
  assert.equal(before.baselineSha, '635d662cfed7e32580d973bf3f0f313c4f500da1');
  assert.equal(before.cohortCount, 88);
  assert.equal(before.records.length, 88);
  assert.equal(new Set(before.records.map((item) => item.referenceItemId)).size, 88);
  assert.equal(decisions.decisionCount, 88);
  assert.equal(decisions.decisions.length, 88);
  assert.equal(new Set(decisions.decisions.map((item) => item.referenceItemId)).size, 88);
  assert.ok(decisions.decisions.every((item) => item.processorVersion === 'FOOD_USDA_MAPPING_V17_32B1'));
  assert.ok(decisions.decisions.every((item) => terminalDecisions.has(item.finalDecision)));
});

test('v17.32B-1 enforces USDA state, identity, and macro gates', () => {
  for (const item of decisions.decisions) {
    assert.ok(item.finalDecision !== 'EXTERNAL_SOURCE_REQUIRED');
    assert.ok(Array.isArray(item.USDACandidates));
    if (queued.has(item.finalDecision)) {
      assert.ok(item.selectedFdcId);
      assert.ok(['EXACT', 'BOTANICALLY_EQUIVALENT'].includes(item.identityMatch));
      assert.equal(item.stateMatch, true);
      assert.equal(item.requiredNutrientsPresent, true);
      for (const key of ['kcal', 'protein', 'carbohydrate', 'fat']) assert.equal(Number.isFinite(item.nutrientVector[key]), true, `${item.referenceItemId}:${key}`);
      assert.doesNotMatch(item.selectedDescription, /\b(cooked|boiled|fried|roasted|canned|sprouted)\b/i);
      if (item.exactState === 'RAW') assert.match(item.selectedDescription, /\b(raw|fresh)\b/i);
      if (item.exactState === 'DRIED') assert.match(item.selectedDescription, /\b(dried|dry)\b/i);
    }
  }
});

test('v17.32B-1 blocks duplicate new USDA governed identities', () => {
  assert.equal(new Set(ready.map((item) => item.selectedFdcId)).size, ready.length);
  assert.ok(aliases.every((item) => item.existingGovernedFoodId));
  assert.ok(aliases.every((item) => !ready.some((readyItem) => readyItem.selectedFdcId === item.selectedFdcId)));
});

test('v17.32B-2 activation queue includes only ready or alias records', () => {
  assert.equal(queue.schemaVersion, 'FITEATSY_FOOD_USDA_ACTIVATION_QUEUE_V17_32B2');
  assert.equal(queue.queueCount, ready.length + aliases.length);
  assert.equal(queue.records.length, queue.queueCount);
  const decisionByReference = new Map(decisions.decisions.map((item) => [item.referenceItemId, item]));
  for (const item of queue.records) {
    const decision = decisionByReference.get(item.referenceItemId);
    assert.ok(decision);
    assert.ok(queued.has(decision.finalDecision));
    assert.equal(item.selectedFdcId, decision.selectedFdcId);
    assert.ok(['NEW_MAPPING', 'ALIAS_EXISTING'].includes(item.activationType));
  }
});

test('v17.32B-1 remains mapping-only and exposes only the activation queue', () => {
  assert.equal(ready.length, 43);
  assert.equal(aliases.length, 4);
  assert.equal(queue.records.filter((item) => item.activationType === 'NEW_MAPPING').length, 43);
  assert.equal(queue.records.filter((item) => item.activationType === 'ALIAS_EXISTING').length, 4);
  assert.match(createHash('sha256').update(readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/food_usda_mapping_v17_32b1_decisions.json', import.meta.url))).digest('hex'), /^[a-f0-9]{64}$/);
});
