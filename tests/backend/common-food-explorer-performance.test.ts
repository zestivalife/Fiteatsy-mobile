import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../backend/src/modules/nutrition/common-food-consultant.service.ts', import.meta.url),
  'utf8',
);
const nutritionService = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
const nutritionStore = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.store.ts', import.meta.url), 'utf8');
const catalogueRepository = readFileSync(new URL('../../backend/src/modules/nutrition/food-catalogue.repository.ts', import.meta.url), 'utf8');

test('Food Explorer coalesces static reads without caching the authorization boundary', () => {
  const authorization = source.indexOf('await canAccessConsultantNutritionClient(input.clientId,input.account');
  const contextResolution = source.indexOf('resolveClientMealGenerationContext({account,clientId,mealHead:q.mealHead})');

  assert.ok(authorization >= 0, 'the assignment authorization check must remain present');
  assert.ok(contextResolution > authorization, 'Explorer must use the resolver with mandatory authorization');
  assert.doesNotMatch(source, /explorerContextCache/);
  assert.match(source, /Promise\.all\(\[listApprovedFoodAliases\(\),listApprovedProposalFoods\(\),listReferenceCatalogueFoods/);
});

test('Food Explorer evicts rejected shared-read promises and keeps caches bounded', () => {
  assert.match(source, /\.catch\(error=>\{explorerSupportCache=null;throw error;\}\)/);
  assert.match(source, /EXPLORER_RESPONSE_CACHE_TTL_MS=2_000/);
  assert.match(source, /EXPLORER_SHARED_READ_CACHE_TTL_MS=30_000/);
  assert.match(source, /expiresAt:now\+EXPLORER_SHARED_READ_CACHE_TTL_MS/);
});

test('Food Explorer does not transfer reference identities already embedded in the governed runtime catalogue', () => {
  assert.match(source, /excludeIds:practicalFoodMasterRows\.map\(food=>food\.id\)/);
  assert.match(catalogueRepository, /not \(id = any\(\$\{bind\(input\.excludeIds\)\}::text\[\]\)\)/);
});

test('Food Explorer cold context avoids the full Nutrition workspace projection', () => {
  assert.match(source, /getCurrentDietPlanForClient\(registered\.internalClientId,registered\.accountId\)/);
  assert.match(source, /getFoodPreferenceProfile\(input\.clientId,registered\.internalClientId\)/);
  assert.match(nutritionService, /const context = await getRegisteredConsultantClientAccessContext\(/);
  assert.match(nutritionStore, /select row_to_json\(dp\) as plan, row_to_json\(dpv\) as version/);
});
