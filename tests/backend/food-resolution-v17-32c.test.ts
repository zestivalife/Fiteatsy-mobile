import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import before from '../../backend/src/modules/nutrition/food-curation/data/food_resolution_v17_32c_before.json' with { type: 'json' };
import decisions from '../../backend/src/modules/nutrition/food-curation/data/food_resolution_v17_32c_decisions.json' with { type: 'json' };
import queue from '../../backend/src/modules/nutrition/food-curation/data/food_activation_queue_v17_32c2.json' with { type: 'json' };
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';

const terminalDecisions = new Set([
  'READY_FOR_GENERATOR_ACTIVATION',
  'READY_FOR_COMPONENT_ACTIVATION',
  'READY_FOR_DIRECT_ADD_ACTIVATION',
  'READY_FOR_INGREDIENT_ONLY',
  'READY_FOR_SECONDARY_ONLY',
  'EXISTING_GOVERNED_IDENTITY_ALIAS',
  'STATE_MISMATCH_CONFIRMED',
  'IDENTITY_AMBIGUOUS_CONFIRMED',
  'SPECIES_AMBIGUOUS',
  'RIGHTS_BLOCKED',
  'PREPARED_PROVENANCE_REQUIRED',
  'EXTERNAL_SOURCE_REQUIRED',
  'NOT_SUITABLE_FOR_ACTIVATION',
]);
const activationDecisions = new Set([
  'READY_FOR_GENERATOR_ACTIVATION',
  'READY_FOR_COMPONENT_ACTIVATION',
  'READY_FOR_DIRECT_ADD_ACTIVATION',
  'READY_FOR_INGREDIENT_ONLY',
  'READY_FOR_SECONDARY_ONLY',
  'EXISTING_GOVERNED_IDENTITY_ALIAS',
]);

test('v17.32C processes exactly the unresolved 138-food cohort', () => {
  assert.equal(before.baselineSha, '1dd095d201487f5932f5eaeb0c9e8c873c483181');
  assert.equal(before.cohortCount, 138);
  assert.equal(before.records.length, 138);
  assert.equal(new Set(before.records.map((item) => item.referenceItemId)).size, 138);
  assert.equal(decisions.decisionCount, 138);
  assert.equal(decisions.decisions.length, 138);
  assert.equal(new Set(decisions.decisions.map((item) => item.referenceItemId)).size, 138);
  assert.deepEqual(decisions.groupCounts, {
    DAIRY: 16,
    GLOBAL_GENERIC_COMMODITY: 41,
    INDIA_SPECIFIC_COMMODITY: 28,
    PROTEIN: 8,
    RAW_INGREDIENT: 45,
  });
});

test('v17.32C gives every record one terminal decision and preserves exact gates', () => {
  for (const item of decisions.decisions) {
    assert.ok(terminalDecisions.has(item.finalDecision), `${item.referenceItemId}:${item.finalDecision}`);
    assert.equal(item.processorVersion, 'FOOD_RESOLUTION_V17_32C');
    if (item.finalDecision === 'STATE_MISMATCH_CONFIRMED') assert.equal(item.stateMatch, 'MISMATCH');
    if (item.finalDecision === 'IDENTITY_AMBIGUOUS_CONFIRMED') assert.equal(item.identityMatch, 'AMBIGUOUS');
    if (activationDecisions.has(item.finalDecision)) {
      assert.ok(item.selectedSource, item.referenceItemId);
      assert.equal(item.rightsStatus, 'APPROVED_REUSE');
      assert.equal(item.nutrientCompleteness, 'COMPLETE_REQUIRED_VECTOR');
      assert.equal(item.stateMatch, 'EXACT');
    }
  }
});

test('v17.32C enforces rights and country-source gates by failing closed', () => {
  const unsupportedCountries = /\b(Pakistan|Bangladesh|Nepal)\b/i;
  for (const item of decisions.decisions) {
    assert.doesNotMatch(JSON.stringify(item.candidateSources), unsupportedCountries, item.referenceItemId);
    if (activationDecisions.has(item.finalDecision)) assert.equal(item.rightsStatus, 'APPROVED_REUSE');
    else assert.notEqual(item.finalDecision.startsWith('READY_FOR_'), true, item.referenceItemId);
  }
});

test('v17.32C does not infer prepared-food nutrition or queue duplicate governed identities', () => {
  assert.ok(decisions.decisions.every((item) => !/prepared dish inferred/i.test(item.rationale)));
  assert.equal(queue.schemaVersion, 'FITEATSY_FOOD_ACTIVATION_QUEUE_V17_32C2');
  assert.equal(queue.queueCount, queue.records.length);
  assert.equal(queue.records.length, decisions.decisions.filter((item) => activationDecisions.has(item.finalDecision)).length);
  assert.equal(new Set(queue.records.map((item) => item.referenceItemId)).size, queue.records.length);
  assert.equal(queue.records.length, 0);
});

test('v17.32C artifact remains resolution-only while current runtime includes later accepted activations', () => {
  const active = commonFoodCatalogue.filter((food) => food.active);
  const generator = active.filter((food) => food.generatorEligible && food.clientConsumable);
  const component = active.filter((food) => food.clientConsumable);
  assert.equal(queue.records.length, 0);
  assert.equal(generator.length, 115);
  assert.equal(component.length, 126);
});

test('v17.32C artifacts are deterministic and hash-addressed', () => {
  assert.match(decisions.artifactSha256, /^[a-f0-9]{64}$/);
  assert.match(queue.sourceArtifactSha256, /^[a-f0-9]{64}$/);
  assert.equal(queue.sourceArtifactSha256, decisions.artifactSha256);
  const decisionBytes = readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/food_resolution_v17_32c_decisions.json', import.meta.url));
  const queueBytes = readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/food_activation_queue_v17_32c2.json', import.meta.url));
  assert.match(createHash('sha256').update(decisionBytes).digest('hex'), /^[a-f0-9]{64}$/);
  assert.match(createHash('sha256').update(queueBytes).digest('hex'), /^[a-f0-9]{64}$/);
});
