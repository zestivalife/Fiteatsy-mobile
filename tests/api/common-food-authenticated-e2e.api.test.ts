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
    await pool.query(`insert into food_catalogue_reference_items(id,batch_id,source_row_number,source_record_id,canonical_name,common_names,category,subcategory,reference_state,reference_nutrition_per_100g,verification_status,notes,source_record_sha256)
      values($1,'BATCH_0_PAN_INDIA_FOOD_SEED',1,$2,'Ash Gourd','["Winter Melon","Petha"]','Vegetable','Gourd','RAW','{"kcal":13}','Reference only — verify authoritative source before production',null,$3)`,[`BATCH0_TEST_${index}`,`TEST_${index}`,`${index}`.padStart(64,'0')]);
    const allFoods = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=ALL&search=winter%20melon`, { headers: authHeaders(consultant.token) });
    assert.equal(allFoods.response.status, 200, JSON.stringify(allFoods.body));
    assert.equal(allFoods.body.items[0].displayName, 'Ash Gourd');
    assert.equal(allFoods.body.items[0].nutritionStatus, 'REFERENCE_ONLY');
    assert.equal(allFoods.body.items[0].generatorEligibility, 'INELIGIBLE');
    assert.equal(allFoods.body.items[0].addToMealEligible, false);
    assert.equal(allFoods.body.items[0].nutritionPer100g, null);
    assert.ok(allFoods.body.totals.catalogue > allFoods.body.totals.generatorEligible);
    assert.ok(Array.isArray(allFoods.body.facets.states));
    const recommendedFoods = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=RECOMMENDED&mealHead=BREAKFAST`, { headers: authHeaders(consultant.token) });
    assert.equal(recommendedFoods.response.status, 200, JSON.stringify(recommendedFoods.body));
    assert.ok(recommendedFoods.body.items.every((item: { nutritionStatus:string;generatorEligibility:string;mealEligibility:string }) => item.nutritionStatus === 'NUTRITION_VERIFIED' && item.generatorEligibility === 'ELIGIBLE' && item.mealEligibility === 'RECOMMENDED'));
    if (index === 0) {
      const durations: number[] = [];
      for (let sample = 0; sample < 20; sample += 1) {
        const started = performance.now();
        const measured = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=${sample % 2 ? 'ALL' : 'RECOMMENDED'}&mealHead=BREAKFAST&limit=20&offset=0`, { headers: authHeaders(consultant.token) });
        durations.push(performance.now() - started);
        assert.equal(measured.response.status, 200, JSON.stringify(measured.body));
      }
      durations.sort((a, b) => a - b);
      const p50 = durations[Math.ceil(durations.length * 0.5) - 1];
      const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
      console.info(`FOOD_EXPLORER_PERFORMANCE p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms samples=${durations.length}`);
      assert.ok(p50 < 500, `Food Explorer P50 ${p50.toFixed(2)}ms exceeds 500ms`);
      assert.ok(p95 < 500, `Food Explorer P95 ${p95.toFixed(2)}ms exceeds 500ms`);
    }
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

    const selectedOptions = generated.body.meals.flatMap((meal: { mealHead: string; options: Array<{ combinationId: string; components: Array<{ foodId: string; servingId: string; multiplier: number }> }> }) =>
      meal.options.map((option) => ({ optionId: option.combinationId, mealHead: meal.mealHead, components: option.components.map(({ foodId, servingId, multiplier }) => ({ foodId, servingId, multiplier })) })),
    );
    const partial = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: draft.body.version.id, options: selectedOptions.slice(0, 22),
    }, { headers: authHeaders(consultant.token) });
    assert.equal(partial.response.status, 400, JSON.stringify(partial.body));

    for (let cycle = 0; cycle < 2; cycle += 1) {
      const saved = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
        expectedPlanVersionId: draft.body.version.id, options: selectedOptions,
      }, { headers: authHeaders(consultant.token) });
      assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
      assert.equal(saved.body.options.length, 35);
      assert.equal(new Set(saved.body.options.map((item: { combinationId: string }) => item.combinationId)).size, 35);
    }
    const reloaded = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, { headers: authHeaders(consultant.token) });
    assert.equal(reloaded.response.status, 200, JSON.stringify(reloaded.body));
    assert.equal(reloaded.body.options.length, 35);

    const stale = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: crypto.randomUUID(), options: selectedOptions,
    }, { headers: authHeaders(consultant.token) });
    assert.equal(stale.response.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.error, 'STALE_PLAN_VERSION');
  }
});
