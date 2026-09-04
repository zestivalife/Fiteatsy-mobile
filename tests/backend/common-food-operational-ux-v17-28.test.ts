import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../backend/src/modules/nutrition/common-food-consultant.service.ts', import.meta.url), 'utf8');

test('v17.28 gives every catalogue result one governed operational-use state', () => {
  for (const state of ['DIRECT_ADDABLE','COMPONENT_ADDABLE','INGREDIENT_ONLY','SECONDARY_ONLY','PREPARATION_REQUIRED','REFERENCE_PENDING','BLOCKED_BY_GOVERNANCE']) assert.ok(source.includes(state), state);
  for (const field of ['displayStatus','displayStatusTone','primaryAction','primaryActionEnabled','primaryActionReason','secondaryAction','nutritionDisplayMode','servingDisplay','relatedPreparedItems']) assert.ok(source.includes(field), field);
});

test('v17.28 raw-to-prepared discovery preserves separate nutrition identities', () => {
  assert.match(source, /relatedPreparedFor/);
  assert.match(source, /referenceRoles/);
  assert.match(source, /foodType==='VALIDATED_RECIPE'/);
  assert.match(source, /REFERENCE_DETAIL_ONLY/);
  assert.doesNotMatch(source, /reference_nutrition_per_100g[^\n]*nutritionPer100g/);
});
