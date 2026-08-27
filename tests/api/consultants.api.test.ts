import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool } from '../../backend/src/db/pool.js';
import { createBiomarkerObservation, upsertBiomarker } from '../../backend/src/modules/biomarkers/biomarkers.repository.js';
import { ingestHealthObservations } from '../../backend/src/modules/health/health-observations.repository.js';
import { createProfessionalAssignment } from '../../backend/src/modules/professional-assignments/professional-assignments.repository.js';
import { createReportRecord } from '../../backend/src/modules/reports/reports.store.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, patchJson, postJson } from '../helpers/http.js';
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

const assignClientToConsultant = async (
  client: Awaited<ReturnType<typeof createAuthenticatedSession>>,
  consultant: Awaited<ReturnType<typeof createConsultantSession>>
) => {
  const response = await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    { assignedConsultantId: consultant.current.body.accountId },
    { headers: authHeaders(client.token) }
  );
  assert.equal(response.response.status, 200, JSON.stringify(response.body));
};

const getClientDatabaseId = async (client: Awaited<ReturnType<typeof createAuthenticatedSession>>) => {
  const result = await pool.query(
    'select id from fiteatsy_clients where account_user_id = $1',
    [client.current.body.accountId]
  );
  assert.equal(result.rows.length, 1);
  return String(result.rows[0].id);
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
  await assignClientToConsultant(client, consultant);

  const response = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(response.response.status, 200);
  assert.equal(response.body.clients.length, 1);
  assert.equal(response.body.clients[0].name, 'Real Client');
  assert.equal(response.body.clients[0].clientId, client.current.body.client.fiteatsyClientId);
  assert.equal(response.body.clients[0].email, email);
  assert.equal(response.body.clients[0].mobile, '919900001234');
  assert.equal(response.body.clients[0].mobileNumberMasked, '********1234');
  assert.equal(response.body.clients[0].status, 'active');
  assert.equal(response.body.clients[0].accountStatus, 'active');
  assert.equal(response.body.clients[0].profileCompleted, false);
  assert.equal(response.body.clients[0].reportsCount, 0);
  assert.equal(response.body.clients[0].biomarkerStatus, null);
  const canonicalHealthProfile = await pool.query(
    'select updated_at from health_profiles where user_id = $1 and client_id = $2',
    [client.current.body.accountId, await getClientDatabaseId(client)]
  );
  assert.equal(canonicalHealthProfile.rows.length, 1);
  const lastHealthUpdate = String(response.body.clients[0].lastHealthUpdate);
  assert.equal(Number.isFinite(Date.parse(lastHealthUpdate)), true);
  const canonicalHealthUpdatedAt = new Date(canonicalHealthProfile.rows[0].updated_at);
  canonicalHealthUpdatedAt.setUTCMilliseconds(0);
  assert.equal(new Date(lastHealthUpdate).toISOString(), canonicalHealthUpdatedAt.toISOString());
  assert.equal(typeof response.body.clients[0].registeredAt, 'string');
  assert.equal(typeof response.body.clients[0].lastActiveAt, 'string');
});

test('consultant client discovery is assignment-scoped and independent of subscription', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Unsubscribed Assigned Client',
    email: `unsubscribed-assigned-${Date.now()}@example.com`
  });
  const assignedConsultant = await createConsultantSession();
  const unrelatedConsultant = await createConsultantSession();

  const beforeAssignment = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(assignedConsultant.token)
  });
  assert.equal(beforeAssignment.response.status, 200);
  assert.deepEqual(beforeAssignment.body.clients, []);

  await assignClientToConsultant(client, assignedConsultant);

  const assigned = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(assignedConsultant.token)
  });
  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.body.clients.length, 1);
  assert.equal(assigned.body.clients[0].clientId, client.current.body.client.fiteatsyClientId);

  const unrelated = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(unrelatedConsultant.token)
  });
  assert.equal(unrelated.response.status, 200);
  assert.deepEqual(unrelated.body.clients, []);
});

test('consultant discovery backfills missing client records for registered users', async () => {
  const accountId = crypto.randomUUID();
  const email = `legacy-client-${Date.now()}@example.com`;
  const registeredAt = new Date().toISOString();
  await pool.query(
    `insert into users (
       id, name, email_normalized, mobile_number_normalized,
       email_verified_at, mobile_verified_at, status, version,
       last_login_at, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $5, 'active', 1, $5, $5, $5)`,
    [accountId, 'Legacy Client', email, '919900009999', registeredAt]
  );

  const beforeBackfill = await pool.query(
    'select count(*)::int as total from fiteatsy_clients where account_user_id = $1',
    [accountId]
  );
  assert.equal(beforeBackfill.rows[0].total, 0);

  const consultant = await createConsultantSession();
  const discoveryOptions = {
    headers: authHeaders(consultant.token)
  };
  const initialResponses = await Promise.all([
    getJson(server.baseUrl, '/v1/consultants/clients', discoveryOptions),
    getJson(server.baseUrl, '/v1/consultants/clients', discoveryOptions)
  ]);
  for (const initialResponse of initialResponses) {
    assert.equal(initialResponse.response.status, 200);
    assert.deepEqual(initialResponse.body.clients, []);
  }

  const clientRows = await pool.query(
    'select id, fiteatsy_client_id from fiteatsy_clients where account_user_id = $1',
    [accountId]
  );
  assert.equal(clientRows.rowCount, 1);
  const canonicalClientId = String(clientRows.rows[0].id);
  const publicClientId = String(clientRows.rows[0].fiteatsy_client_id);

  const assignment = await createProfessionalAssignment({
    actorUserId: consultant.current.body.accountId,
    clientUserId: accountId,
    professionalUserId: consultant.current.body.accountId,
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
    reason: 'Valid missing-projection discovery fixture'
  });
  assert.ok(assignment);

  const first = await getJson(server.baseUrl, '/v1/consultants/clients', discoveryOptions);
  const second = await getJson(server.baseUrl, '/v1/consultants/clients', discoveryOptions);
  for (const response of [first, second]) {
    assert.equal(response.response.status, 200);
    assert.equal(response.body.clients.length, 1);
    assert.equal(response.body.clients[0].name, 'Legacy Client');
    assert.equal(response.body.clients[0].clientId, publicClientId);
  }

  const integrity = await pool.query(
    `select
       (select count(*)::int from fiteatsy_clients where account_user_id = $1) as client_total,
       (select count(*)::int from consultant_client_assignments where client_user_id = $1 and status = 'active') as assignment_total,
       (select count(*)::int from health_profiles where user_id = $1 and client_id <> $2) as cross_client_health_total,
       (select count(*)::int from health_profiles hp left join fiteatsy_clients c on c.id = hp.client_id and c.account_user_id = hp.user_id where hp.user_id = $1 and c.id is null) as orphan_health_total`,
    [accountId, canonicalClientId]
  );
  assert.equal(integrity.rows[0].client_total, 1);
  assert.equal(integrity.rows[0].assignment_total, 1);
  assert.equal(integrity.rows[0].cross_client_health_total, 0);
  assert.equal(integrity.rows[0].orphan_health_total, 0);
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
  await assignClientToConsultant(client, consultant);
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
  await assignClientToConsultant(client, consultant);
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
  await assignClientToConsultant(client, consultant);

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
  assert.equal(profile.body.client.mobileNumberMasked, '********2222');
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
  await assignClientToConsultant(client, consultant);

  const workspace = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/workspace`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(workspace.response.status, 200);
  assert.equal(workspace.body.client.id, client.current.body.client.fiteatsyClientId);
  assert.equal(workspace.body.completeness.onboardingStatus, 'INCOMPLETE');
  assert.equal(workspace.body.completeness.profileCompletionScore, 0);
  assert.ok(workspace.body.completeness.missingFields.includes('Height'));
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

test('consultant medication monitoring uses client tracker data and enforces assignment access', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Medication Client',
    email: `medication-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();
  const otherConsultant = await createConsultantSession();
  const baseDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const morningScheduledForISO = new Date(`${baseDate}T08:00:00.000+05:30`).toISOString();
  const eveningScheduledForISO = new Date(`${baseDate}T20:00:00.000+05:30`).toISOString();
  const medicationId = 'med-test-metformin';
  const medication = {
    id: medicationId,
    name: 'Metformin',
    type: 'tablet',
    dosage: '500 mg · 1 tablet',
    schedule: {
      frequency: { preset: 'every_day' },
      timeSlots: [
        { id: 'morning', time24h: '08:00', mealRelation: 'after_meal' },
        { id: 'evening', time24h: '20:00', mealRelation: 'after_meal' }
      ],
      duration: {
        startDateISO: istScheduledFor(0),
        endDateISO: null,
        ongoing: true
      }
    },
    reminderSound: 'default',
    status: 'active',
    notificationEnabled: true,
    createdAtISO: istScheduledFor(0),
    updatedAtISO: istScheduledFor(0)
  };

  const snapshot = await postJson(
    server.baseUrl,
    '/v1/platform/medications/snapshot',
    {
      medications: [medication],
      logs: [
        {
          id: 'log-metformin-morning',
          medicationId,
          scheduledForISO: morningScheduledForISO,
          status: 'taken',
          actionedAtISO: istScheduledFor(0, '08:04'),
          snoozedUntilISO: null,
          note: null
        },
        {
          id: 'log-metformin-evening',
          medicationId,
          scheduledForISO: eveningScheduledForISO,
          status: 'snoozed',
          actionedAtISO: `${baseDate}T19:58:00.000Z`,
          snoozedUntilISO: `${baseDate}T20:15:00.000Z`,
          note: null
        }
      ]
    },
    { headers: authHeaders(client.token) }
  );
  assert.equal(snapshot.response.status, 200, JSON.stringify(snapshot.body));
  assert.equal(snapshot.body.medicationCount, 1);
  assert.equal(snapshot.body.logCount, 2);

  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    {
      assignedConsultantId: consultant.current.body.accountId
    },
    { headers: authHeaders(client.token) }
  );

  const monitoring = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/medications`,
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(monitoring.response.status, 200);
  assert.equal(monitoring.body.access.readOnly, true);
  assert.equal(monitoring.body.access.assignmentValidation.status, 'assigned_to_requestor');
  assert.equal(monitoring.body.medicationMonitoring.summary.activeMedicationCount, 1);
  assert.equal(monitoring.body.medicationMonitoring.summary.today.scheduled, 2);
  assert.equal(monitoring.body.medicationMonitoring.summary.today.taken, 1);
  assert.equal(monitoring.body.medicationMonitoring.summary.today.snoozed, 1);
  assert.equal(monitoring.body.medicationMonitoring.summary.today.adherencePercent, 50);
  assert.equal(monitoring.body.medicationMonitoring.summary.supplyTrackingAvailable, false);
  assert.equal(monitoring.body.medicationMonitoring.activeMedications[0].name, 'Metformin');
  assert.equal(monitoring.body.medicationMonitoring.activeMedications[0].scheduledTimes.length, 2);
  assert.equal(monitoring.body.medicationMonitoring.todaysDoses.length, 2);
  assert.equal(monitoring.body.medicationMonitoring.todaysDoses[0].status, 'TAKEN');
  assert.equal(monitoring.body.medicationMonitoring.todaysDoses[1].status, 'SNOOZED');
  assert.equal(monitoring.body.medicationMonitoring.dataSource, 'client_medication_tracker');

  const workspace = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/workspace`,
    { headers: authHeaders(consultant.token) }
  );
  assert.equal(workspace.response.status, 200);
  assert.equal(workspace.body.medicationMonitoring.summary.activeMedicationCount, 1);
  assert.ok(workspace.body.syncMetadata.dataSources.includes('medications'));

  const denied = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/medications`,
    { headers: authHeaders(otherConsultant.token) }
  );
  assert.equal(denied.response.status, 404);
  assert.equal(denied.body.error, 'CLIENT_NOT_FOUND');
});

const istScheduledFor = (offsetDays: number, time24h = '00:00') => {
  const date = new Date(Date.now() + 330 * 60 * 1000);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return new Date(`${date.toISOString().slice(0, 10)}T${time24h}:00.000+05:30`).toISOString();
};

const buildDailyMedication = (startOffsetDays: number, id = 'med-exception-metformin') => ({
  id,
  name: 'Metformin',
  type: 'tablet',
  dosage: '500 mg · 1 tablet',
  schedule: {
    frequency: { preset: 'every_day' },
    timeSlots: [
      { id: 'morning', time24h: '00:00', mealRelation: 'after_meal' }
    ],
    duration: {
      startDateISO: istScheduledFor(startOffsetDays),
      endDateISO: null,
      ongoing: true
    }
  },
  reminderSound: 'default',
  status: 'active',
  notificationEnabled: true,
  createdAtISO: istScheduledFor(startOffsetDays),
  updatedAtISO: istScheduledFor(0)
});

const buildDenseDailyMedication = (startOffsetDays: number, id = 'med-exception-dense', slotCount = 100) => ({
  ...buildDailyMedication(startOffsetDays, id),
  schedule: {
    frequency: { preset: 'every_day' },
    timeSlots: Array.from({ length: slotCount }, (_item, index) => {
      const hour = Math.floor(index / 60);
      const minute = index % 60;
      return {
        id: `slot-${index}`,
        time24h: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        mealRelation: 'after_meal'
      };
    }),
    duration: {
      startDateISO: istScheduledFor(startOffsetDays),
      endDateISO: null,
      ongoing: true
    }
  }
});

const buildDenseTakenLogs = (
  medicationId: string,
  dayOffsets: number[],
  takenPerDay: number,
  slotCount = 100
) =>
  dayOffsets.flatMap((offset) =>
    Array.from({ length: takenPerDay }, (_item, index) => {
      const hour = Math.floor(index / 60);
      const minute = index % 60;
      const time24h = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const scheduledForISO = istScheduledFor(offset, time24h);
      return {
        id: `log-${medicationId}-${offset}-${index}`,
        medicationId,
        scheduledForISO,
        status: 'taken',
        actionedAtISO: new Date(Date.parse(scheduledForISO) + 10 * 60 * 1000).toISOString(),
        snoozedUntilISO: null,
        note: null
      };
    }).slice(0, slotCount)
  );

test('consultant medication exception intelligence detects operational adherence signals and preserves lifecycle', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Exception Client',
    email: `exception-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();
  const otherConsultant = await createConsultantSession();
  const medication = buildDailyMedication(-20);
  const logs = [
    ...[-13, -12, -11, -10, -9, -8, -7].map((offset) => ({
      id: `log-taken-prev-${offset}`,
      medicationId: medication.id,
      scheduledForISO: istScheduledFor(offset),
      status: 'taken',
      actionedAtISO: istScheduledFor(offset, '00:04'),
      snoozedUntilISO: null,
      note: null
    })),
    ...[-6, -5, -4, -3].map((offset) => ({
      id: `log-taken-current-${offset}`,
      medicationId: medication.id,
      scheduledForISO: istScheduledFor(offset),
      status: 'taken',
      actionedAtISO: istScheduledFor(offset, '00:04'),
      snoozedUntilISO: null,
      note: null
    })),
    ...[-2, -1, 0].map((offset) => ({
      id: `log-missed-current-${offset}`,
      medicationId: medication.id,
      scheduledForISO: istScheduledFor(offset),
      status: 'missed',
      actionedAtISO: null,
      snoozedUntilISO: null,
      note: null
    }))
  ];

  const emptyClient = await createAuthenticatedSession(server.baseUrl, {
    name: 'No Medication Client',
    email: `no-medication-client-${Date.now()}@example.com`
  });

  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    { assignedConsultantId: consultant.current.body.accountId },
    { headers: authHeaders(emptyClient.token) }
  );

  const emptyFeed = await getJson(server.baseUrl, '/v1/consultants/medication-exceptions', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(emptyFeed.response.status, 200);
  assert.equal(emptyFeed.body.summary.activeExceptionCount, 0);
  assert.deepEqual(emptyFeed.body.exceptions, []);

  const snapshot = await postJson(
    server.baseUrl,
    '/v1/platform/medications/snapshot',
    { medications: [medication], logs },
    { headers: authHeaders(client.token) }
  );
  assert.equal(snapshot.response.status, 200, JSON.stringify(snapshot.body));

  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    { assignedConsultantId: consultant.current.body.accountId },
    { headers: authHeaders(client.token) }
  );

  const feed = await getJson(server.baseUrl, '/v1/consultants/medication-exceptions', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(feed.response.status, 200);
  assert.equal(feed.body.summary.clientsRequiringAttention, 1);
  assert.equal(feed.body.summary.ruleVersion, 'medication-exceptions-v1');
  const exceptionTypes = feed.body.exceptions.map((item: { type: string }) => item.type).sort();
  assert.deepEqual(exceptionTypes, [
    'ADHERENCE_DROP',
    'CONSECUTIVE_UNRESOLVED_DOSES',
    'LOW_7_DAY_ADHERENCE',
    'REPEATED_MISSED_DOSES'
  ]);
  assert.ok(feed.body.exceptions.every((item: { severity: string }) => item.severity === 'ATTENTION'));
  assert.ok(feed.body.exceptions.every((item: { summary: string }) => !/critical|emergency|non-compliant|increase dose/i.test(item.summary)));
  const lowAdherence = feed.body.exceptions.find((item: { type: string }) => item.type === 'LOW_7_DAY_ADHERENCE');
  assert.equal(lowAdherence.evidence.current7DayAdherence, 57);
  assert.equal(lowAdherence.evidence.scheduledDoses, 7);
  assert.equal(lowAdherence.status, 'OPEN');

  const secondFeed = await getJson(server.baseUrl, '/v1/consultants/medication-exceptions', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(secondFeed.response.status, 200);
  assert.equal(secondFeed.body.exceptions.length, 4);
  assert.deepEqual(
    secondFeed.body.exceptions.map((item: { id: string }) => item.id).sort(),
    feed.body.exceptions.map((item: { id: string }) => item.id).sort()
  );

  const clientExceptions = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/medication-exceptions`,
    { headers: authHeaders(consultant.token) }
  );
  assert.equal(clientExceptions.response.status, 200);
  assert.equal(clientExceptions.body.exceptions.length, 4);

  const denied = await getJson(server.baseUrl, '/v1/consultants/medication-exceptions', {
    headers: authHeaders(otherConsultant.token)
  });
  assert.equal(denied.response.status, 200);
  assert.equal(denied.body.summary.activeExceptionCount, 0);

  const directDenied = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${encodeURIComponent(client.current.body.client.fiteatsyClientId)}/medication-exceptions`,
    { headers: authHeaders(otherConsultant.token) }
  );
  assert.equal(directDenied.response.status, 404);
  assert.equal(directDenied.body.error, 'CLIENT_NOT_FOUND');

  const acknowledge = await postJson(
    server.baseUrl,
    `/v1/consultants/medication-exceptions/${encodeURIComponent(lowAdherence.id)}/acknowledge`,
    {},
    { headers: authHeaders(consultant.token) }
  );
  assert.equal(acknowledge.response.status, 200);
  assert.equal(acknowledge.body.exception.status, 'ACKNOWLEDGED');
  assert.equal(typeof acknowledge.body.exception.acknowledgedAt, 'string');

  const detail = await getJson(
    server.baseUrl,
    `/v1/consultants/medication-exceptions/${encodeURIComponent(lowAdherence.id)}`,
    { headers: authHeaders(consultant.token) }
  );
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.exception.status, 'ACKNOWLEDGED');
});

test('medication exception rule thresholds handle non-trigger edge cases', async () => {
  const consultant = await createConsultantSession();

  const oneMissedClient = await createAuthenticatedSession(server.baseUrl, {
    name: 'One Missed Medication Client',
    email: `one-missed-medication-client-${Date.now()}@example.com`
  });
  const oneMissedMedication = buildDailyMedication(0, 'med-one-missed');
  await postJson(
    server.baseUrl,
    '/v1/platform/medications/snapshot',
    {
      medications: [oneMissedMedication],
      logs: [{
        id: 'log-one-missed',
        medicationId: oneMissedMedication.id,
        scheduledForISO: istScheduledFor(0),
        status: 'missed',
        actionedAtISO: null,
        snoozedUntilISO: null,
        note: null
      }]
    },
    { headers: authHeaders(oneMissedClient.token) }
  );
  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    { assignedConsultantId: consultant.current.body.accountId },
    { headers: authHeaders(oneMissedClient.token) }
  );

  const seventyNineClient = await createAuthenticatedSession(server.baseUrl, {
    name: 'Seventy Nine Adherence Client',
    email: `seventy-nine-medication-client-${Date.now()}@example.com`
  });
  const seventyNineMedication = buildDenseDailyMedication(0, 'med-seventy-nine');
  await postJson(
    server.baseUrl,
    '/v1/platform/medications/snapshot',
    {
      medications: [seventyNineMedication],
      logs: buildDenseTakenLogs(seventyNineMedication.id, [0], 79)
    },
    { headers: authHeaders(seventyNineClient.token) }
  );
  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    { assignedConsultantId: consultant.current.body.accountId },
    { headers: authHeaders(seventyNineClient.token) }
  );

  const noDropClient = await createAuthenticatedSession(server.baseUrl, {
    name: 'No Drop Medication Client',
    email: `no-drop-medication-client-${Date.now()}@example.com`
  });
  const noDropMedication = buildDenseDailyMedication(-13, 'med-no-drop');
  await postJson(
    server.baseUrl,
    '/v1/platform/medications/snapshot',
    {
      medications: [noDropMedication],
      logs: [
        ...buildDenseTakenLogs(noDropMedication.id, [-13, -12, -11, -10, -9, -8, -7], 90),
        ...buildDenseTakenLogs(noDropMedication.id, [-6, -5, -4, -3, -2, -1, 0], 76)
      ]
    },
    { headers: authHeaders(noDropClient.token) }
  );
  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    { assignedConsultantId: consultant.current.body.accountId },
    { headers: authHeaders(noDropClient.token) }
  );

  const snoozedTakenClient = await createAuthenticatedSession(server.baseUrl, {
    name: 'Snoozed Taken Medication Client',
    email: `snoozed-taken-medication-client-${Date.now()}@example.com`
  });
  const snoozedTakenMedication = buildDailyMedication(-2, 'med-snoozed-taken');
  await postJson(
    server.baseUrl,
    '/v1/platform/medications/snapshot',
    {
      medications: [snoozedTakenMedication],
      logs: [
        {
          id: 'log-snoozed-taken-snoozed',
          medicationId: snoozedTakenMedication.id,
          scheduledForISO: istScheduledFor(-2),
          status: 'snoozed',
          actionedAtISO: istScheduledFor(-2, '00:04'),
          snoozedUntilISO: istScheduledFor(-2, '00:30'),
          note: null
        },
        {
          id: 'log-snoozed-taken-taken',
          medicationId: snoozedTakenMedication.id,
          scheduledForISO: istScheduledFor(-1),
          status: 'taken',
          actionedAtISO: istScheduledFor(-1, '00:04'),
          snoozedUntilISO: null,
          note: null
        },
        {
          id: 'log-snoozed-taken-missed',
          medicationId: snoozedTakenMedication.id,
          scheduledForISO: istScheduledFor(0),
          status: 'missed',
          actionedAtISO: null,
          snoozedUntilISO: null,
          note: null
        }
      ]
    },
    { headers: authHeaders(snoozedTakenClient.token) }
  );
  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    { assignedConsultantId: consultant.current.body.accountId },
    { headers: authHeaders(snoozedTakenClient.token) }
  );

  const feed = await getJson(server.baseUrl, '/v1/consultants/medication-exceptions', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(feed.response.status, 200);

  const exceptionsByClient = new Map(
    feed.body.exceptions.map((item: { clientId: string; type: string; evidence: Record<string, unknown> }) => [
      item.clientId,
      feed.body.exceptions.filter((candidate: { clientId: string }) => candidate.clientId === item.clientId)
    ])
  );

  const oneMissedExceptions = exceptionsByClient.get(oneMissedClient.current.body.client.fiteatsyClientId) ?? [];
  assert.equal(oneMissedExceptions.some((item: { type: string }) => item.type === 'REPEATED_MISSED_DOSES'), false);

  const seventyNineExceptions = exceptionsByClient.get(seventyNineClient.current.body.client.fiteatsyClientId) ?? [];
  const lowAdherence = seventyNineExceptions.find((item: { type: string }) => item.type === 'LOW_7_DAY_ADHERENCE');
  assert.ok(lowAdherence);
  assert.equal(lowAdherence.evidence.current7DayAdherence, 79);

  const noDropExceptions = exceptionsByClient.get(noDropClient.current.body.client.fiteatsyClientId) ?? [];
  assert.equal(noDropExceptions.some((item: { type: string }) => item.type === 'ADHERENCE_DROP'), false);

  const snoozedTakenExceptions = exceptionsByClient.get(snoozedTakenClient.current.body.client.fiteatsyClientId) ?? [];
  assert.equal(snoozedTakenExceptions.some((item: { type: string }) => item.type === 'CONSECUTIVE_UNRESOLVED_DOSES'), false);
});

test('80 percent medication adherence does not create a low-adherence exception', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Threshold Medication Client',
    email: `threshold-medication-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();
  const medication = buildDailyMedication(-4, 'med-threshold');
  const logs = [-4, -3, -2, -1].map((offset) => ({
    id: `log-threshold-${offset}`,
    medicationId: medication.id,
    scheduledForISO: istScheduledFor(offset),
    status: 'taken',
    actionedAtISO: istScheduledFor(offset, '00:04'),
    snoozedUntilISO: null,
    note: null
  }));

  await postJson(
    server.baseUrl,
    '/v1/platform/medications/snapshot',
    { medications: [medication], logs },
    { headers: authHeaders(client.token) }
  );
  await patchJson(
    server.baseUrl,
    '/v1/platform/health-profile',
    { assignedConsultantId: consultant.current.body.accountId },
    { headers: authHeaders(client.token) }
  );

  const feed = await getJson(server.baseUrl, '/v1/consultants/medication-exceptions', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(feed.response.status, 200);
  assert.equal(feed.body.exceptions.some((item: { type: string }) => item.type === 'LOW_7_DAY_ADHERENCE'), false);
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
  await assignClientToConsultant(client, consultant);

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
    [client.current.body.accountId, await getClientDatabaseId(client)]
  );
  assert.equal(calculationRows.rows[0].total >= 6, true);
});

test('GET /v1/clients/:clientId/workspace exposes canonical contract, assignment scope, and profile provenance', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Canonical Contract Client',
    email: `canonical-contract-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();
  await assignClientToConsultant(client, consultant);

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
  assert.equal(response.body.access.assignmentValidation.status, 'assigned_to_requestor');
  assert.equal(response.body.healthProfile.gender, 'Male');
  assert.equal(response.body.healthProfile.heightCm, 174);
  assert.equal(response.body.healthProfile.currentWeightKg, 76);
  assert.equal(response.body.healthProfile.assignedConsultantId, consultant.current.body.accountId);
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
  await assignClientToConsultant(client, consultant);
  const owner = { accountId: client.current.body.accountId, clientId: await getClientDatabaseId(client) };

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
  assert.ok(response.body.provenance.sources.some((item: { key: string, freshness: string }) => item.key === 'reports' && item.freshness === 'stale'));
});

test('consultant workspace contract syncs wearable summaries and source metadata', async () => {
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'Wearable Sync Client',
    email: `wearable-sync-client-${Date.now()}@example.com`
  });
  const consultant = await createConsultantSession();
  await assignClientToConsultant(client, consultant);
  const owner = { accountId: client.current.body.accountId, clientId: await getClientDatabaseId(client) };

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
  await assignClientToConsultant(client, consultant);
  const owner = { accountId: client.current.body.accountId, clientId: await getClientDatabaseId(client) };

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
