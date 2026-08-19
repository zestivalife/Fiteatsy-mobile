import test from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';
import { pss10Items } from '../../backend/src/modules/assessments/assessment-definitions.js';

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

const putJson = async (baseUrl: string, path: string, body: unknown, init?: RequestInit) =>
  getJson(baseUrl, path, {
    ...init,
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    },
    body: JSON.stringify(body)
  });

const responsesFor = (value: 0 | 1 | 2 | 3 | 4) =>
  pss10Items.map((item) => ({ itemId: item.id, selectedValue: value }));

const responsesForNormalizedScore = (score: number) => {
  let remaining = score;
  return pss10Items.map((item) => {
    const normalized = Math.min(4, remaining);
    remaining -= normalized;
    return {
      itemId: item.id,
      selectedValue: (item.reverseScored ? 4 - normalized : normalized) as 0 | 1 | 2 | 3 | 4
    };
  });
};

test('PSS-10 assessment definition exposes the approved product content', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const definition = await getJson(server.baseUrl, '/v1/assessments/PSS10/definition', {
    headers: authHeaders(session.token)
  });

  assert.equal(definition.response.status, 200);
  assert.equal(definition.body.assessmentType, 'PSS10');
  assert.equal(definition.body.itemCount, 10);
  assert.equal(definition.body.instrumentVersion, 'pss10-fiteatsy-v2');
  assert.equal(definition.body.recallPeriod, 'the last 30 days');
  assert.equal(definition.body.licensedItemWordingPresent, true);
  assert.deepEqual(definition.body.items.map((item: { label: string }) => item.label), [
    'Upset by unexpected events.',
    'Unable to control important things.',
    'Nervous and stressed.',
    'Confident in handling personal problems.',
    'Things were going your way.',
    'Unable to cope with tasks.',
    'Able to control irritations.',
    'On top of things.',
    'Angered by uncontrollable events.',
    'Difficulties were piling up.'
  ]);
  assert.deepEqual(definition.body.responseOptions.map((option: { label: string }) => option.label), [
    'Never', 'Almost never', 'Sometimes', 'Fairly often', 'Very often'
  ]);
  assert.equal(definition.body.items[3].id, 'PSS10_Q04');
  assert.equal(definition.body.items[3].reverseScored, true);
  assert.equal(definition.body.responseOptions.length, 5);
});

test('PSS-10 completion requires all responses and persists score history', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const started = await postJson(server.baseUrl, '/v1/assessments/PSS10/sessions', {}, {
    headers: authHeaders(session.token)
  });
  assert.equal(started.response.status, 201);

  const partial = await putJson(
    server.baseUrl,
    `/v1/assessments/sessions/${started.body.session.id}/responses`,
    { responses: responsesFor(2).slice(0, 9) },
    { headers: authHeaders(session.token) }
  );
  assert.equal(partial.response.status, 200);

  const incomplete = await postJson(server.baseUrl, `/v1/assessments/sessions/${started.body.session.id}/complete`, {}, {
    headers: authHeaders(session.token)
  });
  assert.equal(incomplete.response.status, 409);

  await putJson(
    server.baseUrl,
    `/v1/assessments/sessions/${started.body.session.id}/responses`,
    { responses: responsesFor(2) },
    { headers: authHeaders(session.token) }
  );
  const completed = await postJson(server.baseUrl, `/v1/assessments/sessions/${started.body.session.id}/complete`, {}, {
    headers: authHeaders(session.token)
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.result.rawScore, 20);
  assert.equal(completed.body.result.maxScore, 40);
  assert.equal(completed.body.result.instrumentVersion, 'pss10-fiteatsy-v2');
  assert.equal(completed.body.result.scoringVersion, 'pss10-scoring-v1');
  assert.equal(completed.body.result.interpretationVersion, 'pss10-interpretation-v1');
  assert.equal(completed.body.result.interpretationKey, 'MODERATE');
  assert.equal(completed.body.result.interpretationLabel, 'Moderate stress');

  const second = await postJson(server.baseUrl, '/v1/assessments/PSS10/sessions', {}, {
    headers: authHeaders(session.token)
  });
  await putJson(
    server.baseUrl,
    `/v1/assessments/sessions/${second.body.session.id}/responses`,
    { responses: responsesFor(0) },
    { headers: authHeaders(session.token) }
  );
  const secondCompleted = await postJson(server.baseUrl, `/v1/assessments/sessions/${second.body.session.id}/complete`, {}, {
    headers: authHeaders(session.token)
  });
  assert.equal(secondCompleted.response.status, 200);
  assert.equal(secondCompleted.body.result.rawScore, 16);
  assert.equal(secondCompleted.body.previousResult.rawScore, 20);

  const history = await getJson(server.baseUrl, '/v1/assessments/PSS10/results', {
    headers: authHeaders(session.token)
  });
  assert.equal(history.response.status, 200);
  assert.equal(history.body.total, 2);
  assert.deepEqual(history.body.items.map((item: { rawScore: number }) => item.rawScore), [16, 20]);
});

test('PSS-10 API enforces the five-value response scale and persists response parity', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const started = await postJson(server.baseUrl, '/v1/assessments/PSS10/sessions', {}, {
    headers: authHeaders(session.token)
  });
  const sessionId = started.body.session.id;

  for (const invalid of [
    { itemId: 'PSS10_Q01', selectedValue: -1 },
    { itemId: 'PSS10_Q01', selectedValue: 5 },
    { itemId: 'PSS10_Q01', selectedValue: '2' },
    { itemId: 'PSS10_Q01' }
  ]) {
    const rejected = await putJson(server.baseUrl, `/v1/assessments/sessions/${sessionId}/responses`, { responses: [invalid] }, {
      headers: authHeaders(session.token)
    });
    assert.equal(rejected.response.status, 400);
  }

  const expectedResponses = responsesFor(2);
  const saved = await putJson(server.baseUrl, `/v1/assessments/sessions/${sessionId}/responses`, { responses: expectedResponses }, {
    headers: authHeaders(session.token)
  });
  assert.deepEqual(saved.body.session.responses, expectedResponses);

  const fetched = await getJson(server.baseUrl, `/v1/assessments/sessions/${sessionId}`, {
    headers: authHeaders(session.token)
  });
  assert.deepEqual(fetched.body.session.responses, expectedResponses);

  const completed = await postJson(server.baseUrl, `/v1/assessments/sessions/${sessionId}/complete`, {}, {
    headers: authHeaders(session.token)
  });
  assert.equal(completed.response.status, 200);
  const latest = await getJson(server.baseUrl, '/v1/assessments/PSS10/results/latest', {
    headers: authHeaders(session.token)
  });
  assert.deepEqual(latest.body.result, completed.body.result);
});

test('PSS-10 API returns exact interpretation boundary labels', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const expected = [
    [0, 'Low stress'],
    [13, 'Low stress'],
    [14, 'Moderate stress'],
    [26, 'Moderate stress'],
    [27, 'High perceived stress'],
    [40, 'High perceived stress']
  ] as const;

  for (const [score, label] of expected) {
    const started = await postJson(server.baseUrl, '/v1/assessments/PSS10/sessions', {}, {
      headers: authHeaders(session.token)
    });
    await putJson(server.baseUrl, `/v1/assessments/sessions/${started.body.session.id}/responses`, {
      responses: responsesForNormalizedScore(score)
    }, { headers: authHeaders(session.token) });
    const completed = await postJson(server.baseUrl, `/v1/assessments/sessions/${started.body.session.id}/complete`, {}, {
      headers: authHeaders(session.token)
    });
    assert.equal(completed.response.status, 200);
    assert.equal(completed.body.result.rawScore, score);
    assert.equal(completed.body.result.interpretationLabel, label);
  }
});

test('assessment results are scoped to the authenticated owner', async () => {
  const first = await createAuthenticatedSession(server.baseUrl);
  const second = await createAuthenticatedSession(server.baseUrl);
  const started = await postJson(server.baseUrl, '/v1/assessments/PSS10/sessions', {}, {
    headers: authHeaders(first.token)
  });
  await putJson(
    server.baseUrl,
    `/v1/assessments/sessions/${started.body.session.id}/responses`,
    { responses: responsesFor(4) },
    { headers: authHeaders(first.token) }
  );
  const completed = await postJson(server.baseUrl, `/v1/assessments/sessions/${started.body.session.id}/complete`, {}, {
    headers: authHeaders(first.token)
  });
  assert.equal(completed.response.status, 200);

  const denied = await getJson(server.baseUrl, `/v1/assessments/results/${completed.body.result.id}`, {
    headers: authHeaders(second.token)
  });
  assert.equal(denied.response.status, 404);

  const deniedSession = await getJson(server.baseUrl, `/v1/assessments/sessions/${started.body.session.id}`, {
    headers: authHeaders(second.token)
  });
  assert.equal(deniedSession.response.status, 404);
});

test('latest PSS-10 result excludes draft sessions', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const draft = await postJson(server.baseUrl, '/v1/assessments/PSS10/sessions', {}, {
    headers: authHeaders(session.token)
  });
  assert.equal(draft.response.status, 201);

  await putJson(
    server.baseUrl,
    `/v1/assessments/sessions/${draft.body.session.id}/responses`,
    { responses: responsesFor(4).slice(0, 2) },
    { headers: authHeaders(session.token) }
  );

  const latestBeforeCompletion = await getJson(server.baseUrl, '/v1/assessments/PSS10/results/latest', {
    headers: authHeaders(session.token)
  });
  assert.equal(latestBeforeCompletion.response.status, 200);
  assert.equal(latestBeforeCompletion.body.result, null);
  assert.equal(latestBeforeCompletion.body.previousResult, null);

  const resumedDraft = await getJson(server.baseUrl, '/v1/assessments/PSS10/draft', {
    headers: authHeaders(session.token)
  });
  assert.equal(resumedDraft.response.status, 200);
  assert.equal(resumedDraft.body.session.id, draft.body.session.id);
  assert.equal(resumedDraft.body.session.responses.length, 2);
});
