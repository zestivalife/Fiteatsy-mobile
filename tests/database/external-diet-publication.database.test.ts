import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { ingestExternalDietPlan, selectExternalDietPlan } from '../../backend/src/modules/external-consultants/external-diet-plan.store.js';
import { governedCommonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import type { NutritionPlanContent } from '../../backend/src/modules/platform/platform.types.js';
import { createCareCaseIfMissing } from '../../backend/src/modules/platform/platform.store.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

databaseTest('external publication persists trusted tenant ownership and remains idempotent', async () => {
  await resetBackendStateForTests();
  const tenantId = randomUUID();
  const userId = randomUUID();
  const clientId = randomUUID();
  const profileId = randomUUID();
  await pool.query(`insert into tenants(id,name,slug,tenant_type,status) values($1,'Publication Test',$2,'PRACTICE','active')`, [tenantId, `publication-${tenantId}`]);
  await pool.query(`insert into users(id,name,email_normalized,role,status,account_purpose) values($1,'Publication Client',$2,'user','active','QA_TEST')`, [userId, `${userId}@example.test`]);
  await pool.query(`insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status) values($1,$2,$3,'CLIENT','active')`, [randomUUID(), tenantId, userId]);
  await pool.query(`insert into fiteatsy_clients(id,fiteatsy_client_id,account_user_id,tenant_id) values($1,$2,$3,$4)`, [clientId, `fc_publication_${Date.now()}`, userId, tenantId]);
  await pool.query(`insert into health_profiles(id,user_id,client_id) values($1,$2,$3)`, [profileId, userId, clientId]);
  const careCase = await createCareCaseIfMissing({ accountId: userId, clientId }, profileId);

  const food = governedCommonFoodCatalogue.find((item) => item.active && item.clientConsumable)!;
  const serving = food.servings.find((item) => item.active)!;
  const empty = { window: '', focus: '', options: [] };
  const content: NutritionPlanContent = {
    nutritionSnapshot: { client: userId, age: null, gender: null, goals: [], healthConditions: [], dietPreference: null, allergies: [], lifestyleSummary: '', personalisedPlanFocus: '', programmeName: 'Publication test', preparedBy: 'consultant-test' },
    dailyTargets: { calories: 1800, protein: 100, hydration: null, movement: '' },
    mealPlan: {
      earlyMorning: empty,
      breakfast: { ...empty, options: [{ id: 'option-1', slot: 1, meal: food.displayName, portion: serving.label, prepNote: '', approxKcal: 100, proteinGrams: 5, sourceType: 'verified_library', isApproved: true, components: [{ id: 'component-1', foodId: food.id, foodVersion: food.version, servingId: serving.id, servingVersion: serving.version, sourceMappingId: food.sourceMappingId, componentName: food.displayName, quantity: serving.grams, quantityUnit: 'g', canonicalGrams: serving.grams, calories: 100, proteinGrams: 5, locked: true }] }] },
      midMorningSnack: empty, lunch: empty, eveningSnack: empty, dinner: empty, bedtimeNutrition: empty,
    },
    hydrationRhythm: [], weeklySuccessGuide: [], smartSubstitutions: [], supplementsAndClinicalNotes: [],
  };
  const publication = { userId, careCaseId: careCase.id, connectionId: randomUUID(), tenantId, externalPlanId: randomUUID(), externalVersion: '2', consultantId: randomUUID(), consultantName: 'External Consultant', practiceName: 'Publication Test', publishedAtISO: '2026-11-11T10:00:00.000Z', content };
  const first = await ingestExternalDietPlan(publication);
  const second = await ingestExternalDietPlan(publication);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.planId, first.planId);
  assert.equal(second.versionId, first.versionId);
  const ownership = await pool.query(`select dp.tenant_id plan_tenant,dpv.tenant_id version_tenant from diet_plans dp join diet_plan_versions dpv on dpv.diet_plan_id=dp.id where dp.id=$1`, [first.planId]);
  assert.deepEqual(ownership.rows[0], { plan_tenant: tenantId, version_tenant: tenantId });
  const selected = await selectExternalDietPlan({ userId, careCaseId: careCase.id, connectionId: publication.connectionId, externalPlanId: publication.externalPlanId, tenantId });
  assert.equal(selected.diet_plan_version_id, first.versionId);
  const denied = await selectExternalDietPlan({ userId, careCaseId: careCase.id, connectionId: publication.connectionId, externalPlanId: publication.externalPlanId, tenantId: randomUUID() });
  assert.equal(denied, null);
});
