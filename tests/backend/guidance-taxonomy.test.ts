import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { hasExplicitCuisineMapping, hasExplicitGuidanceMapping, resolveGuidanceCuisine } from '../../backend/src/modules/nutrition/guidance-taxonomy.js';

test('cuisine resolution is exact and supports every governed Eating Out category', () => {
  assert.equal(resolveGuidanceCuisine('South Indian'), 'south indian');
  assert.equal(resolveGuidanceCuisine('cafeBakery'), 'cafe bakery');
  assert.equal(resolveGuidanceCuisine('Street Food'), 'street food');
  assert.equal(resolveGuidanceCuisine('healthy south Indian style'), null);
});

test('South Indian and Chinese eligibility require explicit cuisine mappings', () => {
  assert.equal(hasExplicitCuisineMapping(['South Indian'], 'south indian'), true);
  assert.equal(hasExplicitCuisineMapping(['North Indian'], 'south indian'), false);
  assert.equal(hasExplicitCuisineMapping([], 'chinese'), false);
  assert.equal(hasExplicitCuisineMapping(['Chinese'], 'chinese'), true);
});

test('generic healthy meals cannot satisfy cuisine or quick-bite/craving taxonomy', () => {
  const lentilTofuSpinachBrothCuisineTags: string[] = [];
  const lentilTofuSpinachBrothGuidanceTags: string[] = [];
  assert.equal(hasExplicitCuisineMapping(lentilTofuSpinachBrothCuisineTags, 'south indian'), false);
  assert.equal(hasExplicitGuidanceMapping(lentilTofuSpinachBrothGuidanceTags, 'QUICK_BITE'), false);
  assert.equal(hasExplicitGuidanceMapping(lentilTofuSpinachBrothGuidanceTags, 'SWEET'), false);
});

test('unknown and zero-coverage categories fail closed without fallback', () => {
  assert.equal(resolveGuidanceCuisine('unknown cuisine'), null);
  assert.equal(hasExplicitCuisineMapping([], 'street food'), false);
});

test('generation and search enforce taxonomy after catalogue eligibility', async () => {
  const service = await readFile(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
  assert.match(service, /filter\(\(slot\) => hasExplicitCuisineTag\(slot, cuisine\)\)/);
  assert.match(service, /requiredGuidanceTag == null \|\| hasExplicitGuidanceTag/);
  assert.match(service, /hasExplicitGuidanceTag\(slot, 'QUICK_BITE'\)/);
  assert.doesNotMatch(service, /broadCatalogue\.filter\(\(slot\) => withinCalorieBand\(slot, target\) && \(slot\.cuisineTags/);
});

test('common-food persistence keeps each option snapshot independently associated', async () => {
  const service = await readFile(new URL('../../backend/src/modules/nutrition/common-food-consultant.service.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../../backend/src/db/migrations/0053_unified_diet_option_selection.sql', import.meta.url), 'utf8');
  assert.match(service, /logicalOptionId/);
  assert.match(service, /mealHead:input\.mealHead/);
  assert.match(service, /components:validated\.components/);
  assert.match(service, /servingId:x\.servingId,multiplier:x\.multiplier/);
  assert.match(migration, /logical_option_id/);
  assert.match(migration, /option_snapshot_id/);
  assert.match(migration, /unique \(diet_plan_version_id, meal_head, display_order\)/);
});
