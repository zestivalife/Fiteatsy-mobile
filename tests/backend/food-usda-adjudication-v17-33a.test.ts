import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import before from '../../backend/src/modules/nutrition/food-curation/data/food_usda_adjudication_v17_33a_before.json' with { type: 'json' };
import decisions from '../../backend/src/modules/nutrition/food-curation/data/food_usda_adjudication_v17_33a_decisions.json' with { type: 'json' };
import queue from '../../backend/src/modules/nutrition/food-curation/data/food_usda_activation_queue_v17_33a2.json' with { type: 'json' };
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';

const terminalDecisions = new Set([
  'READY_FOR_USDA_ACTIVATION',
  'EXISTING_GOVERNED_IDENTITY_ALIAS',
  'STATE_MISMATCH_CONFIRMED',
  'IDENTITY_AMBIGUOUS_CONFIRMED',
  'EDIBLE_PORTION_MISMATCH',
  'CULTIVAR_MISMATCH',
  'USDA_NO_EXACT_RECORD',
]);
const activationDecisions = new Set(['READY_FOR_USDA_ACTIVATION', 'EXISTING_GOVERNED_IDENTITY_ALIAS']);

test('v17.33A processes exactly the 35 USDA near-miss cohort', () => {
  assert.equal(before.schemaVersion, 'FITEATSY_FOOD_USDA_ADJUDICATION_V17_33A_BEFORE');
  assert.equal(before.baselineSha, 'f1c3ec584a72acdfa92863f049b32623e3cbf814');
  assert.equal(before.cohortCount, 35);
  assert.equal(before.records.length, 35);
  assert.deepEqual(before.priorDecisionCounts, {
    STATE_MISMATCH_CONFIRMED: 7,
    IDENTITY_AMBIGUOUS_CONFIRMED: 28,
  });
  assert.equal(decisions.decisionCount, 35);
  assert.equal(decisions.decisions.length, 35);
  assert.equal(new Set(decisions.decisions.map((item) => item.referenceItemId)).size, 35);
});

test('v17.33A terminally classifies every record without generic external fallback', () => {
  for (const item of decisions.decisions) {
    assert.ok(terminalDecisions.has(item.finalDecision), `${item.referenceItemId}:${item.finalDecision}`);
    assert.equal(item.processorVersion, 'FOOD_USDA_ADJUDICATION_V17_33A');
    assert.notEqual(item.finalDecision, 'EXTERNAL_SOURCE_REQUIRED');
    assert.ok(Array.isArray(item.USDACandidates));
    assert.ok(item.scientificIdentityExpected);
    assert.ok(item.ediblePortionExpected);
  }
});

test('v17.33A preserves state and edible-portion gates for activation-ready records', () => {
  for (const item of decisions.decisions.filter((record) => activationDecisions.has(record.finalDecision))) {
    assert.ok(item.selectedFdcId, item.referenceItemId);
    assert.ok(['EXACT', 'BOTANICALLY_EQUIVALENT'].includes(item.identityDecision), item.referenceItemId);
    assert.equal(item.stateMatch, true, item.referenceItemId);
    assert.equal(item.ediblePortionMatch, true, item.referenceItemId);
    assert.equal(item.nutrientCompleteness, 'COMPLETE_REQUIRED_VECTOR', item.referenceItemId);
    assert.doesNotMatch(item.selectedDescription ?? '', /\b(cooked|boiled|fried|roasted|canned|frozen|sprouted|flour)\b/i, item.referenceItemId);
    if (item.exactState === 'RAW') assert.ok(['RAW', 'FRESH'].includes(item.selectedState), item.referenceItemId);
    if (item.exactState === 'DRIED') assert.equal(item.selectedState, 'DRIED', item.referenceItemId);
    const selected = item.USDACandidates.find((candidate) => candidate.fdcId === item.selectedFdcId);
    for (const key of ['kcal', 'protein', 'carbohydrate', 'fat']) assert.equal(Number.isFinite(selected?.nutrientVector[key]), true, `${item.referenceItemId}:${key}`);
  }
});

test('v17.33A protects duplicate selected FDC identities through alias decisions', () => {
  const ready = decisions.decisions.filter((item) => item.finalDecision === 'READY_FOR_USDA_ACTIVATION');
  const aliases = decisions.decisions.filter((item) => item.finalDecision === 'EXISTING_GOVERNED_IDENTITY_ALIAS');
  assert.equal(new Set(ready.map((item) => item.selectedFdcId)).size, ready.length);
  assert.ok(aliases.every((item) => item.existingGovernedFoodId));
  assert.ok(aliases.every((item) => !ready.some((readyItem) => readyItem.selectedFdcId === item.selectedFdcId)));
});

test('v17.33A activation queue contains only approved adjudications', () => {
  const byReference = new Map(decisions.decisions.map((item) => [item.referenceItemId, item]));
  assert.equal(queue.schemaVersion, 'FITEATSY_FOOD_USDA_ACTIVATION_QUEUE_V17_33A2');
  assert.equal(queue.queueCount, queue.records.length);
  assert.equal(queue.records.length, decisions.decisions.filter((item) => activationDecisions.has(item.finalDecision)).length);
  assert.equal(queue.records.filter((item) => item.activationType === 'NEW_USDA_MAPPING').length, 12);
  assert.equal(queue.records.filter((item) => item.activationType === 'ALIAS_EXISTING').length, 3);
  for (const item of queue.records) {
    const decision = byReference.get(item.referenceItemId);
    assert.ok(decision);
    assert.ok(activationDecisions.has(decision.finalDecision));
    assert.equal(item.selectedFdcId, decision.selectedFdcId);
  }
});

test('v17.33A artifact remains adjudication-only while current runtime includes v17.33A-2 activations', () => {
  const active = commonFoodCatalogue.filter((food) => food.active);
  const generator = active.filter((food) => food.generatorEligible && food.clientConsumable);
  const component = active.filter((food) => food.clientConsumable);
  assert.equal(queue.records.length, 15);
  assert.ok(generator.length >= 115, `current generator pool regressed below the accepted v17.33A baseline: ${generator.length}`);
  assert.ok(component.length >= 126, `current component pool regressed below the accepted v17.33A baseline: ${component.length}`);
  assert.equal(new Set(active.map((food) => food.id)).size, active.length);
});

test('v17.33A artifacts are deterministic and hash-addressed', () => {
  assert.match(decisions.artifactSha256, /^[a-f0-9]{64}$/);
  assert.equal(queue.sourceArtifactSha256, decisions.artifactSha256);
  for (const path of [
    '../../backend/src/modules/nutrition/food-curation/data/food_usda_adjudication_v17_33a_before.json',
    '../../backend/src/modules/nutrition/food-curation/data/food_usda_adjudication_v17_33a_decisions.json',
    '../../backend/src/modules/nutrition/food-curation/data/food_usda_activation_queue_v17_33a2.json',
  ]) {
    const bytes = readFileSync(new URL(path, import.meta.url));
    assert.match(createHash('sha256').update(bytes).digest('hex'), /^[a-f0-9]{64}$/);
  }
});
