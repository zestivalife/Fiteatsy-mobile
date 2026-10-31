import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => { server = await startTestServer(); });
test.after(async () => { await server?.close(); });
test.beforeEach(async () => { await resetTestState(); });

const createAdmin = async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Lead Test Admin',
    email: `lead-admin-${Date.now()}@example.com`,
    mobileNumber: '+919700001001'
  });
  await pool.query("update users set role = 'admin' where id = $1", [admin.current.body.accountId]);
  return admin;
};

test('eligible registration supports authoritative name, email and Indian mobile search', async () => {
  const admin = await createAdmin();
  const lead = await createAuthenticatedSession(server.baseUrl, {
    name: 'Newest Eligible Lead',
    email: `newest-lead-${Date.now()}@example.com`,
    mobileNumber: '+919700001234'
  });

  for (const query of ['Newest Eligible', lead.identity.email, '9700001234', '+919700001234']) {
    const response = await getJson(server.baseUrl, `/v1/admin/intake-leads?q=${encodeURIComponent(query)}&page=1&pageSize=10`, {
      headers: authHeaders(admin.token)
    });
    assert.equal(response.response.status, 200);
    assert.equal(response.body.pagination.total, 1, `expected one lead for search ${JSON.stringify(query)}`);
    assert.equal(response.body.leads[0].userId, lead.current.body.accountId);
    assert.equal(response.body.diagnostic, null);
  }
});

test('pagination is deterministic, newest-first by default and exposes the total', async () => {
  const admin = await createAdmin();
  const first = await createAuthenticatedSession(server.baseUrl, {
    name: 'Paged Lead First', email: `paged-first-${Date.now()}@example.com`, mobileNumber: '+919700001235'
  });
  const second = await createAuthenticatedSession(server.baseUrl, {
    name: 'Paged Lead Second', email: `paged-second-${Date.now()}@example.com`, mobileNumber: '+919700001236'
  });
  await pool.query("update users set created_at = '2026-10-28T08:00:00Z' where id = $1", [first.current.body.accountId]);
  await pool.query("update users set created_at = '2026-10-29T08:00:00Z' where id = $1", [second.current.body.accountId]);

  const newest = await getJson(server.baseUrl, '/v1/admin/intake-leads?q=Paged%20Lead&page=1&pageSize=1&order=desc', { headers: authHeaders(admin.token) });
  assert.equal(newest.body.pagination.total, 2);
  assert.equal(newest.body.leads[0].userId, second.current.body.accountId);
  const oldest = await getJson(server.baseUrl, '/v1/admin/intake-leads?q=Paged%20Lead&page=1&pageSize=1&order=asc', { headers: authHeaders(admin.token) });
  assert.equal(oldest.body.leads[0].userId, first.current.body.accountId);
});

test('inactive filtering works and soft-deleted accounts remain excluded', async () => {
  const admin = await createAdmin();
  const inactive = await createAuthenticatedSession(server.baseUrl, {
    name: 'Inactive Lead', email: `inactive-lead-${Date.now()}@example.com`, mobileNumber: '+919700001237'
  });
  const deleted = await createAuthenticatedSession(server.baseUrl, {
    name: 'Deleted Lead', email: `deleted-lead-${Date.now()}@example.com`, mobileNumber: '+919700001238'
  });
  await pool.query("update users set status = 'inactive' where id = $1", [inactive.current.body.accountId]);
  await pool.query('update users set deleted_at = now() where id = $1', [deleted.current.body.accountId]);

  const response = await getJson(server.baseUrl, '/v1/admin/intake-leads?status=inactive&page=1&pageSize=20', { headers: authHeaders(admin.token) });
  assert.equal(response.response.status, 200);
  assert.ok(response.body.leads.some((item: { userId: string }) => item.userId === inactive.current.body.accountId));
  assert.ok(!response.body.leads.some((item: { userId: string }) => item.userId === deleted.current.body.accountId));
});

test('canonical administrator client identity remains visible but protected from client actions', async () => {
  const admin = await createAdmin();
  const response = await getJson(server.baseUrl, '/v1/admin/intake-leads?q=9700001001&page=1&pageSize=20', { headers: authHeaders(admin.token) });
  assert.equal(response.response.status, 200);
  assert.equal(response.body.leads.length, 1);
  assert.equal(response.body.leads[0].userId, admin.current.body.accountId);
  assert.equal(response.body.leads[0].assignable, false);
  assert.equal(response.body.leads[0].permanentlyDeletable, false);
  assert.equal(response.body.leads[0].protectionReason, 'WORKFORCE_OR_ADMIN_IDENTITY');
  assert.equal(response.body.diagnostic, null);
});

test('normal users cannot access lead discovery diagnostics', async () => {
  const user = await createAuthenticatedSession(server.baseUrl, {
    name: 'Unauthorised Lead Reader', email: `unauthorised-lead-${Date.now()}@example.com`, mobileNumber: '+919700001239'
  });
  const response = await getJson(server.baseUrl, '/v1/admin/intake-leads?q=9700001239', { headers: authHeaders(user.token) });
  assert.equal(response.response.status, 403);
});
