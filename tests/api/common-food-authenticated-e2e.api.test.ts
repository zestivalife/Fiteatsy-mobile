import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { pool } from '../../backend/src/db/pool.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, patchJson, postJson, putJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

const encodeJwtPart = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url');
const signConsultantDashboardJwt = (secret: string, payload: Record<string, unknown>) => {
  const header = encodeJwtPart({ alg: 'HS256', typ: 'JWT' });
  const body = encodeJwtPart(payload);
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};

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
    const allFoods = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=ALL&search=winter%20melon`, { headers: authHeaders(consultant.token) });
    assert.equal(allFoods.response.status, 200, JSON.stringify(allFoods.body));
    assert.equal(String(allFoods.body.items[0].displayName).toLowerCase(), 'ash gourd');
    assert.equal(allFoods.body.items[0].nutritionStatus, 'NUTRITION_VERIFIED');
    assert.equal(allFoods.body.items[0].generatorEligibility, 'ELIGIBLE');
    assert.equal(allFoods.body.items[0].addToMealEligible, true);
    assert.ok(allFoods.body.items[0].nutritionPer100g);
    assert.ok(allFoods.body.totals.catalogue > allFoods.body.totals.generatorEligible);
    assert.ok(Array.isArray(allFoods.body.facets.states));
    const recommendedFoods = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=RECOMMENDED&mealHead=BREAKFAST`, { headers: authHeaders(consultant.token) });
    assert.equal(recommendedFoods.response.status, 200, JSON.stringify(recommendedFoods.body));
    assert.ok(recommendedFoods.body.items.every((item: { nutritionStatus:string;generatorEligibility:string;mealEligibility:string }) => item.nutritionStatus === 'NUTRITION_VERIFIED' && item.generatorEligibility === 'ELIGIBLE' && item.mealEligibility === 'RECOMMENDED'));
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
    const emptyDraft = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: draft.body.version.id, options: [],
    }, { headers: authHeaders(consultant.token) });
    assert.equal(emptyDraft.response.status, 200, JSON.stringify(emptyDraft.body));
    assert.equal(emptyDraft.body.options.length, 0);

    const oneOption = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: draft.body.version.id, options: selectedOptions.slice(0, 1),
    }, { headers: authHeaders(consultant.token) });
    assert.equal(oneOption.response.status, 200, JSON.stringify(oneOption.body));
    assert.equal(oneOption.body.options.length, 1);
    const oneOptionReloaded = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, { headers: authHeaders(consultant.token) });
    assert.equal(oneOptionReloaded.response.status, 200, JSON.stringify(oneOptionReloaded.body));
    assert.equal(oneOptionReloaded.body.options.length, 1);
    if (index === 0) {
      const incompleteApproval = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/approve`, {}, { headers: authHeaders(consultant.token) });
      assert.equal(incompleteApproval.response.status, 409, JSON.stringify(incompleteApproval.body));
      assert.equal(incompleteApproval.body.error, 'DIET_PLAN_REVIEW_CONTENT_INCOMPLETE');
    }

    const partial = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: draft.body.version.id, options: selectedOptions.slice(0, 22),
    }, { headers: authHeaders(consultant.token) });
    assert.equal(partial.response.status, 200, JSON.stringify(partial.body));
    assert.equal(partial.body.options.length, 22);

    const firstMeal = selectedOptions.filter((option: { mealHead: string }) => option.mealHead === 'EARLY_MORNING');
    const overflow = await putJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/common-food/options`, {
      expectedPlanVersionId: draft.body.version.id,
      options: [...firstMeal, { ...firstMeal[0], optionId: `${firstMeal[0].optionId}-sixth` }],
    }, { headers: authHeaders(consultant.token) });
    assert.equal(overflow.response.status, 400, JSON.stringify(overflow.body));

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

    if (index === 0) {
      const approved = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/approve`, {}, { headers: authHeaders(consultant.token) });
      assert.equal(approved.response.status, 200, JSON.stringify(approved.body));
      assert.equal(approved.body.version.lifecycleStatus, 'approved');
      assert.equal(approved.body.plan.approvedBy, consultant.user.id);

      const published = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/${planId}/publish`, {
        approvedVersionId: approved.body.version.id,
      }, { headers: authHeaders(consultant.token) });
      assert.equal(published.response.status, 200, JSON.stringify(published.body));
      assert.equal(published.body.version.lifecycleStatus, 'published');
      assert.equal(published.body.plan.latestPublishedVersionId, approved.body.version.id);

      const clientPlan = await getJson(server.baseUrl, '/v1/platform/nutrition-plan', { headers: authHeaders(client.token) });
      assert.equal(clientPlan.response.status, 200, JSON.stringify(clientPlan.body));
      assert.equal(clientPlan.body.plan.planStatus, 'published');
      assert.equal(clientPlan.body.version.lifecycleStatus, 'published');
      assert.equal(clientPlan.body.version.id, approved.body.version.id);
      assert.equal(clientPlan.body.version.commonFoodOptions.length, 35);
      assert.equal(new Set(clientPlan.body.version.commonFoodOptions.map((option: { mealHead: string }) => option.mealHead)).size, 7);

      const subsequentDraft = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/draft`, {}, { headers: authHeaders(consultant.token) });
      assert.equal(subsequentDraft.response.status, 201, JSON.stringify(subsequentDraft.body));
      assert.notEqual(subsequentDraft.body.version.id, approved.body.version.id);
      const clientPlanAfterDraft = await getJson(server.baseUrl, '/v1/platform/nutrition-plan', { headers: authHeaders(client.token) });
      assert.equal(clientPlanAfterDraft.response.status, 200, JSON.stringify(clientPlanAfterDraft.body));
      assert.equal(clientPlanAfterDraft.body.version.id, approved.body.version.id);
    }
  }
});

test('dietician bridge role reaches Common Food through governed identity and legacy assignment', async () => {
  const jwtSecret = 'common-food-dietician-route-test-secret';
  const previousJwtSecret = process.env.AUTH_SERVICE_JWT_SECRET_KEY;
  const previousSuccessTracing = process.env.COMMON_FOOD_AUTHORIZATION_TRACE_SUCCESS;
  process.env.AUTH_SERVICE_JWT_SECRET_KEY = jwtSecret;
  process.env.COMMON_FOOD_AUTHORIZATION_TRACE_SUCCESS = 'true';

  const authenticatedSubject = 'b1fe3d8e-ebba-4326-9e5a-e18c94e6d055';
  const assignmentPrincipal = 'ext_330a4fa0-731b-4162-bcb9-bf4e21e6a014';
  const assignmentId = 'da89a376-04ac-406e-b5d1-137e8ddf0fa0';
  const wrongTenantId = '33333333-3333-4333-8333-333333333333';

  try {
    const client = await createAuthenticatedSession(server.baseUrl, { name: 'Kirti route fixture' });
    const publicClientId = String(client.current.body.client.fiteatsyClientId);
    const clientUserId = String(client.current.body.accountId);
    const tenantResult = await pool.query('select tenant_id from fiteatsy_clients where account_user_id=$1', [clientUserId]);
    const tenantId = String(tenantResult.rows[0].tenant_id);
    const health = await patchJson(server.baseUrl, '/v1/platform/health-profile', {
      dateOfBirthISO: '1982-01-01T00:00:00.000Z',
      gender: 'Female',
      heightCm: 165,
      currentWeightKg: 65,
      activityLevel: 'Moderate',
      wellnessGoals: ['Maintain health'],
      dietType: 'vegetarian',
      mealsPerDay: 7,
      waterIntakeLiters: 2.5,
    }, { headers: authHeaders(client.token) });
    assert.equal(health.response.status, 200, JSON.stringify(health.body));

    await pool.query(`
      create table if not exists external_consultant_signups (
        id uuid primary key,
        auth_identity_id text not null,
        fiteatsy_user_id text references users(id) on delete restrict,
        signup_state text not null,
        tenant_id uuid,
        updated_at timestamptz not null default now()
      )
    `);
    await pool.query('truncate table external_consultant_signups cascade');
    await pool.query(
      `insert into users(id,name,role,status)
       values($1,'Legacy dietician assignment principal','dietician','active')`,
      [assignmentPrincipal],
    );
    const ownerMembershipId = crypto.randomUUID();
    const membershipTimestamp = new Date().toISOString();
    await pool.query(
      `insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status,joined_at,created_at,updated_at)
       values($1,$2,$3,'OWNER','active',$4,$4,$4)`,
      [ownerMembershipId, tenantId, assignmentPrincipal, membershipTimestamp],
    );
    await pool.query(
      `insert into external_consultant_signups(
         id,auth_identity_id,fiteatsy_user_id,email_normalized,account_type,signup_state,
         tenant_id,owner_membership_id,idempotency_key,created_by_reference
       ) values(gen_random_uuid(),$1,$2,$1 || '@qa.invalid','INDEPENDENT_CONSULTANT','READY',$3,$4,gen_random_uuid()::text,'database-test')`,
      [authenticatedSubject, assignmentPrincipal, tenantId, ownerMembershipId],
    );
    await pool.query(
      `insert into consultant_client_assignments(
         id,tenant_id,consultant_user_id,client_user_id,status,scope,product,professional_type,relationship_type
       ) values($1,$2,$3,$4,'active','client_care','FITEATSY','CONSULTANT','CLIENT_CARE')`,
      [assignmentId, tenantId, assignmentPrincipal, clientUserId],
    );

    const tokenForTenant = (resolvedTenantId: string, role = 'dietician') => signConsultantDashboardJwt(jwtSecret, {
      sub: authenticatedSubject,
      application_user_id: authenticatedSubject,
      tenant_id: resolvedTenantId,
      role,
      status: 'ACTIVE',
      credential_status: 'PERMANENT',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 600,
    });

    const tenantDenied = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods`, {
      headers: authHeaders(tokenForTenant(wrongTenantId)),
    });
    assert.equal(tenantDenied.response.status, 403, JSON.stringify(tenantDenied.body));
    assert.equal(tenantDenied.body.error, 'CONSULTANT_IDENTITY_TENANT_MISMATCH');

    const unassignedClient = await createAuthenticatedSession(server.baseUrl, { name: 'Unassigned Common Food client' });
    const unassignedPublicClientId = String(unassignedClient.current.body.client.fiteatsyClientId);
    const unassigned = await getJson(server.baseUrl, `/v1/consultants/clients/${unassignedPublicClientId}/common-foods`, {
      headers: authHeaders(tokenForTenant(tenantId)),
    });
    assert.equal(unassigned.response.status, 403, JSON.stringify(unassigned.body));
    assert.equal(unassigned.body.error, 'CLIENT_ASSIGNMENT_REQUIRED');

    const unrelatedRole = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods`, {
      headers: authHeaders(client.token),
    });
    assert.equal(unrelatedRole.response.status, 403, JSON.stringify(unrelatedRole.body));
    assert.equal(unrelatedRole.body.error, 'ROLE_NOT_ALLOWED');

    const dieticianToken = tokenForTenant(tenantId);
    const draft = await postJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/diet-plans/draft`, {}, {
      headers: authHeaders(dieticianToken),
    });
    assert.equal(draft.response.status, 201, JSON.stringify(draft.body));

    const traceEvents: Array<Record<string, unknown>> = [];
    const originalInfo = console.info;
    console.info = (message?: unknown, details?: unknown, ...rest: unknown[]) => {
      if (message === 'COMMON_FOOD_AUTHORIZATION_TRACE' && details && typeof details === 'object') {
        traceEvents.push(details as Record<string, unknown>);
      }
      originalInfo(message, details, ...rest);
    };
    let commonFoods;
    try {
      commonFoods = await getJson(server.baseUrl, `/v1/consultants/clients/${publicClientId}/common-foods?scope=ALL&search=ash%20gourd`, {
        headers: {
          ...authHeaders(dieticianToken),
          'x-request-id': 'common-food-dietician-route-test',
        },
      });
    } finally {
      console.info = originalInfo;
    }

    assert.equal(commonFoods.response.status, 200, JSON.stringify(commonFoods.body));
    assert.equal(commonFoods.response.headers.get('x-request-id'), 'common-food-dietician-route-test');
    assert.ok(commonFoods.body.items.length > 0, JSON.stringify(commonFoods.body));
    assert.equal(traceEvents.length, 1, JSON.stringify(traceEvents));
    assert.deepEqual(traceEvents[0], {
      requestId: 'common-food-dietician-route-test',
      method: 'GET',
      route: '/v1/consultants/clients/:clientId/common-foods',
      status: 200,
      errorCode: null,
      jwtSubject: authenticatedSubject,
      effectiveUserId: authenticatedSubject,
      role: 'dietician',
      jwtApplicationIdentity: authenticatedSubject,
      governedConsultantIdentity: assignmentPrincipal,
      requestedClientId: publicClientId,
      canonicalClientId: publicClientId,
      jwtTenantId: tenantId,
      governedTenantId: tenantId,
      activeAssignmentId: assignmentId,
      failedAuthorizationPredicate: null,
    });
  } finally {
    if (previousJwtSecret === undefined) delete process.env.AUTH_SERVICE_JWT_SECRET_KEY;
    else process.env.AUTH_SERVICE_JWT_SECRET_KEY = previousJwtSecret;
    if (previousSuccessTracing === undefined) delete process.env.COMMON_FOOD_AUTHORIZATION_TRACE_SUCCESS;
    else process.env.COMMON_FOOD_AUTHORIZATION_TRACE_SUCCESS = previousSuccessTracing;
  }
});
