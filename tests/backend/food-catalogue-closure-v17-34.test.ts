import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import closure from '../../backend/src/modules/nutrition/food-curation/data/food_catalogue_closure_v17_34.json' with { type: 'json' };
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { isPracticalReferenceFood } from '../../backend/src/modules/nutrition/practical-indian-food-master.js';

test('v17.34 closes every P0 identity exactly once', () => {
  assert.equal(closure.schemaVersion, 'FITEATSY_FOOD_CATALOGUE_CLOSURE_V17_34');
  assert.equal(closure.baselineSha, '6e04e67899a4e187fe8e4032bc589f5a72fd88b8');
  assert.equal(closure.referenceIdentityCount, 207);
  assert.equal(closure.records.length, 207);
  assert.equal(new Set(closure.records.map((item) => item.referenceItemId)).size, 207);
  assert.deepEqual(closure.terminalStateCounts, {
    ACTIVATED_GOVERNED: 74,
    ALIAS_GOVERNED: 7,
    BLOCKED_EVIDENCE: 123,
    SOURCE_IDENTITY_LINKED: 3,
  });
});

test('v17.34 preserves evidence provenance and fails blocked foods closed', () => {
  for (const item of closure.records) {
    assert.equal(item.processorVersion, 'FOOD_CATALOGUE_CLOSURE_V17_34');
    assert.ok(item.evidenceChain.length > 0, item.referenceItemId);
    assert.ok(item.terminalReason, item.referenceItemId);
    if (item.terminalState === 'BLOCKED_EVIDENCE') {
      assert.equal(item.governedFoodId, null, item.referenceItemId);
      assert.equal(item.sourceMappingId, null, item.referenceItemId);
      const laterReference = commonFoodCatalogue.find((food) => food.id === item.referenceItemId);
      if (laterReference) {
        assert.equal(isPracticalReferenceFood(laterReference), true, item.referenceItemId);
        assert.notEqual(laterReference.sourceMappingId, item.sourceMappingId, item.referenceItemId);
      }
    }
    if (item.terminalState === 'ACTIVATED_GOVERNED') {
      const food = commonFoodCatalogue.find((candidate) => candidate.id === item.governedFoodId);
      assert.ok(food?.active, item.referenceItemId);
      assert.equal(food?.sourceMappingId, item.sourceMappingId, item.referenceItemId);
    }
  }
});

test('v17.34 source artifacts and closure artifact are hash-addressed', () => {
  assert.match(closure.artifactSha256, /^[a-f0-9]{64}$/);
  for (const source of closure.sourceArtifacts) assert.match(source.sha256, /^[a-f0-9]{64}$/, source.filename);
  const bytes = readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/food_catalogue_closure_v17_34.json', import.meta.url));
  assert.match(createHash('sha256').update(bytes).digest('hex'), /^[a-f0-9]{64}$/);
});

test('v17.34 persistence is constrained and idempotent', () => {
  const migration = readFileSync(new URL('../../backend/src/db/migrations/0061_food_catalogue_closure_v17_34.sql', import.meta.url), 'utf8');
  const importer = readFileSync(new URL('../../backend/scripts/import-food-catalogue-closure-v17-34.ts', import.meta.url), 'utf8');
  assert.match(migration, /reference_item_id text not null unique references food_catalogue_reference_items\(id\)/);
  assert.match(migration, /terminal_state = 'BLOCKED_EVIDENCE'/);
  assert.match(importer, /on conflict\(reference_item_id\) do update/);
  assert.match(importer, /V17_34_PERSISTED_CLOSURE_COUNT_MISMATCH/);
});
