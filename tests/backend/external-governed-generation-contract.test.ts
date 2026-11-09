import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('delegated common-food generation remains consent and target guarded', async () => {
  const routes = await readFile(new URL('../../backend/src/modules/external-consultants/external-consultant-access.routes.ts', import.meta.url), 'utf8');
  const route = routes.slice(routes.indexOf("externalConsultantAccessRouter.post('/:userId/common-food/generate'"));
  const bounded = route.slice(0, route.indexOf('export const externalPlanPublicationSchema'));

  assert.match(bounded, /fiteatsy\.external\.diet\.generate/);
  assert.match(bounded, /external_consultant_diet_generation/);
  assert.match(bounded, /DELEGATED_TARGET_MISMATCH/);
  assert.match(bounded, /DIET_PLANS/);
  assert.match(bounded, /generateDelegatedCommonFoodPlan/);
  assert.match(bounded, /Cache-Control', 'no-store/);
});

test('delegated generation reuses the governed engine and approved seven-meal allocation', async () => {
  const service = await readFile(new URL('../../backend/src/modules/nutrition/common-food-consultant.service.ts', import.meta.url), 'utf8');
  const generation = service.slice(service.indexOf('export async function generateDelegatedCommonFoodPlan'));
  const bounded = generation.slice(0, generation.indexOf('type FoodSearchQuery'));

  assert.match(bounded, /deriveVersionedMealTargets/);
  assert.match(bounded, /generateMealCombinations/);
  assert.match(bounded, /selectDayDiverseOptions/);
  assert.match(bounded, /foodContext\(prefs\?\.profile\)/);
  assert.match(bounded, /slice\(0,5\)/);
  assert.match(bounded, /canonicalHash\(option\)/);
  assert.ok(!bounded.includes('getCurrentDietPlanForClient'), 'delegated generation must use Practice Operations targets, not a second plan authority');
});
