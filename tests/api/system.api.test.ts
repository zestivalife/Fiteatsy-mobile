import test from 'node:test';
import assert from 'node:assert/strict';
import { getJson, postJson } from '../helpers/http.js';
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

test('GET /health returns service heartbeat', async () => {
  const { response, body } = await getJson(server.baseUrl, '/health');
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});

test('POST /v1/checkins stores accepted check-in payload', async () => {
  const { response, body } = await postJson(server.baseUrl, '/v1/checkins', {
    userId: 'checkin-user',
    mood: 4,
  });
  assert.equal(response.status, 201);
  assert.equal(body.status, 'stored');
});

test('GET /v1/employer/dashboard returns aggregated employer metrics', async () => {
  const { response, body } = await getJson(server.baseUrl, '/v1/employer/dashboard');
  assert.equal(response.status, 200);
  assert.equal(Array.isArray(body.stressTrend), true);
  assert.equal(body.note.includes('Aggregated only'), true);
});
