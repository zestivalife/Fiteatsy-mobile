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

test('POST /v1/nudges/dispatch-check returns allowed during business hours', async () => {
  const { response, body } = await postJson(server.baseUrl, '/v1/nudges/dispatch-check', {
    now: '2026-07-02T05:00:00.000Z',
    inMeeting: false,
    nudgesSentToday: 1,
  });
  assert.equal(response.status, 200);
  assert.equal(typeof body.allowed, 'boolean');
});

test('POST /v1/nudges/dispatch-check denies after limit or during meetings', async () => {
  const limited = await postJson(server.baseUrl, '/v1/nudges/dispatch-check', {
    now: '2026-07-02T10:00:00.000Z',
    inMeeting: false,
    nudgesSentToday: 3,
  });
  assert.equal(limited.body.allowed, false);

  const meeting = await postJson(server.baseUrl, '/v1/nudges/dispatch-check', {
    now: '2026-07-02T10:00:00.000Z',
    inMeeting: true,
    nudgesSentToday: 0,
  });
  assert.equal(meeting.body.allowed, false);
});
