import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { pool } from '../../backend/src/db/pool.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, patchJson, postJson, putJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => { server = await startTestServer(); });
test.after(async () => { await server?.close(); });
test.beforeEach(async () => { await resetTestState(); });

const provision = async (adminToken: string, role: 'user' | 'consultant' | 'senior_consultant', marker: string) => {
  const created = await postJson(server.baseUrl, '/v1/admin/qa-identities', {
    name: `Fiteatsy Synthetic ${marker}`,
    email: `fiteatsy-e2e-${marker}-${Date.now()}@example.com`,
    mobileNumber: `+9197${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
    role,
    reason: 'Authenticated common-food source acceptance',
  }, { headers: authHeaders(adminToken) });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const session = await postJson(server.baseUrl, `/v1/admin/qa-identities/${created.body.user.id}/session`, {
    reason: 'Authenticated common-food source acceptance',
  }, { headers: authHeaders(adminToken) });
  assert.equal(session.response.status, 201, JSON.stringify(session.body));
  return { ...created.body, token: session.body.token as string };
};

test('QA_TEST identities exercise authenticated supported generation, vegan fail-closed, RBAC, validation, and stale writes', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, { name: 'E2E Provisioning Admin' });
  await pool.query("update users set role = 'admin', account_purpose = 'QA_TEST' where id = $1", [admin.current.body.accountId]);
  const consultant = await provision(admin.token, 'consultant', 'consultant');
  await provision(admin.token, 'senior_consultant', 'senior');
  const outsider = await provision(admin.token, 'consultant', 'outsider');

  for (const [index, dietType] of ['vegetarian', 'eggetarian', 'non_vegetarian', 'vegan'].entries()) {
    const client = await provision(admin.token, 'user', `${dietType}-${index}`);
    const publicClientId = String(client.client.fiteatsyClientId);
    const assignment = await postJson(server.baseUrl, '/v1/admin/client-assignments', {
      consultantUserId: consultant.user.id,
      clientUserId: client.user.id,
      reason: 'Authenticated common-food source acceptance',
    }, { headers: authHeaders(admin.token) });
    assert.equal(assignment.response.status, 201, JSON.stringify(assignment.body));

    const health = await patchJson(server.baseUrl, '/v1/platform/health-profile', {
      dateOfBirthISO: '1990-01-01T00:00:00.000Z', gender: 'Female', heightCm: 165,
      currentWeightKg: 65, activityLevel: 'Moderate', wellnessGoals: ['Maintain health'],
      dietType, mealsPerDay: 7, waterIntakeLiters: 2.5,
    }, { headers: authHeaders(client.token) });
    assert.equal(health.response.status, 200, JSON.stringify(health.body));
    const preferences = await putJson(server.baseUrl, '/v1/platform/food-preferences', {
      dietType, proteins: [], cuisines: ['Indian'], foodsLiked: [], foodsDisliked: [],
      foodsAvoided: [], likedFoodIds: [], dislikedFoodIds: [], avoidedFoodIds: [], restrictions: [],
      staplePreference: null, dairyPreference: null, practicality: [],
    }, { headers: authHeaders(client.token) });
    assert.equal(preferences.response.status, 200, JSON.stringify(preferences.body));

    const visible = await getJson(server.baseUrl, '/v1/consultants/clients', { headers: authHeaders(consultant.token) });
    assert.equal(visible.response.status, 200, JSON.stringify(visible.body));
    assert.ok(visible.body.clients.some((item: { clientId: string }) => item.clientId === publicClientId));
    const denied = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods`, { headers: authHeaders(outsider.token) });
    assert.equal(denied.response.status, 403, JSON.stringify(denied.body));
    assert.equal(denied.body.error, 'CLIENT_ASSIGNMENT_REQUIRED');

    const draft = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/draft`, {}, { headers: authHeaders(consultant.token) });
    assert.equal(draft.response.status, 201, JSON.stringify(draft.body));
    const planId = String(draft.body.plan.id);
    const generated = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/generate`, {
      mealHeads: ['EARLY_MORNING', 'BREAKFAST', 'MID_MORNING', 'LUNCH', 'EVENING_SNACK', 'DINNER', 'BEDTIME'],
    }, { headers: authHeaders(consultant.token) });
    assert.equal(generated.response.status, 200, JSON.stringify(generated.body));

    if (dietType === 'vegan') {
      assert.equal(generated.body.supported, false);
      assert.equal(generated.body.code, 'VEGAN_COMMON_FOOD_ENGINE_V1_NOT_SUPPORTED');
      continue;
    }
    assert.equal(generated.body.meals.length, 7);
    assert.equal(generated.body.meals.reduce((count: number, meal: { options: unknown[] }) => count + meal.options.length, 0), 35);
    for (const meal of generated.body.meals) {
      assert.equal(meal.options.length, 5, `${dietType}:${meal.mealHead}`);
      assert.equal(new Set(meal.options.map((option: { diversitySignature: string }) => option.diversitySignature)).size, 5);
    }

    const rejected = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/validate-option`, {
      mealHead: 'BREAKFAST', components: [{ foodId: 'NOT_ELIGIBLE', servingId: 'NONE', multiplier: 1 }],
    }, { headers: authHeaders(consultant.token) });
    assert.equal(rejected.response.status, 422, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error, 'UNSAFE_OR_INELIGIBLE_FOOD');

    const option = generated.body.meals[0].options[0];
    const stale = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: crypto.randomUUID(), mealHead: generated.body.meals[0].mealHead,
      components: option.components.map((component: { foodId: string; servingId: string; multiplier: number }) => ({ foodId: component.foodId, servingId: component.servingId, multiplier: component.multiplier })),
    }, { headers: authHeaders(consultant.token) });
    assert.equal(stale.response.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.error, 'STALE_PLAN_VERSION');
  }
});
