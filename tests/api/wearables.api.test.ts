import test from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

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

test('wearables endpoints support app discovery, connect, ingest, live sync, and legacy sync', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const apps = await getJson(server.baseUrl, '/v1/wearables/health-apps?platform=ios');
  assert.equal(apps.response.status, 200);

  const connect = await postJson(server.baseUrl, '/v1/wearables/connect-app', {
    appId: 'apple-health',
    platform: 'ios',
    userId: 'spoofed-user',
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(connect.response.status, 200);

  const connections = await getJson(server.baseUrl, '/v1/wearables/connections/wear-user', {
    headers: authHeaders(session.token)
  });
  assert.equal(connections.response.status, 200);
  assert.equal(connections.body.connections.length, 1);
  assert.equal(connections.body.userId, session.current.body.accountId);

  const ingest = await postJson(server.baseUrl, '/v1/wearables/records/ingest', {
    appId: 'apple-health',
    platform: 'ios',
    records: [
      { type: 'sleep_minutes', value: 420, recordedAtISO: '2026-07-02T03:00:00.000Z' },
      { type: 'resting_heart_rate', value: 67, recordedAtISO: '2026-07-02T03:00:00.000Z' },
    ],
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(ingest.response.status, 200);

  const live = await postJson(server.baseUrl, '/v1/wearables/sync/live', {
    appId: 'apple-health',
    platform: 'ios',
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(live.response.status, 200);

  const legacy = await postJson(server.baseUrl, '/v1/wearables/sync', {
    deviceId: 'device-1',
    brand: 'Apple',
    model: 'Watch',
  });
  assert.equal(legacy.response.status, 410);
  assert.equal(legacy.body.error, 'LEGACY_SYNC_REMOVED');
});

test('wearables endpoints return 400 and 404 on invalid or missing connection payloads', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const invalidConnect = await postJson(server.baseUrl, '/v1/wearables/connect-app', {
    appId: 'unknown',
    platform: 'ios',
    userId: 'wear-user',
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(invalidConnect.response.status, 400);

  const missingLive = await postJson(server.baseUrl, '/v1/wearables/sync/live', {
    appId: 'apple-health'
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(missingLive.response.status, 404);

  const invalidIngest = await postJson(server.baseUrl, '/v1/wearables/records/ingest', {
    appId: 'apple-health',
    platform: 'ios',
    records: [],
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(invalidIngest.response.status, 400);
});

test('live sync does not synthesize health values when a connection has no ingested records', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  await postJson(server.baseUrl, '/v1/wearables/connect-app', {
    appId: 'apple-health',
    platform: 'ios'
  }, {
    headers: authHeaders(session.token)
  });

  const live = await postJson(server.baseUrl, '/v1/wearables/sync/live', {
    appId: 'apple-health',
    platform: 'ios'
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(live.response.status, 409);
  assert.equal(live.body.error, 'INSUFFICIENT_DATA');
});

test('wearables routes reject missing tokens and deny cross-account connection reads', async () => {
  const missing = await postJson(server.baseUrl, '/v1/wearables/connect-app', {
    appId: 'apple-health',
    platform: 'ios'
  });
  assert.equal(missing.response.status, 401);

  const owner = await createAuthenticatedSession(server.baseUrl, {
    email: 'wear-owner@example.com',
    mobileNumber: '+919876543250'
  });
  const intruder = await createAuthenticatedSession(server.baseUrl, {
    email: 'wear-intruder@example.com',
    mobileNumber: '+919876543251'
  });
  await postJson(server.baseUrl, '/v1/wearables/connect-app', {
    appId: 'apple-health',
    platform: 'ios'
  }, {
    headers: authHeaders(owner.token)
  });

  const stolenConnections = await getJson(server.baseUrl, `/v1/wearables/connections/${owner.current.body.accountId}`, {
    headers: authHeaders(intruder.token)
  });
  assert.equal(stolenConnections.response.status, 200);
  assert.equal(stolenConnections.body.connections.length, 0);
});
