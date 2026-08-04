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
  assert.equal(scores.body.items.some((item: { scoreType: string; scoreStatus: string }) => item.scoreType === 'nutrition' && item.scoreStatus === 'calculated'), true);
  assert.equal(scores.body.items.some((item: { scoreType: string; scoreStatus: string }) => item.scoreType === 'activity' && item.scoreStatus === 'calculated'), true);
  assert.equal(scores.body.items[0].clientId, undefined);
  assert.equal(scores.body.items[0].inputSummary != null, true);

  const summary = await getJson(server.baseUrl, '/v1/intelligence/summary', {
    headers: authHeaders(session.token)
  });
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.status, 'calculated');
});

test('foundation endpoints reject missing auth', async () => {
  const health = await getJson(server.baseUrl, '/v1/health/observations');
  assert.equal(health.response.status, 401);

  const biomarkers = await getJson(server.baseUrl, '/v1/biomarkers');
  assert.equal(biomarkers.response.status, 401);

  const scores = await getJson(server.baseUrl, '/v1/intelligence/scores');
  assert.equal(scores.response.status, 401);
});
