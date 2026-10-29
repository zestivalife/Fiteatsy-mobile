import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => { server = await startTestServer(); });
test.after(async () => { await server?.close(); });
test.beforeEach(async () => { await resetTestState(); });

const createAdmin = async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Directory Admin', email: `directory-admin-${Date.now()}@example.com`, mobileNumber: '+919700009901',
  });
  await pool.query("update users set role='admin' where id=$1", [admin.current.body.accountId]);
  return admin;
};

test('successful registration commits a minimal durable directory event', async () => {
  const account = await createAuthenticatedSession(server.baseUrl, {
    name: 'Directory Client', email: `directory-client-${Date.now()}@example.com`, mobileNumber: '+919700009902',
  });
  const result = await pool.query(
    `select event_type,aggregate_user_id,payload,delivered_at from fiteatsy_client_directory_outbox where aggregate_user_id=$1`,
    [account.current.body.accountId],
  );
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].event_type, 'FITEATSY_USER_REGISTERED');
  assert.equal(result.rows[0].aggregate_user_id, account.current.body.accountId);
  assert.equal(result.rows[0].payload.fiteatsy_user_id, account.current.body.accountId);
  assert.equal(result.rows[0].payload.registration_status, 'COMPLETED');
  assert.equal('session_token' in result.rows[0].payload, false);
  assert.equal('otp' in result.rows[0].payload, false);
});

test('directory status and reconciliation are restricted to platform administrators', async () => {
  const admin = await createAdmin();
  const user = await createAuthenticatedSession(server.baseUrl, {
    name: 'Directory Reader', email: `directory-reader-${Date.now()}@example.com`, mobileNumber: '+919700009903',
  });
  const denied = await getJson(server.baseUrl, '/v1/admin/client-directory-sync', { headers: authHeaders(user.token) });
  assert.equal(denied.response.status, 403);

  const reconcile = await postJson(server.baseUrl, '/v1/admin/client-directory-sync/reconcile', {}, { headers: authHeaders(admin.token) });
  assert.equal(reconcile.response.status, 202);
  assert.equal(typeof reconcile.body.processed, 'number');
  const status = await getJson(server.baseUrl, '/v1/admin/client-directory-sync', { headers: authHeaders(admin.token) });
  assert.equal(status.response.status, 200);
  assert.equal(typeof status.body.queue.pending, 'number');
  assert.equal(typeof status.body.queue.dead_lettered, 'number');
});

test('dead-letter replay is explicit, bounded and administrator-only', async () => {
  const admin = await createAdmin();
  await pool.query(`update fiteatsy_client_directory_outbox set dead_lettered_at=now(),last_error_code='HTTP_503'`);
  const replay = await postJson(server.baseUrl, '/v1/admin/client-directory-sync/replay', { limit: 1 }, { headers: authHeaders(admin.token) });
  assert.equal(replay.response.status, 202);
  assert.equal(replay.body.replayed, 1);
  const restored = await pool.query(`select dead_lettered_at,last_error_code,delivery_attempts from fiteatsy_client_directory_outbox order by created_at limit 1`);
  assert.equal(restored.rows[0].dead_lettered_at, null);
  assert.equal(restored.rows[0].last_error_code, null);
  assert.equal(restored.rows[0].delivery_attempts, 0);
});
