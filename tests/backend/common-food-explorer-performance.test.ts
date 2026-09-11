import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../backend/src/modules/nutrition/common-food-consultant.service.ts', import.meta.url),
  'utf8',
);

test('Food Explorer coalesces shared reads without caching the authorization boundary', () => {
  const authorization = source.indexOf('await canAccessConsultantNutritionClient(clientId,account');
  const cachedReads = source.indexOf('cachedExplorerContext(account,clientId,q.mealHead)');

  assert.ok(authorization >= 0, 'the assignment authorization check must remain present');
  assert.ok(cachedReads > authorization, 'authorization must execute before cached catalogue reads');
  assert.match(source, /const key=`\$\{account\.accountId\}:\$\{clientId\}:\$\{mealHead\?\?'\'\}`/);
  assert.match(source, /Promise\.all\(\[listApprovedFoodAliases\(\),listApprovedProposalFoods\(\),listReferenceCatalogueFoods/);
});

test('Food Explorer evicts rejected shared-read promises and keeps caches bounded', () => {
  assert.match(source, /\.catch\(error=>\{explorerContextCache\.delete\(key\);throw error;\}\)/);
  assert.match(source, /\.catch\(error=>\{explorerSupportCache=null;throw error;\}\)/);
  assert.match(source, /if\(explorerContextCache\.size>=100\)/);
  assert.match(source, /EXPLORER_RESPONSE_CACHE_TTL_MS=2_000/);
});
