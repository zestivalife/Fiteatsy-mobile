import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../backend/src/server.js';
import { getJson, postJson } from '../helpers/http.js';
import { startAppServer } from '../helpers/appServer.js';

const withEnv = async (
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>
) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('GET /health returns service heartbeat', async () => {
  const server = await startAppServer(createApp());
  const { response, body } = await getJson(server.baseUrl, '/health');
  try {
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, 'fiteatsy-backend');
  } finally {
    await server.close();
  }
});

test('GET /ready returns 200 when readiness check passes', async () => {
  const server = await startAppServer(createApp({
    readinessCheck: async () => true
  }));
  const { response, body } = await getJson(server.baseUrl, '/ready');
  try {
    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      service: 'fiteatsy-backend',
      checks: {
        database: 'ready'
      }
    });
  } finally {
    await server.close();
  }
});

test('GET /ready returns 503 when readiness check fails', async () => {
  const server = await startAppServer(createApp({
    readinessCheck: async () => false
  }));
  const { response, body, text } = await getJson(server.baseUrl, '/ready');
  try {
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.service, 'fiteatsy-backend');
    assert.equal(body.checks.database, 'not_ready');
    assert.equal(text.includes('postgres://'), false);
  } finally {
    await server.close();
  }
});

test('GET /v1/version returns runtime metadata', async () => {
  await withEnv(
    {
      NODE_ENV: 'staging',
      GIT_COMMIT: '94791be461c39ba41c6791955bdbf6d59bfc24a6'
    },
    async () => {
      const server = await startAppServer(createApp());
      const { response, body } = await getJson(server.baseUrl, '/v1/version');
      try {
        assert.equal(response.status, 200);
        assert.equal(body.service, 'fiteatsy-backend');
        assert.equal(body.version, '1.0.0');
        assert.equal(body.environment, 'staging');
        assert.equal(body.git_commit, '94791be461c39ba41c6791955bdbf6d59bfc24a6');
      } finally {
        await server.close();
      }
    }
  );
});

test('POST /v1/checkins stores accepted check-in payload', async () => {
  const server = await startAppServer(createApp());
  const { response, body } = await postJson(server.baseUrl, '/v1/checkins', {
    userId: 'checkin-user',
    mood: 4,
  });
  try {
    assert.equal(response.status, 201);
    assert.equal(body.status, 'stored');
  } finally {
    await server.close();
  }
});

test('GET /v1/employer/dashboard returns aggregated employer metrics', async () => {
  const server = await startAppServer(createApp());
  const { response, body } = await getJson(server.baseUrl, '/v1/employer/dashboard');
  try {
    assert.equal(response.status, 200);
    assert.equal(Array.isArray(body.stressTrend), true);
    assert.equal(body.note.includes('Aggregated only'), true);
  } finally {
    await server.close();
  }
});
