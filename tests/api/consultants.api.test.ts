import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../backend/src/db/pool.js';
import { createBiomarkerObservation, upsertBiomarker } from '../../backend/src/modules/biomarkers/biomarkers.repository.js';
import { ingestHealthObservations } from '../../backend/src/modules/health/health-observations.repository.js';
import { createReportRecord } from '../../backend/src/modules/reports/reports.store.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, patchJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server?.close();
});

test.beforeEach(async () => {
  await resetTestState();
});

const createConsultantSession = async () => {
  const session = await createAuthenticatedSession(server.baseUrl, {
    name: 'Consultant User',
    email: `consultant-${Date.now()}@example.com`
  });
  await pool.query('update users set role = $2 where id = $1', [session.current.body.accountId, 'consultant']);
  return session;
};

const ageFromDob = (dobISO: string) => {
  const dob = new Date(dobISO);
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
};

test('GET /v1/consultants/clients returns empty state when no registered clients exist', async () => {
  const consultant = await createConsultantSession();

  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.clients, []);
});

test('GET /v1/consultants/clients denies normal user sessions', async () => {
  const user = await createAuthenticatedSession(server.baseUrl);

  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(user.token)
  });

  assert.equal(response.response.status, 403);
  assert.equal(response.body.error, 'ROLE_NOT_ALLOWED');
});

test('GET /v1/consultants/clients allows historical uppercase consultant role casing', async () => {
  const consultant = await createConsultantSession();
  await pool.query('update users set status = $2, role = $3 where id = $1', [consultant.current.body.accountId, 'ACTIVE', 'CONSULTANT']);

  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.clients, []);
});

test('registered Fiteatsy users appear in consultant client discovery without dummy data', async () => {
  const email = `real-client-${Date.now()}@example.com`;
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Real Client',
    email,
    mobileNumber: '+919900001234'
  });
  const consultant = await createConsultantSession();

  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.body.clients.length, 1);
  assert.equal(response.body.clients[0].name, 'Real Client');
  assert.equal(response.body.clients[0].clientId, client.current.body.client.fiteatsyClientId);
  assert.equal(response.body.clients[0].email, email);
  assert.equal(response.body.clients[0].mobile, '919900001234');
  assert.equal(response.body.clients[0].mobileNumberMasked, '******1234');
  assert.equal(response.body.clients[0].status, 'active');
  assert.equal(response.body.clients[0].accountStatus, 'active');
  assert.equal(response.body.clients[0].profileCompleted, false);
  assert.equal(response.body.clients[0].reportsCount, 0);
  assert.equal(response.body.clients[0].biomarkerStatus, null);
  assert.equal(response.body.clients[0].lastHealthUpdate, null);
  assert.equal(typeof response.body.clients[0].registeredAt, 'string');
  assert.equal(typeof response.body.clients[0].lastActiveAt, 'string');
});

test('consultant discovery backfills missing client records for registered users', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Legacy Client',
    email: `legacy-client-${Date.now()}@example.com`
  });
  await pool.query('delete from fiteatsy_clients where account_user_id = $1', [client.current.body.accountId]);

  const consultant = await createConsultantSession();
  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.body.clients.length, 1);
  assert.equal(response.body.clients[0].name, 'Legacy Client');
  const clientRow = await pool.query('select count(*)::int as total from fiteatsy_clients where account_user_id = $1', [client.current.body.accountId]);
  assert.equal(clientRow.rows[0].total, 1);
});

test('consultant discovery repairs inactive client mappings and preserves client ids', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Inactive Mapping Client',
    email: `inactive-client-${Date.now()}@example.com`
  });
  await pool.query(
    'update fiteatsy_clients set status = $2, deleted_at = now(), version = version + 1 where account_user_id = $1',
    [client.current.body.accountId, 'inactive']
  );

  const consultant = await createConsultantSession();
  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.body.clients.length, 1);
  assert.equal(response.body.clients[0].clientId, client.current.body.client.fiteatsyClientId);
  assert.equal(response.body.clients[0].name, 'Inactive Mapping Client');
  assert.equal(response.body.clients[0].status, 'active');

  const repaired = await pool.query(
    'select status, deleted_at from fiteatsy_clients where account_user_id = $1',
    [client.current.body.accountId]
  );
  assert.equal(repaired.rows[0].status, 'active');
  assert.equal(repaired.rows[0].deleted_at, null);
});

test('consultant discovery accepts production status and role casing', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Uppercase Status Client',
    email: `uppercase-status-client-${Date.now()}@example.com`
  });
  await pool.query('update users set status = $2, role = $3 where id = $1', [client.current.body.accountId, 'ACTIVE', 'USER']);
  await pool.query('update fiteatsy_clients set status = $2 where account_user_id = $1', [client.current.body.accountId, 'ACTIVE']);

  const consultant = await createConsultantSession();
  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.body.clients.length, 1);
  assert.equal(response.body.clients[0].name, 'Uppercase Status Client');
  assert.equal(response.body.clients[0].clientId, client.current.body.client.fiteatsyClientId);
});

test('consultant client profile returns real onboarding fields only', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Onboarded Client',
    email: `onboarded-client-${Date.now()}@example.com`,
    mobileNumber: '+919811112222'
  });
  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1991-06-14T00:00:00.000Z',
      gender: 'Female',
      heightCm: 162,
      currentWeightKg: 61,
      waistCm: 78,
      hipCm: 94,
      neckCm: 32,
      wellnessGoals: ['Improve energy'],
      activityLevel: 'Moderate',
      dietType: 'Vegetarian',
      primaryConditions: ['Vitamin D deficiency'],
      sleepHours: 7,
      sleepGoalHours: 8,
      sleepQualityLabel: 'Good',
      smokingStatus: 'Never',
      alcoholFrequency: 'Monthly',
      exerciseFrequency: '3-4x/week',
      stressLevelLabel: 'Moderate',
      preferredCuisines: ['Maharashtrian', 'South Indian'],
      foodAllergies: ['Peanuts'],
      foodsDisliked: ['Bitter gourd'],
      mealsPerDay: 3,
      waterIntakeLiters: 2.5,
      previousConditions: ['Anemia'],
      familyHistoryConditions: ['Diabetes'],
      currentMedicines: ['Vitamin D3'],
      medicalNotes: 'Prefers early dinners.',
      pcosStatus: 'No',
      thyroidStatus: 'No',
      diabetesStatus: 'No',
      hypertensionStatus: 'No',
      cholesterolStatus: 'Borderline',
      heartConditionStatus: 'No',
      pregnancyStatus: 'Not applicable',
      breastfeedingStatus: 'No',
      previousSurgeries: ['None']
    },
    { headers: authHeaders(client.token) }
  );
  const consultant = await createConsultantSession();

  const list = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(list.response.status, 200);
  assert.equal(list.body.clients[0].profileCompleted, true);
  assert.equal(list.body.clients[0].age, ageFromDob('1991-06-14T00:00:00.000Z'));
  assert.equal(list.body.clients[0].gender, 'Female');
  assert.equal(list.body.clients[0].height, 162);
  assert.equal(list.body.clients[0].weight, 61);
  assert.equal(list.body.clients[0].goal, 'Improve energy');
  assert.equal(list.body.clients[0].activityLevel, 'Moderate');
  assert.equal(list.body.clients[0].dietPreference, 'Vegetarian');
  assert.deepEqual(list.body.clients[0].medicalConditions, ['Vitamin D deficiency']);
  assert.equal(list.body.clients[0].onboarding.height, 162);
  assert.equal(list.body.clients[0].onboarding.weight, 61);
  assert.equal(list.body.clients[0].onboarding.goal, 'Improve energy');
  assert.equal(list.body.clients[0].onboarding.activityLevel, 'Moderate');
  assert.equal(list.body.clients[0].onboarding.dietPreference, 'Vegetarian');
  assert.deepEqual(list.body.clients[0].onboarding.medicalConditions, ['Vitamin D deficiency']);
  assert.equal(list.body.clients[0].healthProfile.reportsCount, 0);
  assert.equal(list.body.clients[0].healthProfile.profileCompleted, true);
  assert.equal(list.body.clients[0].reportsCount, 0);

  const profile = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.client.id, client.current.body.client.fiteatsyClientId);
  assert.equal(profile.body.client.name, 'Onboarded Client');
  assert.equal(profile.body.client.dob, '1991-06-14T00:00:00.000Z');
  assert.equal(profile.body.client.age, ageFromDob('1991-06-14T00:00:00.000Z'));
  assert.equal(profile.body.client.gender, 'Female');
  assert.equal(profile.body.client.mobile, '919811112222');
  assert.equal(profile.body.client.status, 'active');
  assert.equal(profile.body.client.accountStatus, 'active');
  assert.equal(profile.body.client.mobileNumberMasked, '******2222');
  assert.equal(profile.body.onboarding.height, 162);
  assert.equal(profile.body.onboarding.weight, 61);
  assert.equal(profile.body.onboarding.goal, 'Improve energy');
  assert.equal(profile.body.onboarding.activityLevel, 'Moderate');
  assert.equal(profile.body.onboarding.dietPreference, 'Vegetarian');
  assert.deepEqual(profile.body.onboarding.medicalConditions, ['Vitamin D deficiency']);
  assert.equal(profile.body.healthProfile.biomarkerStatus, null);
  assert.equal(profile.body.healthProfile.reportsCount, 0);
  assert.equal(profile.body.healthProfile.profileCompleted, true);
  assert.equal(profile.body.healthMetrics.bmi.status, 'AVAILABLE');
  assert.equal(profile.body.healthMetrics.bmi.value, 23.2);
  assert.equal(profile.body.healthMetrics.bmi.category, 'Normal');
  assert.equal(profile.body.healthMetrics.bmr.status, 'AVAILABLE');
  assert.equal(profile.body.healthMetrics.tdee.status, 'AVAILABLE');
  assert.equal(profile.body.healthMetrics.bodyFat.status, 'AVAILABLE');
  assert.equal(profile.body.healthMetrics.oneRepMax.status, 'NOT_AVAILABLE');
  assert.deepEqual(profile.body.biomarkers, []);
  assert.equal('recommendations' in profile.body, false);
});

test('GET /v1/consultants/clients/:clientId/workspace returns incomplete states for a new user', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Workspace New Client',
    email: `workspace-new-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();

  const workspace = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/workspace`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(workspace.response.status, 200);
  assert.equal(workspace.body.client.id, client.current.body.client.fiteatsyClientId);
  assert.equal(workspace.body.completeness.onboardingStatus, 'INCOMPLETE');
  assert.equal(workspace.body.completeness.profileCompletionScore, 20);
  assert.ok(workspace.body.completeness.missingFields.includes('height'));
  assert.equal(workspace.body.bodyMetrics.bmi, null);
  assert.equal(workspace.body.bodyMetrics.unavailableReasons.bmi, 'Height and weight are required.');
  assert.equal(workspace.body.nutritionProtocol.calorieTarget, null);
  assert.equal(workspace.body.nutritionProtocol.macroTargets, null);
  assert.equal(workspace.body.wearableSummary.connected, false);
  assert.equal(workspace.body.wearableSummary.recordsCount, 0);
  assert.deepEqual(workspace.body.reports, []);
  assert.deepEqual(workspace.body.biomarkers, []);
  assert.ok(workspace.body.recommendations.some((item: { title: string }) => item.title === 'Complete onboarding inputs'));
  assert.ok(workspace.body.timeline.some((item: { type: string }) => item.type === 'registration'));
  assert.equal(workspace.body.syncMetadata.dataSource, 'Fiteatsy production database');
});

test('GET /v1/consultants/clients/:clientId/workspace exposes calculated health intelligence for onboarded users', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Workspace Onboarded Client',
    email: `workspace-onboarded-client-${Date.now()}@example.com`,
    mobileNumber: '+919811113333'
  });
  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1991-06-14T00:00:00.000Z',
      gender: 'Female',
      heightCm: 162,
      currentWeightKg: 61,
      waistCm: 78,
      hipCm: 94,
      neckCm: 32,
      wellnessGoals: ['Improve energy'],
      activityLevel: 'Moderate',
      dietType: 'Vegetarian',
      primaryConditions: ['Vitamin D deficiency']
    },
    { headers: authHeaders(client.token) }
  );
  const consultant = await createConsultantSession();

  const workspace = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/workspace`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(workspace.response.status, 200);
  assert.equal(workspace.body.onboarding.height, 162);
  assert.equal(workspace.body.onboarding.weight, 61);
  assert.equal(workspace.body.onboarding.lifestyle.sleepHours, 7);
  assert.equal(workspace.body.onboarding.lifestyle.sleepGoalHours, 8);
  assert.equal(workspace.body.onboarding.lifestyle.sleepQuality, 'Good');
  assert.equal(workspace.body.onboarding.lifestyle.stressLevel, 'Moderate');
  assert.equal(workspace.body.onboarding.lifestyle.smoking, 'Never');
  assert.equal(workspace.body.onboarding.lifestyle.alcohol, 'Monthly');
  assert.equal(workspace.body.onboarding.lifestyle.exerciseFrequency, '3-4x/week');
  assert.deepEqual(workspace.body.onboarding.nutrition.preferredCuisines, ['Maharashtrian', 'South Indian']);
  assert.deepEqual(workspace.body.onboarding.nutrition.foodAllergies, ['Peanuts']);
  assert.deepEqual(workspace.body.onboarding.nutrition.foodDislikes, ['Bitter gourd']);
  assert.equal(workspace.body.onboarding.nutrition.mealFrequency, 3);
  assert.equal(workspace.body.onboarding.nutrition.waterIntakeLiters, 2.5);
  assert.equal(workspace.body.onboarding.healthHistory.pcos, 'No');
  assert.equal(workspace.body.onboarding.healthHistory.thyroid, 'No');
  assert.equal(workspace.body.onboarding.healthHistory.diabetes, 'No');
  assert.equal(workspace.body.onboarding.healthHistory.hypertension, 'No');
  assert.equal(workspace.body.onboarding.healthHistory.cholesterol, 'Borderline');
  assert.equal(workspace.body.onboarding.healthHistory.heartConditions, 'No');
  assert.equal(workspace.body.onboarding.healthHistory.pregnancy, 'Not applicable');
  assert.equal(workspace.body.onboarding.healthHistory.breastfeeding, 'No');
  assert.deepEqual(workspace.body.onboarding.healthHistory.previousConditions, ['Anemia']);
  assert.deepEqual(workspace.body.onboarding.healthHistory.familyMedicalHistory, ['Diabetes']);
  assert.deepEqual(workspace.body.onboarding.healthHistory.previousSurgeries, ['None']);
  assert.deepEqual(workspace.body.onboarding.healthHistory.medications, ['Vitamin D3']);
  assert.equal(workspace.body.onboarding.healthHistory.medicalNotes, 'Prefers early dinners.');
  assert.equal(workspace.body.bodyMetrics.bmi, 23.2);
  assert.equal(workspace.body.bodyMetrics.bmiCategory, 'Normal');
  assert.equal(workspace.body.bodyMetrics.bmr > 0, true);
  assert.equal(workspace.body.bodyMetrics.tdee > workspace.body.bodyMetrics.bmr, true);
  assert.equal(workspace.body.nutritionProtocol.calorieTarget, workspace.body.bodyMetrics.tdee);
  assert.equal(workspace.body.nutritionProtocol.macroTargets.caloriesKcal, workspace.body.bodyMetrics.tdee);
  assert.equal(workspace.body.nutritionProtocol.hydrationTargetLiters, 2.1);
  assert.equal(workspace.body.completeness.profileCompletionScore > 20, true);
  assert.equal(Array.isArray(workspace.body.syncMetadata.dataSources), true);
  assert.ok(workspace.body.syncMetadata.dataSources.includes('health_profile'));

  const calculationRows = await pool.query(
    'select count(*)::int as total from health_calculations where user_id = $1 and client_id = $2',
    [client.current.body.accountId, client.current.body.client.id]
  );
  assert.equal(calculationRows.rows[0].total >= 6, true);
});

test('GET /v1/clients/:clientId/workspace exposes canonical contract, assignment scope, and profile provenance', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Canonical Contract Client',
    email: `canonical-contract-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();

  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1992-05-10T00:00:00.000Z',
      gender: 'Male',
      heightCm: 174,
      currentWeightKg: 76,
      wellnessGoals: ['Improve metabolic health'],
      activityLevel: 'Lightly Active',
      dietType: 'Mixed'
    },
    { headers: authHeaders(client.token) }
  );

  const response = await getJson(
    server.baseUrl,
    `/v1/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/workspace`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(response.response.status, 200);
  assert.equal(response.body.contract.version, '2026-08-12.fiteatsy-client-workspace.v1');
  assert.equal(response.body.contract.canonicalRoute, '/v1/clients/{id}/workspace');
  assert.equal(response.body.access.requestAccountId, consultant.current.body.accountId);
  assert.equal(response.body.access.requestRole, 'consultant');
  assert.equal(response.body.access.consentValidation.status, 'granted');
  assert.equal(response.body.access.assignmentValidation.status, 'unassigned');
  assert.equal(response.body.healthProfile.gender, 'Male');
  assert.equal(response.body.healthProfile.heightCm, 174);
  assert.equal(response.body.healthProfile.currentWeightKg, 76);
  assert.equal(response.body.healthProfile.assignedConsultantId, null);
  assert.equal(response.body.sourceMetadata.sourceProduct, 'Fiteatsy');
  assert.equal(response.body.sourceMetadata.sourceClientRef, client.current.body.client.fiteatsyClientId);
  assert.ok(Array.isArray(response.body.provenance.sources));
  assert.ok(response.body.provenance.sources.some((item: { key: string }) => item.key === 'health_profile'));
  assert.ok(response.body.access.allowedScopes.includes('client.health_profile.read'));
  assert.ok(response.body.access.restrictedScopes.includes('report.binary.read'));
});

test('consultant workspace contract syncs reports and validated biomarkers from source data', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Report Sync Client',
    email: `report-sync-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();
  const owner = { accountId: client.current.body.accountId, clientId: client.current.body.client.id };

  const report = await createReportRecord({
    userId: owner.accountId,
    clientId: owner.clientId,
    fileName: 'vitamin-d-panel.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    labName: 'Lal PathLabs',
    reportDate: '2026-08-01',
    reportType: 'blood_report'
  });
  await pool.query(
    'update health_reports set processing_status = $2, updated_at = $3 where id = $1',
    [report.id, 'PUBLISHED', '2026-08-02T08:15:00.000Z']
  );
  const biomarker = await upsertBiomarker({
    canonicalName: 'Vitamin D',
    aliases: ['25 OH Vitamin D'],
    category: 'Micronutrient',
    standardUnit: 'ng/mL'
  });
  await createBiomarkerObservation(owner, {
    biomarkerId: biomarker.id,
    sourceReportId: report.id,
    value: 18,
    unit: 'ng/mL',
    testDate: '2026-08-01',
    confidence: 0.98,
    validationStatus: 'validated',
    referenceRange: '30-100'
  });

  const response = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/workspace`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(response.response.status, 200);
  assert.equal(response.body.reports.length, 1);
  assert.equal(response.body.reports[0].labName, 'Lal PathLabs');
  assert.equal(response.body.reports[0].processingStatus, 'PUBLISHED');
  assert.equal(response.body.biomarkers.length, 1);
  assert.equal(response.body.biomarkers[0].name, 'Vitamin D');
  assert.equal(response.body.biomarkers[0].value, 18);
  assert.equal(response.body.biomarkers[0].referenceRange, '30-100');
  assert.ok(response.body.provenance.sources.some((item: { key: string, freshness: string }) => item.key === 'reports' && item.freshness === 'fresh'));
});

test('consultant workspace contract syncs wearable summaries and source metadata', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Wearable Sync Client',
    email: `wearable-sync-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();
  const owner = { accountId: client.current.body.accountId, clientId: client.current.body.client.id };

  await ingestHealthObservations(owner, [
    {
      metricType: 'steps',
      value: 6842,
      unit: 'count',
      measuredAtISO: '2026-08-11T07:30:00.000Z',
      sourceProvider: 'apple_health',
      sourceRecordId: 'steps-1'
    },
    {
      metricType: 'resting_heart_rate',
      value: 62,
      unit: 'bpm',
      measuredAtISO: '2026-08-11T07:35:00.000Z',
      sourceProvider: 'apple_health',
      sourceRecordId: 'rhr-1'
    }
  ]);

  const response = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/workspace`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(response.response.status, 200);
  assert.equal(response.body.wearableSummary.connected, true);
  assert.equal(response.body.wearableSummary.recordsCount, 2);
  assert.ok(response.body.wearableSummary.dataSources.includes('apple_health'));
  assert.ok(response.body.wearableSummary.latestMetrics.some((item: { metricType: string }) => item.metricType === 'steps'));
  assert.equal(response.body.planWorkflow.gates.wearableSignalsReady, true);
  assert.equal(response.body.sourceMetadata.lastWearableSyncAt, response.body.wearableSummary.lastSyncedAt);
});

test('GET /v1/clients/:clientId/workspace denies non-consultant sessions', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Denied Client',
    email: `denied-client-${Date.now()}@example.com`
  });

  const response = await getJson(
    server.baseUrl,
    `/v1/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/workspace`,
    { headers: authHeaders(client.token) }
  );

  assert.equal(response.response.status, 403);
  assert.equal(response.body.error, 'ROLE_NOT_ALLOWED');
});

test('consultant workspace contract flags stale synced sources without falling back to mock freshness', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Stale Sync Client',
    email: `stale-sync-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();
  const owner = { accountId: client.current.body.accountId, clientId: client.current.body.client.id };

  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      dateOfBirthISO: '1990-04-12T00:00:00.000Z',
      gender: 'Female',
      heightCm: 165,
      currentWeightKg: 68,
      wellnessGoals: ['Reduce inflammation'],
      activityLevel: 'Sedentary',
      dietType: 'Vegetarian'
    },
    { headers: authHeaders(client.token) }
  );

  const report = await createReportRecord({
    userId: owner.accountId,
    clientId: owner.clientId,
    fileName: 'stale-report.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    labName: 'Metropolis',
    reportDate: '2026-07-15',
    reportType: 'blood_report'
  });

  await pool.query('update health_profiles set updated_at = $2 where client_id = $1', [owner.clientId, '2026-07-01T09:00:00.000Z']);
  await pool.query('update health_reports set processing_status = $2, updated_at = $3 where id = $1', [report.id, 'PUBLISHED', '2026-07-02T10:00:00.000Z']);
  await ingestHealthObservations(owner, [{
    metricType: 'sleep_duration',
    value: 6.2,
    unit: 'hours',
    measuredAtISO: '2026-07-01T06:00:00.000Z',
    sourceProvider: 'google_health_connect',
    sourceRecordId: 'sleep-1'
  }]);

  const response = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/workspace`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(response.response.status, 200);
  assert.equal(response.body.provenance.freshness, 'stale');
  assert.ok(response.body.provenance.staleSources.includes('health_profile'));
  assert.ok(response.body.provenance.staleSources.includes('reports'));
  assert.ok(response.body.provenance.staleSources.includes('wearables'));
  assert.equal(response.body.syncMetadata.freshness, 'stale');
});
