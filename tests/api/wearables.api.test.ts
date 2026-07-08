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

test('wearables endpoints support app discovery, connect, ingest, live sync, and legacy sync', async () => {
  const apps = await getJson(server.baseUrl, '/v1/wearables/health-apps?platform=ios');
  assert.equal(apps.response.status, 200);

  const connect = await postJson(server.baseUrl, '/v1/wearables/connect-app', {
    appId: 'apple-health',
    platform: 'ios',
    userId: 'wear-user',
  });
  assert.equal(connect.response.status, 200);

  const connections = await getJson(server.baseUrl, '/v1/wearables/connections/wear-user');
  assert.equal(connections.response.status, 200);
  assert.equal(connections.body.connections.length, 1);

  const ingest = await postJson(server.baseUrl, '/v1/wearables/records/ingest', {
    userId: 'wear-user',
    appId: 'apple-health',
    platform: 'ios',
    records: [
      { type: 'sleep_minutes', value: 420, recordedAtISO: '2026-07-02T03:00:00.000Z' },
      { type: 'resting_heart_rate', value: 67, recordedAtISO: '2026-07-02T03:00:00.000Z' },
    ],
  });
  assert.equal(ingest.response.status, 200);

  const live = await postJson(server.baseUrl, '/v1/wearables/sync/live', {
    userId: 'wear-user',
    appId: 'apple-health',
    platform: 'ios',
  });
  assert.equal(live.response.status, 200);

  const legacy = await postJson(server.baseUrl, '/v1/wearables/sync', {
    deviceId: 'device-1',
    brand: 'Apple',
    model: 'Watch',
  });
  assert.equal(legacy.response.status, 200);
});

test('wearables endpoints return 400 and 404 on invalid or missing connection payloads', async () => {
  const invalidConnect = await postJson(server.baseUrl, '/v1/wearables/connect-app', {
    appId: 'unknown',
    platform: 'ios',
    userId: 'wear-user',
  });
  assert.equal(invalidConnect.response.status, 400);

  const missingLive = await postJson(server.baseUrl, '/v1/wearables/sync/live', {
    userId: 'missing-user',
  });
  assert.equal(missingLive.response.status, 404);

  const invalidIngest = await postJson(server.baseUrl, '/v1/wearables/records/ingest', {
    userId: '',
    appId: 'apple-health',
    platform: 'ios',
    records: [],
  });
  assert.equal(invalidIngest.response.status, 400);
});

test.skip('wearables endpoints should return 401 and 403 once connected-device authorization is enforced');
