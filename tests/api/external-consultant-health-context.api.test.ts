import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { resetDelegatedAuthorityReplayStoreForTests } from '../../backend/src/modules/auth/delegated-authority.js';
import { pss10Items } from '../../backend/src/modules/assessments/assessment-definitions.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, postJson, putJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const sign = (userId: string, scopes: string[]) => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({
    alg: 'RS256', typ: 'Zestiva-Delegated-Authority', kid: 'external-health-test-key'
  })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'zestiva-platform', sub: 'external-consultant-test', aud: 'fiteatsy-backend',
    iat: now, exp: now + 180, jti: crypto.randomUUID(), product: 'fiteatsy',
    permissions: ['fiteatsy.external.health.read'], purpose: 'external_consultant_health',
    actor_type: 'EXTERNAL_CONSULTANT', tenant_id: 'practice-test', connection_id: 'connection-test',
    fiteatsy_user_id: userId, scopes
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
};

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  process.env.ZESTIVA_DELEGATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  process.env.ZESTIVA_DELEGATION_KEY_ID = 'external-health-test-key';
  server = await startTestServer();
});

test.after(async () => { await server?.close(); });
test.beforeEach(async () => {
  await resetTestState();
  resetDelegatedAuthorityReplayStoreForTests();
});

test('delegated health context returns the persisted canonical food preferences and completed Fiteatsy assessment', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Delegated Health Client', email: `delegated-health-${Date.now()}@example.com`, setupPin: false
  });
  const pin = await putJson(server.baseUrl, '/v1/auth/create-pin', { newPin: '946281', confirmNewPin: '946281' }, { headers: authHeaders(client.token) });
  assert.equal(pin.response.status, 201, JSON.stringify(pin.body));
  const preferences = {
    dietType: 'non_vegetarian', proteins: ['Eggs', 'Chicken'], cuisines: ['Maharashtrian', 'North Indian'],
    foodsLiked: ['Poha'], foodsDisliked: ['Oats'], foodsAvoided: ['Mushroom'],
    likedFoodIds: ['food-poha'], dislikedFoodIds: ['food-oats'], avoidedFoodIds: ['food-mushroom'],
    restrictions: ['No onion after sunset'], staplePreference: 'both', dairyPreference: 'allowed',
    practicality: ['Office-friendly']
  };
  const saved = await putJson(server.baseUrl, '/v1/platform/food-preferences', preferences, { headers: authHeaders(client.token) });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.body));

  const started = await postJson(server.baseUrl, '/v1/assessments/PSS10/sessions', {}, { headers: authHeaders(client.token) });
  assert.equal(started.response.status, 201, JSON.stringify(started.body));
  const sessionId = started.body.session.id;
  const responses = pss10Items.map((item) => ({ itemId: item.id, selectedValue: 1 }));
  const responsesSaved = await putJson(server.baseUrl, `/v1/assessments/sessions/${sessionId}/responses`, { responses }, { headers: authHeaders(client.token) });
  assert.equal(responsesSaved.response.status, 200, JSON.stringify(responsesSaved.body));
  const completed = await postJson(server.baseUrl, `/v1/assessments/sessions/${sessionId}/complete`, {}, { headers: authHeaders(client.token) });
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body));

  const delegated = await getJson(server.baseUrl, `/v1/internal/external-consultant-access/${client.current.body.accountId}/health-context`, {
    headers: { 'x-zestiva-delegation': sign(client.current.body.accountId, ['PROFILE', 'HEALTH_SUMMARY']) }
  });
  assert.equal(delegated.response.status, 200, JSON.stringify(delegated.body));
  assert.deepEqual(delegated.body.foodPreferences.profile, preferences);
  assert.equal(delegated.body.assessment.type, 'PSS10');
  assert.equal(delegated.body.assessment.status, 'COMPLETED');
  assert.equal(delegated.body.assessment.result.sessionId, sessionId);
  assert.equal(delegated.body.measurements, null);
});

test('delegated health context omits preferences and assessment when their consent scopes are absent', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Scoped Health Client', email: `scoped-health-${Date.now()}@example.com`
  });
  const delegated = await getJson(server.baseUrl, `/v1/internal/external-consultant-access/${client.current.body.accountId}/health-context`, {
    headers: { 'x-zestiva-delegation': sign(client.current.body.accountId, ['MEASUREMENTS']) }
  });
  assert.equal(delegated.response.status, 200, JSON.stringify(delegated.body));
  assert.equal(delegated.body.profile, null);
  assert.equal(delegated.body.foodPreferences, null);
  assert.equal(delegated.body.assessment, null);
  assert.notEqual(delegated.body.measurements, null);
});
