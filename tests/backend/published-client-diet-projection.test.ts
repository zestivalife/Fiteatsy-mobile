import assert from 'node:assert/strict';
import test from 'node:test';
import { projectPublishedCommonFoodOption } from '../../backend/src/modules/nutrition/nutrition.service.js';

test('published Common Food projection preserves meal identity and immutable nutrition evidence', () => {
  const projected = projectPublishedCommonFoodOption({
    combinationId: 'option-1',
    mealHead: 'BREAKFAST',
    components: [{
      componentId: 'component-1',
      foodDisplayNameSnapshot: 'Vegetable poha',
      servingDisplayNameSnapshot: '1 bowl',
      multiplier: 1,
      grams: 180,
      millilitres: null,
      nutrition: { kcal: 240, protein: 7, carbohydrate: 42, fat: 6 },
    }],
    nutrition: { kcal: 240, protein: 7, carbohydrate: 42, fat: 6 },
    optionHash: 'immutable-hash',
    snapshotVersion: 3,
  });

  assert.equal(projected.id, 'option-1');
  assert.equal(projected.mealHead, 'BREAKFAST');
  assert.equal(projected.summary, '1 × 1 bowl Vegetable poha');
  assert.deepEqual(projected.nutrition, { kcal: 240, protein: 7, carbohydrate: 42, fat: 6 });
  assert.equal(projected.optionHash, 'immutable-hash');
  assert.equal(projected.version, 3);
});
