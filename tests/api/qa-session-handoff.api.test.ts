import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { resetDelegatedIdempotencyForTests } from '../../backend/src/modules/admin/delegated-operation-idempotency.js';
import { resetDelegatedAuthorityReplayStoreForTests } from '../../backend/src/modules/auth/delegated-authority.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const purpose = 'qa_admin_session_handoff';

const sign = (permission: string, delegatedPurpose: string) => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'Zestiva-Delegated-Authority', kid: 'qa-handoff-test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'zestiva-platform', sub: 'owner-handoff-operator', aud: 'fiteatsy-backend',
    iat: now, exp: now + 180, jti: crypto.randomUUID(), product: 'fiteatsy',
    permissions: [permission], purpose: delegatedPurpose, actor_type: 'platform_owner'
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
};

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  process.env.ZESTIVA_DELEGATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  process.env.ZESTIVA_DELEGATION_KEY_ID = 'qa-handoff-test-key';
  process.env.ZESTIVA_DELEGATION_ISSUER = 'zestiva-platform';
  process.env.ZESTIVA_DELEGATION_AUDIENCE = 'fiteatsy-backend';
  server = await startTestServer();
});

test.after(async () => { await server?.close(); });
test.beforeEach(async () => {
  await resetTestState();
  resetDelegatedAuthorityReplayStoreForTests();
  resetDelegatedIdempotencyForTests();
});

const provision = async (role: 'admin' | 'user' | 'consultant' | 'senior_consultant' = 'admin') => {
  const result = await postJson(server.baseUrl, '/v1/internal/delegated/qa-admins', {
    name: `Phase C QA ${role}`, email: `phase-c-${role}-${crypto.randomUUID()}@fiteatsy.test`,
    mobileNumber: `+919${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
    reason: 'QA session handoff security acceptance'
  }, { headers: {
    'x-zestiva-delegation': sign('fiteatsy.qa.admin.create', 'qa_provisioning'),
    'idempotency-key': crypto.randomUUID()
  } });
  if (role !== 'admin' && [200, 201].includes(result.response.status)) {
    await pool.query('update users set role = $1 where id = $2', [role, result.body.user.id]);
    result.body.user.role = role;
  }
  return result;
};

const issue = (userId: string) => postJson(server.baseUrl, `/v1/internal/delegated/qa-identities/${userId}/session`, {
  reason: 'Phase C governed QA Admin authentication'
}, { headers: {
  'x-zestiva-delegation': sign('fiteatsy.qa.session.issue', 'qa_session'),
  'idempotency-key': crypto.randomUUID()
} });

const exchange = (issued: any, overrides: Record<string, unknown> = {}) => postJson(server.baseUrl, '/v1/auth/qa-session-handoff/exchange', {
  code: issued.body.exchange.code,
  targetUserId: issued.body.exchange.targetUserId,
  purpose,
  ...overrides
});

test('fresh handoff exchanges once into the canonical QA Admin session and supports logout', async () => {
  const admin = await provision();
  const issued = await issue(admin.body.user.id);
  assert.equal(issued.response.status, 201, JSON.stringify(issued.body));
  assert.equal(issued.body.token, undefined);
  assert.equal(issued.body.session, undefined);
  assert.equal(issued.body.handoff, 'one_time_exchange');
  assert.equal(issued.body.exchange.purpose, purpose);

  const first = await exchange(issued);
  assert.equal(first.response.status, 200, JSON.stringify(first.body));
  assert.equal(typeof first.body.token, 'string');
  const me = await fetch(`${server.baseUrl}/v1/auth/me`, { headers: authHeaders(first.body.token) });
  const account = await me.json();
  assert.equal(me.status, 200);
  assert.equal(account.user.id, admin.body.user.id);
  assert.equal(account.user.role, 'admin');
  assert.equal(account.user.accountPurpose, 'QA_TEST');

  const replay = await exchange(issued);
  assert.equal(replay.response.status, 401);
  assert.equal(replay.body.error, 'QA_HANDOFF_REPLAYED');
  const logout = await fetch(`${server.baseUrl}/v1/auth/logout`, { method: 'POST', headers: authHeaders(first.body.token) });
  assert.equal(logout.status, 204);
  const afterLogout = await exchange(issued);
  assert.equal(afterLogout.response.status, 401);
  const audit = await pool.query(
    `select action from qa_provisioning_audit_events where target_user_id = $1 order by created_at`,
    [admin.body.user.id]
  );
  assert.deepEqual(audit.rows.map((row) => row.action), [
    'QAIdentityCreated',
    'QASessionHandoffIssued',
    'QASessionHandoffExchanged',
    'QASessionHandoffReplayDenied',
    'QASessionHandoffReplayDenied'
  ]);
});

test('concurrent exchange allows exactly one canonical session', async () => {
  const admin = await provision();
  const issued = await issue(admin.body.user.id);
  const results = await Promise.all([exchange(issued), exchange(issued)]);
  assert.deepEqual(results.map((result) => result.response.status).sort(), [200, 401]);
  const sessions = await pool.query('select count(*)::int as count from auth_sessions where user_id = $1', [admin.body.user.id]);
  assert.equal(sessions.rows[0].count, 1);
});

test('unknown, modified, cross-user and expired handoffs are denied', async () => {
  const admin = await provision();
  const other = await provision();
  const issued = await issue(admin.body.user.id);
  const unknown = await exchange(issued, { code: crypto.randomBytes(32).toString('base64url') });
  assert.equal(unknown.response.status, 401);
  const modified = await exchange(issued, { code: `${issued.body.exchange.code.slice(0, -1)}x` });
  assert.equal(modified.response.status, 401);
  const crossUser = await exchange(issued, { targetUserId: other.body.user.id });
  assert.equal(crossUser.response.status, 401);
  await pool.query(
    `update qa_admin_session_handoffs
        set created_at = now() - interval '2 minutes', expires_at = now() - interval '1 second'
      where target_user_id = $1 and status = 'pending'`,
    [admin.body.user.id]
  );
  const expired = await exchange(issued);
  assert.equal(expired.response.status, 401);
  assert.equal(expired.body.error, 'QA_HANDOFF_EXPIRED');
});

test('handoff issuance denies every non-admin QA role and production Admin', async () => {
  for (const role of ['user', 'consultant', 'senior_consultant'] as const) {
    const identity = await provision(role);
    assert.ok([200, 201].includes(identity.response.status), `${role}: ${JSON.stringify(identity.body)}`);
    const denied = await issue(identity.body.user.id);
    assert.equal(denied.response.status, 404, `${role}: ${JSON.stringify(denied.body)}`);
  }
  const production = await createAuthenticatedSession(server.baseUrl);
  const productionUserId = production.current.body.user.id;
  await pool.query(`update users set role = 'admin' where id = $1`, [productionUserId]);
  const denied = await issue(productionUserId);
  assert.equal(denied.response.status, 404, JSON.stringify(denied.body));
});

test('inactive QA Admin and wrong purpose are denied', async () => {
  const admin = await provision();
  await pool.query(`update users set status = 'disabled' where id = $1`, [admin.body.user.id]);
  const inactive = await issue(admin.body.user.id);
  assert.equal(inactive.response.status, 404);

  await pool.query(`update users set status = 'active' where id = $1`, [admin.body.user.id]);
  const issued = await issue(admin.body.user.id);
  const wrongPurpose = await postJson(server.baseUrl, '/v1/auth/qa-session-handoff/exchange', {
    code: issued.body.exchange.code,
    targetUserId: admin.body.user.id,
    purpose: 'another_authentication_purpose'
  });
  assert.equal(wrongPurpose.response.status, 400);
});

test('issuing a replacement revokes the prior code and invalid attempts are rate limited', async () => {
  const admin = await provision();
  const first = await issue(admin.body.user.id);
  const replacement = await issue(admin.body.user.id);
  const revoked = await exchange(first);
  assert.equal(revoked.response.status, 401);
  const valid = await exchange(replacement);
  assert.equal(valid.response.status, 200);

  let last;
  for (let index = 0; index < 11; index += 1) {
    last = await postJson(server.baseUrl, '/v1/auth/qa-session-handoff/exchange', {
      code: crypto.randomBytes(32).toString('base64url'),
      targetUserId: admin.body.user.id,
      purpose
    });
  }
  assert.equal(last?.response.status, 429);
  assert.equal(last?.body.error, 'QA_HANDOFF_RATE_LIMITED');
});
