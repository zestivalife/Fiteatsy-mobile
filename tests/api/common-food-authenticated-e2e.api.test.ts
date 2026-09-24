import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { pool } from '../../backend/src/db/pool.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, patchJson, postJson, putJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';
import { refreshFoodExplorerProjection } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => { server = await startTestServer(); });
test.after(async () => { await server?.close(); });
test.beforeEach(async () => { await resetTestState(); await refreshFoodExplorerProjection(); });

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

    const assignmentsAfterProfileSave = await getJson(server.baseUrl, '/v1/admin/client-assignments', { headers: authHeaders(admin.token) });
    assert.equal(assignmentsAfterProfileSave.response.status, 200, JSON.stringify(assignmentsAfterProfileSave.body));
    const activeAssignment = assignmentsAfterProfileSave.body.assignments.find((item: { consultantUserId: string; clientUserId: string; status: string }) =>
      item.consultantUserId === consultant.user.id && item.clientUserId === client.user.id && item.status === 'active'
    );
    assert.equal(activeAssignment?.id, assignment.body.assignment.id, 'profile updates must preserve an existing active assignment identity');

    const visible = await getJson(server.baseUrl, '/v1/consultants/clients', { headers: authHeaders(consultant.token) });
    assert.equal(visible.response.status, 200, JSON.stringify(visible.body));
    assert.ok(!visible.body.clients.some((item: { clientId: string }) => item.clientId === publicClientId));
    const denied = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods`, { headers: authHeaders(outsider.token) });
    assert.equal(denied.response.status, 403, JSON.stringify(denied.body));
    assert.equal(denied.body.error, 'CLIENT_ASSIGNMENT_REQUIRED');

    const consentDenied = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods`, { headers: authHeaders(consultant.token) });
    assert.equal(consentDenied.response.status, 403, JSON.stringify(consentDenied.body));
    assert.equal(consentDenied.body.error, 'CONSULTANT_ACCESS_CONSENT_REQUIRED');
    const grantedConsent = await putJson(server.baseUrl, '/v1/preferences/consultant-access', {
      assignmentId: assignment.body.assignment.id,
      status: 'GRANTED',
      policyVersion: 'CONSULTANT_ACCESS_V1',
    }, { headers: authHeaders(client.token) });
    assert.equal(grantedConsent.response.status, 200, JSON.stringify(grantedConsent.body));
    assert.equal(grantedConsent.body.consent.status, 'GRANTED');
    const visibleAfterConsent = await getJson(server.baseUrl, '/v1/consultants/clients', { headers: authHeaders(consultant.token) });
    assert.equal(visibleAfterConsent.response.status, 200, JSON.stringify(visibleAfterConsent.body));
    assert.ok(visibleAfterConsent.body.clients.some((item: { clientId: string }) => item.clientId === publicClientId));

    const assertRevokedGuardOrder = async () => {
      const revokedConsent = await putJson(server.baseUrl, '/v1/preferences/consultant-access', {
        assignmentId: assignment.body.assignment.id,
        status: 'REVOKED',
        policyVersion: 'CONSULTANT_ACCESS_V1',
      }, { headers: authHeaders(client.token) });
      assert.equal(revokedConsent.response.status, 200, JSON.stringify(revokedConsent.body));
      const consentBlocked = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods`, { headers: authHeaders(consultant.token) });
      assert.equal(consentBlocked.response.status, 403, JSON.stringify(consentBlocked.body));
      assert.equal(consentBlocked.body.error, 'CONSULTANT_ACCESS_CONSENT_REQUIRED');
      const revokedAssignment = await postJson(server.baseUrl, `/v1/admin/client-assignments/${assignment.body.assignment.id}/revoke`, {
        reason: 'Authenticated common-food guard-order acceptance complete',
      }, { headers: authHeaders(admin.token) });
      assert.equal(revokedAssignment.response.status, 200, JSON.stringify(revokedAssignment.body));
      const assignmentBlocked = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods`, { headers: authHeaders(consultant.token) });
      assert.equal(assignmentBlocked.response.status, 403, JSON.stringify(assignmentBlocked.body));
      assert.equal(assignmentBlocked.body.error, 'CLIENT_ASSIGNMENT_REQUIRED');
    };

    const draft = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/draft`, {}, { headers: authHeaders(consultant.token) });
    assert.equal(draft.response.status, 201, JSON.stringify(draft.body));
    const planId = String(draft.body.plan.id);
    const allFoods = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=ALL&search=winter%20melon`, { headers: authHeaders(consultant.token) });
    assert.equal(allFoods.response.status, 200, JSON.stringify(allFoods.body));
    assert.equal(String(allFoods.body.items[0].displayName).toLowerCase(), 'ash gourd');
    assert.equal(allFoods.body.items[0].nutritionStatus, 'NUTRITION_VERIFIED');
    assert.equal(allFoods.body.items[0].generatorEligibility, 'ELIGIBLE');
    assert.equal(allFoods.body.items[0].addToMealEligible, true);
    assert.ok(allFoods.body.items[0].nutritionPer100g);
    assert.ok(allFoods.body.totals.catalogue > allFoods.body.totals.generatorEligible);
    assert.ok(Array.isArray(allFoods.body.facets.states));
    assert.equal(allFoods.body.filterSemantics.mealContextApplied, false);
    assert.equal(allFoods.body.filterSemantics.operationalEligibilityRequired, false);
    assert.equal(allFoods.body.roleLabels.PULSE, 'Protein / Pulse');
    const referenceOnly = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=ALL&nutritionStatus=REFERENCE_ONLY&limit=100`, { headers: authHeaders(consultant.token) });
    assert.equal(referenceOnly.response.status, 200, JSON.stringify(referenceOnly.body));
    assert.equal(typeof referenceOnly.body.total, 'number');
    assert.ok(referenceOnly.body.items.length <= referenceOnly.body.total);
    assert.ok(referenceOnly.body.items.every((item: { nutritionStatus:string;addToMealEligible:boolean }) => item.nutritionStatus === 'REFERENCE_ONLY' && item.addToMealEligible === false));
    const noBedtimePulse = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=RECOMMENDED&mealHead=BEDTIME&componentRole=PULSE`, { headers: authHeaders(consultant.token) });
    assert.equal(noBedtimePulse.response.status, 200, JSON.stringify(noBedtimePulse.body));
    assert.equal(noBedtimePulse.body.total, 0);
    assert.match(noBedtimePulse.body.emptyGuidance.message, /No recommended Protein \/ Pulse foods.*Bedtime/);
    assert.deepEqual(noBedtimePulse.body.emptyGuidance.actions, ['VIEW_ALL_IN_ROLE','CLEAR_ROLE_FILTER','VIEW_ALL_CATALOGUE','CHANGE_MEAL_OR_ROLE']);
    assert.ok(noBedtimePulse.body.counts.excluded.mealSuitability > 0);
    const recommendedFoods = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=RECOMMENDED&mealHead=BREAKFAST`, { headers: authHeaders(consultant.token) });
    assert.equal(recommendedFoods.response.status, 200, JSON.stringify(recommendedFoods.body));
    assert.ok(recommendedFoods.body.items.every((item: { nutritionStatus:string;generatorEligibility:string;mealEligibility:string }) => item.nutritionStatus === 'NUTRITION_VERIFIED' && item.generatorEligibility === 'ELIGIBLE' && item.mealEligibility === 'RECOMMENDED'));
    // Reference provenance is a catalogue invariant, not a first-page ordering
    // invariant. Query a deterministic reference identity explicitly so changes
    // to ranking or catalogue size cannot make this assertion order-dependent.
    const referenceFood = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=RECOMMENDED&mealHead=BREAKFAST&search=mosambi&limit=10&offset=0`, { headers: authHeaders(consultant.token) });
    assert.equal(referenceFood.response.status, 200, JSON.stringify(referenceFood.body));
    const completeReference = referenceFood.body.items.find((item: { dataStatus?: string }) => item.dataStatus === 'REFERENCE');
    assert.ok(completeReference, JSON.stringify(referenceFood.body.items));
    assert.equal(completeReference.referenceLabel, 'Reference data');
    assert.equal(completeReference.nutritionStatus, 'NUTRITION_VERIFIED');
    assert.equal(completeReference.generatorEligibility, 'ELIGIBLE');
    assert.equal(completeReference.addToMealEligible, true);
    if (index === 0) {
      const activatedP0 = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=RECOMMENDED&mealHead=BREAKFAST&search=cucumber`, { headers: authHeaders(consultant.token) });
      assert.equal(activatedP0.response.status, 200, JSON.stringify(activatedP0.body));
      const cucumber = activatedP0.body.items.find((item: { id:string; displayName:string }) => item.id === 'BATCH0_42' && item.displayName === 'Cucumber');
      assert.ok(cucumber, JSON.stringify(activatedP0.body.items));
      assert.equal(cucumber.nutritionStatus, 'NUTRITION_VERIFIED');
      assert.equal(cucumber.generatorEligibility, 'ELIGIBLE');
      assert.equal(cucumber.addToMealEligible, true);
      const activatedTofu = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=RECOMMENDED&mealHead=BREAKFAST&search=tofu`, { headers: authHeaders(consultant.token) });
      const tofu = activatedTofu.body.items.find((item: { id:string }) => item.id === 'BATCH0_218');
      assert.ok(tofu, JSON.stringify(activatedTofu.body.items));
      const activatedBanana = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=RECOMMENDED&mealHead=BREAKFAST&search=banana`, { headers: authHeaders(consultant.token) });
      const banana = activatedBanana.body.items.find((item: { id:string }) => item.id === 'BATCH0_103');
      assert.ok(banana, JSON.stringify(activatedBanana.body.items));
      const added = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
        expectedPlanVersionId: draft.body.version.id,
        mealHead: 'BREAKFAST',
        components: [
          { foodId: tofu.id, servingId: tofu.defaultServing.id, multiplier: 1 },
          { foodId: cucumber.id, servingId: cucumber.defaultServing.id, multiplier: 1 },
          { foodId: banana.id, servingId: banana.defaultServing.id, multiplier: 1 },
        ],
      }, { headers: authHeaders(consultant.token) });
      assert.equal(added.response.status, 201, JSON.stringify(added.body));
      assert.ok(added.body.components.some((component: { foodId:string }) => component.foodId === 'BATCH0_42'));
    }
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
      await assertRevokedGuardOrder();
      continue;
    }
    type GeneratedOption = {
      combinationId: string;
      diversitySignature: string;
      components: Array<{ foodId: string; servingId: string; multiplier: number }>;
    };
    type GeneratedMeal = {
      mealHead: string;
      options: GeneratedOption[];
      recommendedOptionIds: string[];
    };
    const generatedMeals = generated.body.meals as GeneratedMeal[];
    assert.equal(generatedMeals.length, 7);
    const candidateCounts = Object.fromEntries(generatedMeals.map((meal) => [meal.mealHead, meal.options.length]));
    const generatedCandidateTotal = generatedMeals.reduce((count, meal) => count + meal.options.length, 0);
    console.info(`COMMON_FOOD_CANDIDATE_POOL ${dietType} total=${generatedCandidateTotal} counts=${JSON.stringify(candidateCounts)}`);
    assert.ok(generatedCandidateTotal > 35, `${dietType}: expanded candidate pool expected`);
    for (const meal of generatedMeals) {
      assert.ok(meal.options.length >= 5 && meal.options.length <= 12, `${dietType}:${meal.mealHead}: candidate count ${meal.options.length}`);
      assert.equal(new Set(meal.options.map((option) => option.combinationId)).size, meal.options.length, `${dietType}:${meal.mealHead}: candidate IDs`);
      assert.equal(meal.recommendedOptionIds.length, 5, `${dietType}:${meal.mealHead}: recommended selection`);
      assert.equal(new Set(meal.recommendedOptionIds).size, 5, `${dietType}:${meal.mealHead}: recommended selection uniqueness`);
      assert.ok(meal.recommendedOptionIds.every((id) => meal.options.some((option) => option.combinationId === id)), `${dietType}:${meal.mealHead}: recommended selection containment`);

      // "Random 5" operates on the candidate pool. A stable hash order keeps the
      // contract deterministic in CI while exercising a non-positional sample.
      const randomFive = [...meal.options]
        .sort((left, right) => crypto.createHash('sha256').update(left.combinationId).digest('hex').localeCompare(crypto.createHash('sha256').update(right.combinationId).digest('hex')))
        .slice(0, 5);
      assert.equal(randomFive.length, 5, `${dietType}:${meal.mealHead}: random five count`);
      assert.equal(new Set(randomFive.map((option) => option.combinationId)).size, 5, `${dietType}:${meal.mealHead}: random five uniqueness`);
      assert.ok(randomFive.every((option) => meal.options.includes(option)), `${dietType}:${meal.mealHead}: random five containment`);
    }

    const rejected = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/validate-option`, {
      mealHead: 'BREAKFAST', components: [{ foodId: 'NOT_ELIGIBLE', servingId: 'NONE', multiplier: 1 }],
    }, { headers: authHeaders(consultant.token) });
    assert.equal(rejected.response.status, 422, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error, 'UNSAFE_OR_INELIGIBLE_FOOD');

    const selectedOptions = generatedMeals.flatMap((meal) =>
      meal.recommendedOptionIds.map((optionId) => {
        const option = meal.options.find((candidate) => candidate.combinationId === optionId)!;
        return { optionId, mealHead: meal.mealHead, components: option.components.map(({ foodId, servingId, multiplier }) => ({ foodId, servingId, multiplier })) };
      }),
    );
    assert.equal(selectedOptions.length, 35);
    assert.equal(new Set(selectedOptions.map((option) => option.optionId)).size, 35);
    for (const meal of generatedMeals) assert.equal(selectedOptions.filter((option) => option.mealHead === meal.mealHead).length, 5, meal.mealHead);
    const partial = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: draft.body.version.id, options: selectedOptions.slice(0, 34),
    }, { headers: authHeaders(consultant.token) });
    assert.equal(partial.response.status, 400, JSON.stringify(partial.body));

    const firstMeal = generatedMeals[0];
    const secondMeal = generatedMeals[1];
    const sixthFirstMealOption = firstMeal.options.find((option) => !firstMeal.recommendedOptionIds.includes(option.combinationId));
    const sixthSecondMealOption = secondMeal.options.find((option) => !secondMeal.recommendedOptionIds.includes(option.combinationId));
    assert.ok(sixthFirstMealOption && sixthSecondMealOption, 'expanded fixture must support 6-option negative validation');
    const toSelection = (mealHead: string, option: GeneratedOption) => ({
      optionId: option.combinationId,
      mealHead,
      components: option.components.map(({ foodId, servingId, multiplier }) => ({ foodId, servingId, multiplier })),
    });
    const thirtySix = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: draft.body.version.id,
      options: [...selectedOptions, toSelection(firstMeal.mealHead, sixthFirstMealOption)],
    }, { headers: authHeaders(consultant.token) });
    assert.equal(thirtySix.response.status, 400, JSON.stringify(thirtySix.body));

    const fourAndSix = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: draft.body.version.id,
      options: [
        ...selectedOptions.filter((option) => option.optionId !== firstMeal.recommendedOptionIds[0]),
        toSelection(secondMeal.mealHead, sixthSecondMealOption),
      ],
    }, { headers: authHeaders(consultant.token) });
    assert.equal(fourAndSix.response.status, 422, JSON.stringify(fourAndSix.body));

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
    assert.deepEqual(
      new Set(reloaded.body.options.map((item: { combinationId: string }) => item.combinationId)),
      new Set(selectedOptions.map((item) => item.optionId)),
    );

    const stale = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: crypto.randomUUID(), options: selectedOptions,
    }, { headers: authHeaders(consultant.token) });
    assert.equal(stale.response.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.error, 'STALE_PLAN_VERSION');
    await assertRevokedGuardOrder();
  }
});
