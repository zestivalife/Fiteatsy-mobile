import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { resetDelegatedAuthorityReplayStoreForTests } from '../../backend/src/modules/auth/delegated-authority.js';
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { postJson, putJson } from '../helpers/http.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sign = (userId: string, overrides: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'Zestiva-Delegated-Authority', kid: 'external-diet-test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'zestiva-platform', sub: 'external-consultant-test', aud: 'fiteatsy-backend', iat: now, exp: now + 180,
    jti: crypto.randomUUID(), product: 'fiteatsy', permissions: ['fiteatsy.external.diet.resolve'],
    purpose: 'external_consultant_diet_option', actor_type: 'EXTERNAL_CONSULTANT', tenant_id: 'practice-test',
    connection_id: 'connection-test', fiteatsy_user_id: userId, scopes: ['DIET_PLANS'], ...overrides
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
};

const breakfastFood = commonFoodCatalogue.find(food => food.active && food.generatorEligible && food.clientConsumable && food.mealHeads.includes('BREAKFAST') && ['VEGAN','VEGETARIAN'].includes(food.vegetarianClass) && food.servings.some(serving => serving.active));
assert.ok(breakfastFood);
const serving = breakfastFood.servings.find(item => item.active && item.isDefault) ?? breakfastFood.servings.find(item => item.active)!;
const request = { mealHead: 'BREAKFAST', components: [{ foodId: breakfastFood.id, servingId: serving.id, multiplier: serving.allowedMultipliers[0] }], target: { kcal: 300, protein: 15, kcalTolerance: 1000, proteinTolerance: 1000 } };

let server: Awaited<ReturnType<typeof startTestServer>>;
test.before(async () => {
  process.env.ZESTIVA_DELEGATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  process.env.ZESTIVA_DELEGATION_KEY_ID = 'external-diet-test-key';
  server = await startTestServer();
});
test.after(async () => { await server?.close(); });
test.beforeEach(async () => { await resetTestState(); resetDelegatedAuthorityReplayStoreForTests(); });

const createClient = async () => {
  const client = await createAuthenticatedSession(server.baseUrl, { name: 'Resolver Client', email: `resolver-${crypto.randomUUID()}@example.com` });
  await putJson(server.baseUrl, '/v1/platform/food-preferences', { dietType:'vegetarian', proteins:[], cuisines:[], foodsLiked:[], foodsDisliked:[], foodsAvoided:[], likedFoodIds:[], dislikedFoodIds:[], avoidedFoodIds:[], restrictions:[], staplePreference:'both', dairyPreference:'allowed', practicality:[] }, { headers: authHeaders(client.token) });
  return client;
};

test('delegated resolver returns deterministic authoritative snapshots without plan persistence', async () => {
  const client=await createClient(); const userId=client.current.body.accountId; const path=`/v1/internal/external-consultant-access/${userId}/common-food/resolve-option`;
  const first=await postJson(server.baseUrl,path,request,{headers:{'x-zestiva-delegation':sign(userId)}});
  const second=await postJson(server.baseUrl,path,request,{headers:{'x-zestiva-delegation':sign(userId)}});
  assert.equal(first.response.status,200,JSON.stringify(first.body)); assert.equal(second.response.status,200,JSON.stringify(second.body));
  assert.equal(first.body.option.calculationStatus,'AUTHORITATIVELY_RESOLVED'); assert.equal(first.body.option.clinicalApproval,false);
  assert.deepEqual(first.body.option.nutrition,second.body.option.nutrition); assert.equal(first.body.option.snapshotHash,second.body.option.snapshotHash);
  assert.equal(first.body.option.components[0].foodId,breakfastFood.id); assert.equal(first.body.option.components[0].servingId,serving.id);
});

test('delegated resolver rejects missing consent and target mismatch', async () => {
  const client=await createClient(); const userId=client.current.body.accountId; const path=`/v1/internal/external-consultant-access/${userId}/common-food/resolve-option`;
  const noConsent=await postJson(server.baseUrl,path,request,{headers:{'x-zestiva-delegation':sign(userId,{scopes:['PROFILE']})}});
  assert.equal(noConsent.response.status,403); assert.equal(noConsent.body.error,'DIET_PLAN_CONSENT_REQUIRED');
  const mismatch=await postJson(server.baseUrl,path,request,{headers:{'x-zestiva-delegation':sign(crypto.randomUUID())}});
  assert.equal(mismatch.response.status,403); assert.equal(mismatch.body.error,'DELEGATED_TARGET_MISMATCH');
});

test('delegated resolver rejects invalid governed identifiers, multiplier and duplicates', async () => {
  const client=await createClient(); const userId=client.current.body.accountId; const path=`/v1/internal/external-consultant-access/${userId}/common-food/resolve-option`;
  const call=(body:unknown)=>postJson(server.baseUrl,path,body,{headers:{'x-zestiva-delegation':sign(userId)}});
  const badFood=await call({...request,components:[{...request.components[0],foodId:'NOT_GOVERNED'}]}); assert.equal(badFood.response.status,422); assert.equal(badFood.body.error,'UNSAFE_OR_INELIGIBLE_FOOD');
  const badServing=await call({...request,components:[{...request.components[0],servingId:'NOT_GOVERNED'}]}); assert.equal(badServing.response.status,422); assert.equal(badServing.body.error,'SERVING_NOT_FOUND');
  const badMultiplier=await call({...request,components:[{...request.components[0],multiplier:999}]}); assert.equal(badMultiplier.response.status,422); assert.equal(badMultiplier.body.error,'INVALID_SERVING_MULTIPLIER');
  const duplicate=await call({...request,components:[request.components[0],request.components[0]]}); assert.equal(duplicate.response.status,422); assert.equal(duplicate.body.error,'DUPLICATE_COMPONENT');
});

test('delegated resolver rejects invalid service credentials and performs no public unauthenticated calculation', async () => {
  const client=await createClient(); const userId=client.current.body.accountId; const path=`/v1/internal/external-consultant-access/${userId}/common-food/resolve-option`;
  const missing=await postJson(server.baseUrl,path,request); assert.equal(missing.response.status,401); assert.equal(missing.body.error,'DELEGATED_AUTHORITY_REQUIRED');
  const invalid=await postJson(server.baseUrl,path,request,{headers:{'x-zestiva-delegation':'invalid'}}); assert.equal(invalid.response.status,401);
});
