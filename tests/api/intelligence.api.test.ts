import test from 'node:test';
import assert from 'node:assert/strict';
import { postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';

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

test('POST /v1/intelligence/priority returns 200 with one priority', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const { response, body } = await postJson(server.baseUrl, '/v1/intelligence/priority', {
    userId: 'intel-user',
    mood: 2,
    energy: 2,
    sleepQuality: 2,
    calendarLoad: 6,
    history: [{ mood: 2, energy: 2, sleepQuality: 2 }],
  }, { headers: authHeaders(session.token) });
  assert.equal(response.status, 200);
  assert.equal(typeof body.priority, 'string');
});

test('POST /v1/intelligence/priority returns 400 for invalid payload', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const { response } = await postJson(server.baseUrl, '/v1/intelligence/priority', {
    userId: '',
    mood: 8,
  }, { headers: authHeaders(session.token) });
  assert.equal(response.status, 400);
});

test('POST /v1/intelligence/tracker-analysis returns 200 with trend analysis', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const { response, body } = await postJson(server.baseUrl, '/v1/intelligence/tracker-analysis', {
    metricKey: 'sleep',
    metricTitle: 'Sleep',
    tab: 'wellness',
    unit: 'hrs',
    values: [6.1, 6.5, 6.8, 7.0, 7.2, 7.1],
  }, { headers: authHeaders(session.token) });
  assert.equal(response.status, 200);
  assert.equal(typeof body.trend, 'string');
});

test('POST /v1/intelligence/tracker-improvement returns either success or explicit AI failure', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const { response, body } = await postJson(server.baseUrl, '/v1/intelligence/tracker-improvement', {
    tab: 'health',
    rangeMode: '7D',
    dayLabel: 'Today',
    compareYesterday: true,
    metrics: [
      {
        metricKey: 'steps',
        metricTitle: 'Steps',
        unit: 'count',
        values: [4000, 5200, 6100, 6800, 7100],
      },
    ],
  }, { headers: authHeaders(session.token) });
  assert.equal([200, 500].includes(response.status), true);
  if (response.status === 200) {
    assert.equal(Array.isArray(body.suggestions), true);
  } else {
    assert.equal(body.error, 'failed_to_generate_tracker_improvement');
  }
});

test('report intelligence endpoints reject unauthenticated requests before report access', async () => {
  const summary = await postJson(server.baseUrl, '/v1/intelligence/reports/summary', {
    userName: 'Neha',
    parameters: [{ name: 'HbA1c', value: 5.9, unit: '%', status: 'high', referenceRange: '4.0-5.6' }],
  });
  assert.equal(summary.response.status, 401);

  const parameterInsight = await postJson(server.baseUrl, '/v1/intelligence/reports/parameter-insight', {
    paramName: 'Vitamin D',
    value: 18,
    unit: 'ng/mL',
    status: 'low',
    referenceRange: '30-100',
  });
  assert.equal(parameterInsight.response.status, 401);

  const actionPlan = await postJson(server.baseUrl, '/v1/intelligence/reports/action-plan', {
    abnormalParameters: [{ name: 'Vitamin D', value: 18, unit: 'ng/mL', status: 'low', referenceRange: '30-100' }],
  });
  assert.equal(actionPlan.response.status, 401);

  const crossInsights = await postJson(server.baseUrl, '/v1/intelligence/reports/cross-insights', {
    abnormalParams: [{ name: 'HbA1c', value: 5.9, unit: '%', status: 'high', referenceRange: '4.0-5.6' }],
    checkInHistory: [{ mood: 3, energy: 2, sleep: 2 }],
  });
  assert.equal(crossInsights.response.status, 401);

  const chat = await postJson(server.baseUrl, '/v1/intelligence/reports/chat', {
    userMessage: 'What should I focus on this week?',
    conversationHistory: [],
    reportParameters: [{ name: 'HbA1c', value: 5.9, unit: '%', status: 'high', referenceRange: '4.0-5.6' }],
  });
  assert.equal(chat.response.status, 401);
});

test('intelligence endpoints reject missing authentication', async () => {
  const response = await postJson(server.baseUrl, '/v1/intelligence/priority', {
    userId: 'intel-user',
    mood: 2,
    energy: 2,
    sleepQuality: 2,
    calendarLoad: 6,
    history: [{ mood: 2, energy: 2, sleepQuality: 2 }],
  });
  assert.equal(response.response.status, 401);
  assert.equal(response.body.error, 'AUTH_REQUIRED');
});
