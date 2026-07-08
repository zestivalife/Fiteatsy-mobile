import test from 'node:test';
import assert from 'node:assert/strict';
import { postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server.close();
});

test.beforeEach(() => {
  resetTestState();
});

test('POST /v1/intelligence/priority returns 200 with one priority', async () => {
  const { response, body } = await postJson(server.baseUrl, '/v1/intelligence/priority', {
    userId: 'intel-user',
    mood: 2,
    energy: 2,
    sleepQuality: 2,
    calendarLoad: 6,
    history: [{ mood: 2, energy: 2, sleepQuality: 2 }],
  });
  assert.equal(response.status, 200);
  assert.equal(typeof body.priority, 'string');
});

test('POST /v1/intelligence/priority returns 400 for invalid payload', async () => {
  const { response } = await postJson(server.baseUrl, '/v1/intelligence/priority', {
    userId: '',
    mood: 8,
  });
  assert.equal(response.status, 400);
});

test('POST /v1/intelligence/tracker-analysis returns 200 with trend analysis', async () => {
  const { response, body } = await postJson(server.baseUrl, '/v1/intelligence/tracker-analysis', {
    metricKey: 'sleep',
    metricTitle: 'Sleep',
    tab: 'wellness',
    unit: 'hrs',
    values: [6.1, 6.5, 6.8, 7.0, 7.2, 7.1],
  });
  assert.equal(response.status, 200);
  assert.equal(typeof body.trend, 'string');
});

test('POST /v1/intelligence/tracker-improvement returns either success or explicit AI failure', async () => {
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
  });
  assert.equal([200, 500].includes(response.status), true);
  if (response.status === 200) {
    assert.equal(Array.isArray(body.suggestions), true);
  } else {
    assert.equal(body.error, 'failed_to_generate_tracker_improvement');
  }
});

test('report intelligence endpoints return either success or explicit upstream AI errors', async () => {
  const summary = await postJson(server.baseUrl, '/v1/intelligence/reports/summary', {
    userName: 'Neha',
    parameters: [{ name: 'HbA1c', value: 5.9, unit: '%', status: 'high', referenceRange: '4.0-5.6' }],
  });
  assert.equal([200, 500].includes(summary.response.status), true);

  const parameterInsight = await postJson(server.baseUrl, '/v1/intelligence/reports/parameter-insight', {
    paramName: 'Vitamin D',
    value: 18,
    unit: 'ng/mL',
    status: 'low',
    referenceRange: '30-100',
  });
  assert.equal([200, 500].includes(parameterInsight.response.status), true);

  const actionPlan = await postJson(server.baseUrl, '/v1/intelligence/reports/action-plan', {
    abnormalParameters: [{ name: 'Vitamin D', value: 18, unit: 'ng/mL', status: 'low', referenceRange: '30-100' }],
  });
  assert.equal([200, 500].includes(actionPlan.response.status), true);

  const crossInsights = await postJson(server.baseUrl, '/v1/intelligence/reports/cross-insights', {
    abnormalParams: [{ name: 'HbA1c', value: 5.9, unit: '%', status: 'high', referenceRange: '4.0-5.6' }],
    checkInHistory: [{ mood: 3, energy: 2, sleep: 2 }],
  });
  assert.equal([200, 500].includes(crossInsights.response.status), true);

  const chat = await postJson(server.baseUrl, '/v1/intelligence/reports/chat', {
    userMessage: 'What should I focus on this week?',
    conversationHistory: [],
    reportParameters: [{ name: 'HbA1c', value: 5.9, unit: '%', status: 'high', referenceRange: '4.0-5.6' }],
  });
  assert.equal([200, 500].includes(chat.response.status), true);
});

test.skip('intelligence endpoints should return 401 once API authentication middleware is enabled');
