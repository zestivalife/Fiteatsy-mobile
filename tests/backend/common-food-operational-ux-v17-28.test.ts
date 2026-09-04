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

test('v17.29R reports persisted P0 processing and preserves the activation boundary', () => {
  const repository = readFileSync(new URL('../../backend/src/modules/nutrition/food-catalogue.repository.ts', import.meta.url), 'utf8');
  for (const field of ['processing_status','processing_version','operational_use_state','target_roles','evidence_status','p0Processed']) assert.ok(repository.includes(field), field);
  assert.ok(repository.includes('NO_REFERENCE_NUTRITION_ACTIVATED'));
});
