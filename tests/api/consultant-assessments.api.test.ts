import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../backend/src/db/pool.js';
import { pss10Items } from '../../backend/src/modules/assessments/assessment-definitions.js';
import { createOrUpdateHealthProfile } from '../../backend/src/modules/platform/platform.store.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => { server = await startTestServer(); });
test.after(async () => { await server?.close(); });
test.beforeEach(async () => { await resetTestState(); });

const putJson = async (baseUrl: string, path: string, body: unknown, token: string) =>
  getJson(baseUrl, path, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

const completePss = async (token: string) => {
  const started = await postJson(server.baseUrl, '/v1/assessments/PSS10/sessions', {}, { headers: authHeaders(token) });
  await putJson(server.baseUrl, `/v1/assessments/sessions/${started.body.session.id}/responses`, {
    responses: pss10Items.map((item) => ({ itemId: item.id, selectedValue: 2 }))
  }, token);
  return postJson(server.baseUrl, `/v1/assessments/sessions/${started.body.session.id}/complete`, {}, { headers: authHeaders(token) });
};

const assignConsultant = async (client: Awaited<ReturnType<typeof createAuthenticatedSession>>, consultant: Awaited<ReturnType<typeof createAuthenticatedSession>>) => {
  const mapping = await pool.query('select id from fiteatsy_clients where account_user_id = $1 limit 1', [client.current.body.accountId]);
  await createOrUpdateHealthProfile(
    { accountId: client.current.body.accountId, clientId: String(mapping.rows[0].id) },
    { assignedConsultantId: consultant.current.body.accountId }
  );
};

const promoteConsultant = async (consultant: Awaited<ReturnType<typeof createAuthenticatedSession>>) => {
  await pool.query('update users set role = $2 where id = $1', [consultant.current.body.accountId, 'consultant']);
};

test('assigned consultant receives latest, previous, change, and completed history only', async () => {
  const consultant = await createAuthenticatedSession(server.baseUrl, { name: 'Assigned Consultant' });
  const client = await createAuthenticatedSession(server.baseUrl, { name: 'Stress Client' });
  await promoteConsultant(consultant);
  await assignConsultant(client, consultant);
  await completePss(client.token);
  const draft = await postJson(server.baseUrl, '/v1/assessments/PSS10/sessions', {}, { headers: authHeaders(client.token) });

  const summary = await getJson(server.baseUrl, `/v1/consultants/clients/${client.current.body.client.fiteatsyClientId}/assessments/PSS10/summary`, { headers: authHeaders(consultant.token) });
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.assessment.latest.rawScore, 20);
  assert.equal(summary.body.assessment.previous, null);
  assert.equal(summary.body.assessment.change, null);
  assert.equal(summary.body.assessment.history.length, 1);

  const history = await getJson(server.baseUrl, `/v1/consultants/clients/${client.current.body.client.fiteatsyClientId}/assessments/PSS10/history`, { headers: authHeaders(consultant.token) });
  assert.equal(history.response.status, 200);
  assert.equal(history.body.history.length, 1);
  assert.equal(history.body.history[0].instrumentVersion, 'pss10-fiteatsy-v2');
  assert.equal(draft.response.status, 201);
  assert.notEqual(summary.body.assessment.history[0].id, draft.body.session.id);
});

test('unassigned consultant cannot access summary, history, or direct result IDs', async () => {
  const assignedConsultant = await createAuthenticatedSession(server.baseUrl, { name: 'Assigned Consultant' });
  const unassignedConsultant = await createAuthenticatedSession(server.baseUrl, { name: 'Unassigned Consultant' });
  const client = await createAuthenticatedSession(server.baseUrl, { name: 'Private Stress Client' });
  await promoteConsultant(assignedConsultant);
  await promoteConsultant(unassignedConsultant);
  await assignConsultant(client, assignedConsultant);
  const completed = await completePss(client.token);
  const clientId = client.current.body.client.fiteatsyClientId;
  const summary = await getJson(server.baseUrl, `/v1/consultants/clients/${clientId}/assessments/PSS10/summary`, { headers: authHeaders(unassignedConsultant.token) });
  const history = await getJson(server.baseUrl, `/v1/consultants/clients/${clientId}/assessments/PSS10/history`, { headers: authHeaders(unassignedConsultant.token) });
  const direct = await getJson(server.baseUrl, `/v1/consultants/clients/${clientId}/assessments/results/${completed.body.result.id}`, { headers: authHeaders(unassignedConsultant.token) });
  assert.equal(summary.response.status, 403);
  assert.equal(history.response.status, 403);
  assert.equal(direct.response.status, 403);
});

test('latest and previous consultant values preserve score change and historical versions', async () => {
  const consultant = await createAuthenticatedSession(server.baseUrl, { name: 'Trend Consultant' });
  const client = await createAuthenticatedSession(server.baseUrl, { name: 'Trend Client' });
  await promoteConsultant(consultant);
  await assignConsultant(client, consultant);
  await completePss(client.token);
  await completePss(client.token);
  const summary = await getJson(server.baseUrl, `/v1/consultants/clients/${client.current.body.client.fiteatsyClientId}/assessments/PSS10/summary`, { headers: authHeaders(consultant.token) });
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.assessment.latest.rawScore, 20);
  assert.equal(summary.body.assessment.previous.rawScore, 20);
  assert.equal(summary.body.assessment.change, 0);
  assert.equal(summary.body.assessment.history.every((item: { scoringVersion: string; interpretationVersion: string }) => item.scoringVersion === 'pss10-scoring-v1' && item.interpretationVersion === 'pss10-interpretation-v1'), true);
});
