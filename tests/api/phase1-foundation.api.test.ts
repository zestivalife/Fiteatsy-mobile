import test from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';
import {
  createBiomarkerObservation,
  upsertBiomarker
} from '../../backend/src/modules/biomarkers/biomarkers.repository.js';
import { getClientByAccountUserId } from '../../backend/src/modules/client/client.repository.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server.close();
});

test.beforeEach(async () => {
  await resetTestState();
});

test('POST /v1/health/observations:batch persists client-owned observations and deduplicates sync keys', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const payload = {
    observations: [
      {
        metricType: 'steps',
        value: 8400,
        unit: 'count',
        measuredAtISO: '2026-08-04T06:00:00.000Z',
        sourceProvider: 'health-connect',
        sourceRecordId: 'hc-steps-1',
        syncKey: 'hc-steps-1'
      },
      {
        metricType: 'steps',
        value: 8400,
        unit: 'count',
        measuredAtISO: '2026-08-04T06:00:00.000Z',
        sourceProvider: 'health-connect',
        sourceRecordId: 'hc-steps-1',
        syncKey: 'hc-steps-1'
      }
    ]
  };

  const ingested = await postJson(server.baseUrl, '/v1/health/observations:batch', payload, {
    headers: authHeaders(session.token)
  });
  assert.equal(ingested.response.status, 200);
  assert.equal(ingested.body.accepted, 1);
  assert.equal(ingested.body.duplicate, 1);

  const listed = await getJson(server.baseUrl, '/v1/health/observations?metricType=steps', {
    headers: authHeaders(session.token)
  });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.total, 1);
  assert.equal(listed.body.items[0].metricType, 'steps');
  assert.equal(listed.body.items[0].fiteatsyClientId, session.current.body.client.fiteatsyClientId);
  assert.equal(listed.body.items[0].clientId, undefined);
  assert.equal(listed.body.items[0].userId, undefined);
});

test('health ingestion preserves Health Connect provenance and rejects unsafe observations atomically', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const measuredAtISO = new Date(Date.now() - 60_000).toISOString();
  const valid = await postJson(server.baseUrl, '/v1/health/observations:batch', {
    observations: [{
      metricType: 'weight',
      value: 71.4,
      unit: 'kg',
      measuredAtISO,
      sourceProvider: 'health_connect',
      sourceRecordId: 'hc-weight-record-1',
      syncKey: 'health_connect:Weight:com.example.scale:hc-weight-record-1',
      sourceMetadata: {
        recordType: 'Weight',
        sourceApplication: 'com.example.scale',
        originalValue: 71.4,
        originalUnit: 'kg',
        device: { manufacturer: 'Synthetic QA', model: 'Scale', type: 3 },
        recordingMethod: 2
      }
    }]
  }, { headers: authHeaders(session.token) });
  assert.equal(valid.response.status, 200);
  assert.equal(valid.body.accepted, 1);
  assert.equal(valid.body.items[0].sourceMetadata.sourceApplication, 'com.example.scale');
  assert.equal(valid.body.items[0].sourceMetadata.device.model, 'Scale');

  const syncStatus = await getJson(server.baseUrl, '/v1/health/sync/status', {
    headers: authHeaders(session.token)
  });
  assert.equal(syncStatus.response.status, 200);
  assert.equal(syncStatus.body.lastSyncISO, valid.body.items[0].createdAtISO);
  assert.equal(syncStatus.body.latestMeasurementISO, valid.body.items[0].measuredAtISO);
  assert.equal(syncStatus.body.healthConnect.lastSyncISO, valid.body.items[0].createdAtISO);
  assert.equal(syncStatus.body.healthConnect.latestMeasurementISO, valid.body.items[0].measuredAtISO);

  for (const observation of [
    { metricType: 'unknown_metric', value: 1, unit: 'count', measuredAtISO },
    { metricType: 'steps', value: 1, unit: 'kg', measuredAtISO },
    { metricType: 'steps', value: 0, unit: 'count', measuredAtISO },
    { metricType: 'steps', value: 1, unit: 'count', measuredAtISO: new Date(Date.now() + 60 * 60_000).toISOString() },
    {
      metricType: 'sleep_minutes', value: 30, unit: 'min', measuredAtISO,
      sourceMetadata: { startAtISO: new Date(Date.now() - 60_000).toISOString(), endAtISO: new Date(Date.now() - 120_000).toISOString() }
    }
  ]) {
    const response = await postJson(server.baseUrl, '/v1/health/observations:batch', {
      observations: [{ sourceProvider: 'health_connect', ...observation }]
    }, { headers: authHeaders(session.token) });
    assert.equal(response.response.status, 400);
    assert.equal(response.body.error, 'INVALID_HEALTH_OBSERVATION');
  }
});

test('GET /v1/biomarkers and /v1/biomarkers/history return client-owned biomarker data', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const biomarker = await upsertBiomarker({
    canonicalName: 'HbA1c',
    aliases: ['Glycated Hemoglobin'],
    category: 'Metabolic',
    standardUnit: '%'
  });
  const client = await getClientByAccountUserId(session.current.body.accountId);
  assert.ok(client);
  await createBiomarkerObservation({
    accountId: session.current.body.accountId,
    clientId: client.id
  }, {
    biomarkerId: biomarker.id,
    value: 5.8,
    unit: '%',
    testDate: '2026-08-04',
    confidence: 0.98,
    validationStatus: 'validated'
  });

  const biomarkers = await getJson(server.baseUrl, '/v1/biomarkers', {
    headers: authHeaders(session.token)
  });
  assert.equal(biomarkers.response.status, 200);
  assert.equal(biomarkers.body.total, 1);

  const history = await getJson(server.baseUrl, '/v1/biomarkers/history', {
    headers: authHeaders(session.token)
  });
  assert.equal(history.response.status, 200);
  assert.equal(history.body.items[0].fiteatsyClientId, session.current.body.client.fiteatsyClientId);
  assert.equal(history.body.items[0].clientId, undefined);
  assert.equal(history.body.items[0].userId, undefined);
});

test('GET /v1/intelligence/scores calculates traceable scores from validated client data', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  await postJson(server.baseUrl, '/v1/health/observations:batch', {
    observations: [
      {
        metricType: 'steps',
        value: 9200,
        unit: 'count',
        measuredAtISO: '2026-08-04T06:00:00.000Z',
        sourceProvider: 'health-connect',
        sourceRecordId: 'hc-score-steps-1',
        syncKey: 'hc-score-steps-1'
      },
      {
        metricType: 'sleep_minutes',
        value: 430,
        unit: 'min',
        measuredAtISO: '2026-08-04T06:00:00.000Z',
        sourceProvider: 'health-connect',
        sourceRecordId: 'hc-score-sleep-1',
        syncKey: 'hc-score-sleep-1'
      }
    ]
  }, {
    headers: authHeaders(session.token)
  });
  const biomarker = await upsertBiomarker({
    canonicalName: 'Vitamin D',
    aliases: ['25-OH Vitamin D'],
    category: 'Nutrition',
    standardUnit: 'ng/mL'
  });
  const client = await getClientByAccountUserId(session.current.body.accountId);
  assert.ok(client);
  await createBiomarkerObservation({
    accountId: session.current.body.accountId,
    clientId: client.id
  }, {
    biomarkerId: biomarker.id,
    value: 34,
    unit: 'ng/mL',
    testDate: '2026-08-04',
    confidence: 0.9,
    validationStatus: 'validated',
    referenceRange: '30-100'
  });

  const scores = await getJson(server.baseUrl, '/v1/intelligence/scores', {
    headers: authHeaders(session.token)
  });
  assert.equal(scores.response.status, 200);
  assert.equal(scores.body.items.some((item: { scoreType: string; scoreStatus: string }) => item.scoreType === 'nourishment' && item.scoreStatus === 'calculated'), true);
  assert.equal(scores.body.items.some((item: { scoreType: string; scoreStatus: string }) => item.scoreType === 'active_performance' && item.scoreStatus === 'calculated'), true);
  assert.equal(scores.body.items.some((item: { scoreType: string; scoreStatus: string }) => item.scoreType === 'energy_balance' && item.scoreStatus === 'calculated'), true);
  assert.equal(scores.body.items.some((item: { scoreType: string; scoreStatus: string }) => item.scoreType === 'stress_resilience' && item.scoreStatus === 'calculated'), true);
  assert.equal(scores.body.items.some((item: { scoreType: string; scoreStatus: string }) => item.scoreType === 'physical_wellness_index' && item.scoreStatus === 'calculated'), true);
  assert.equal(scores.body.items.some((item: { scoreType: string; scoreStatus: string }) => item.scoreType === 'nutrition' && item.scoreStatus === 'calculated'), true);
  assert.equal(scores.body.items[0].clientId, undefined);
  assert.equal(scores.body.items[0].inputSummary != null, true);

  const summary = await getJson(server.baseUrl, '/v1/intelligence/summary', {
    headers: authHeaders(session.token)
  });
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.status, 'calculated');
  assert.equal(typeof summary.body.energyBalanceScore, 'number');
  assert.equal(typeof summary.body.stressResilienceScore, 'number');
  assert.equal(typeof summary.body.physicalWellnessIndex, 'number');
  assert.equal(typeof summary.body.sleepScore, 'number');
  assert.equal(typeof summary.body.calmScore, 'number');
});

test('GET /v1/health/sync/status reports durable sync state without internal ownership ids', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const empty = await getJson(server.baseUrl, '/v1/health/sync/status', {
    headers: authHeaders(session.token)
  });
  assert.equal(empty.response.status, 200);
  assert.equal(empty.body.overallStatus, 'NOT_CONNECTED');
  assert.equal(empty.body.recordsSynced, 0);

  await postJson(server.baseUrl, '/v1/health/observations:batch', {
    observations: [
      {
        metricType: 'steps',
        value: 7400,
        unit: 'count',
        measuredAtISO: '2026-08-05T06:00:00.000Z',
        sourceProvider: 'health_connect',
        sourceRecordId: 'hc-status-steps-1',
        syncKey: 'hc-status-steps-1'
      }
    ]
  }, {
    headers: authHeaders(session.token)
  });

  const status = await getJson(server.baseUrl, '/v1/health/sync/status', {
    headers: authHeaders(session.token)
  });
  assert.equal(status.response.status, 200);
  assert.equal(status.body.overallStatus, 'CONNECTED');
  assert.equal(status.body.healthConnect.status, 'CONNECTED');
  assert.equal(status.body.recordsSynced, 1);
  assert.equal(status.body.clientId, undefined);
  assert.equal(status.body.userId, undefined);
});

test('foundation endpoints reject missing auth', async () => {
  const health = await getJson(server.baseUrl, '/v1/health/observations');
  assert.equal(health.response.status, 401);

  const biomarkers = await getJson(server.baseUrl, '/v1/biomarkers');
  assert.equal(biomarkers.response.status, 401);

  const scores = await getJson(server.baseUrl, '/v1/intelligence/scores');
  assert.equal(scores.response.status, 401);
});


test('stress intelligence exposes randomized PSS-10 questions and computes reverse-scored results', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const questions = await getJson(server.baseUrl, '/v1/intelligence/stress/questions?count=4', {
    headers: authHeaders(session.token)
  });
  assert.equal(questions.response.status, 200);
  assert.equal(questions.body.scale, 'PSS-10');
  assert.equal(questions.body.items.length, 4);

  const answers = questions.body.items.map((item: { id: string }, index: number) => ({
    questionId: item.id,
    score: index % 2 === 0 ? 3 : 1
  }));
  const assessment = await postJson(server.baseUrl, '/v1/intelligence/stress/assessments', { answers }, {
    headers: authHeaders(session.token)
  });
  assert.equal(assessment.response.status, 200);
  assert.equal(assessment.body.scale, 'PSS-10');
  assert.equal(typeof assessment.body.totalScore, 'number');
  assert.equal(typeof assessment.body.resilienceScore, 'number');
  assert.equal(['low', 'moderate', 'high'].includes(assessment.body.stressBand), true);
});
