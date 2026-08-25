import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { resetDelegatedIdempotencyForTests } from '../../backend/src/modules/admin/delegated-operation-idempotency.js';
import { resetDelegatedAuthorityReplayStoreForTests } from '../../backend/src/modules/auth/delegated-authority.js';
import { postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const permission = 'fiteatsy.qa.admin.create';

const sign = (overrides: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({
    alg: 'RS256', typ: 'Zestiva-Delegated-Authority', kid: 'qa-admin-test-key'
  })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'zestiva-platform', sub: 'owner-qa-operator', aud: 'fiteatsy-backend',
    iat: now, exp: now + 180, jti: crypto.randomUUID(), product: 'fiteatsy',
    permissions: [permission], purpose: 'qa_provisioning', actor_type: 'platform_owner',
    ...overrides
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
};

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  process.env.ZESTIVA_DELEGATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  process.env.ZESTIVA_DELEGATION_KEY_ID = 'qa-admin-test-key';
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

const input = () => ({
  name: 'Phase C QA Administrator',
  email: `phase-c-qa-admin-${Date.now()}@example.com`,
  mobileNumber: '+919762006688',
  reason: 'Phase C authenticated production acceptance'
});

test('Owner delegation creates only a canonical QA_TEST admin and audits creation', async () => {
  const body = input();
  const created = await postJson(server.baseUrl, '/v1/internal/delegated/qa-admins', body, {
    headers: { 'x-zestiva-delegation': sign(), 'idempotency-key': crypto.randomUUID(), 'x-correlation-id': 'phase-c-create' }
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.user.role, 'admin');
  assert.equal(created.body.user.accountPurpose, 'QA_TEST');
  assert.equal(created.body.user.mobileNumber, '919762006688');

  const persisted = await pool.query('select role, account_purpose, mobile_number_normalized from users where id = $1', [created.body.user.id]);
  assert.deepEqual(persisted.rows[0], { role: 'admin', account_purpose: 'QA_TEST', mobile_number_normalized: '919762006688' });
  const audit = await pool.query('select actor_user_id, action, role, account_purpose, metadata from qa_provisioning_audit_events where target_user_id = $1', [created.body.user.id]);
  assert.deepEqual(audit.rows[0], {
    actor_user_id: null,
    action: 'QAIdentityCreated',
    role: 'admin',
    account_purpose: 'QA_TEST',
    metadata: { delegatedActorReference: 'owner-qa-operator' }
  });
});

test('identical idempotent requests reuse one QA admin and audit the replay', async () => {
  const body = input();
  const key = crypto.randomUUID();
  const first = await postJson(server.baseUrl, '/v1/internal/delegated/qa-admins', body, {
    headers: { 'x-zestiva-delegation': sign(), 'idempotency-key': key, 'x-correlation-id': 'phase-c-idempotent' }
  });
  const second = await postJson(server.baseUrl, '/v1/internal/delegated/qa-admins', body, {
    headers: { 'x-zestiva-delegation': sign(), 'idempotency-key': key, 'x-correlation-id': 'phase-c-idempotent' }
  });
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.idempotentReplay, true);
  assert.equal(second.body.user.id, first.body.user.id);
  const users = await pool.query('select count(*)::int as count from users where mobile_number_normalized = $1', ['919762006688']);
  assert.equal(users.rows[0].count, 1);
  const audit = await pool.query('select action from qa_provisioning_audit_events where target_user_id = $1 order by created_at', [first.body.user.id]);
  assert.deepEqual(audit.rows.map((row) => row.action), ['QAIdentityCreated', 'QAIdentityReused']);
});

test('identical canonical identity with a new idempotency key reuses one QA admin', async () => {
  const body = input();
  const first = await postJson(server.baseUrl, '/v1/internal/delegated/qa-admins', body, {
    headers: { 'x-zestiva-delegation': sign(), 'idempotency-key': crypto.randomUUID(), 'x-correlation-id': 'phase-c-create' }
  });
  const second = await postJson(server.baseUrl, '/v1/internal/delegated/qa-admins', body, {
    headers: { 'x-zestiva-delegation': sign(), 'idempotency-key': crypto.randomUUID(), 'x-correlation-id': 'phase-c-reuse' }
  });
  assert.equal(first.response.status, 201, JSON.stringify(first.body));
  assert.equal(second.response.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.idempotentReplay, true);
  assert.equal(second.body.identityReused, true);
  assert.equal(second.body.user.id, first.body.user.id);
  const users = await pool.query('select count(*)::int as count from users where email_normalized = $1 or mobile_number_normalized = $2', [body.email.toLowerCase(), '919762006688']);
  assert.equal(users.rows[0].count, 1);
  const audit = await pool.query('select action from qa_provisioning_audit_events where target_user_id = $1 order by created_at', [first.body.user.id]);
  assert.deepEqual(audit.rows.map((row) => row.action), ['QAIdentityCreated', 'QAIdentityReused']);
});

test('QA admin endpoint denies missing, invalid, expired, wrong-purpose, and missing-permission delegation', async () => {
  const body = input();
  const attempts = [
    {},
    { 'x-zestiva-delegation': 'invalid.token.value' },
    { 'x-zestiva-delegation': sign({ exp: Math.floor(Date.now() / 1000) - 1 }) },
    { 'x-zestiva-delegation': sign({ purpose: 'client_assignment' }) },
    { 'x-zestiva-delegation': sign({ permissions: [] }) },
    { 'x-zestiva-delegation': sign({ actor_type: 'consultant' }) }
  ];
  for (const headers of attempts) {
    const denied = await postJson(server.baseUrl, '/v1/internal/delegated/qa-admins', body, {
      headers: { ...headers, 'idempotency-key': crypto.randomUUID(), 'x-correlation-id': 'phase-c-denied' }
    });
    assert.equal(denied.response.status, 401, JSON.stringify(denied.body));
  }
  const count = await pool.query("select count(*)::int as count from users where role = 'admin' and account_purpose = 'QA_TEST'");
  assert.equal(count.rows[0].count, 0);
});

test('QA admin endpoint requires an idempotency key after valid Owner delegation', async () => {
  const denied = await postJson(server.baseUrl, '/v1/internal/delegated/qa-admins', input(), {
    headers: { 'x-zestiva-delegation': sign(), 'x-correlation-id': 'phase-c-no-key' }
  });
  assert.equal(denied.response.status, 400);
  assert.equal(denied.body.error, 'IDEMPOTENCY_KEY_REQUIRED');
});

test('QA admin endpoint rejects role and account-purpose overrides', async () => {
  for (const override of [{ role: 'user' }, { accountPurpose: 'PRODUCTION_USER' }]) {
    const denied = await postJson(server.baseUrl, '/v1/internal/delegated/qa-admins', { ...input(), ...override }, {
      headers: { 'x-zestiva-delegation': sign(), 'idempotency-key': crypto.randomUUID(), 'x-correlation-id': 'phase-c-override' }
    });
    assert.equal(denied.response.status, 400, JSON.stringify(denied.body));
  }
});

test('delegated QA identity provisioning records the external Owner as an audit reference', async () => {
  const cases = [
    { route: 'qa-clients', role: 'user', suffix: '1' },
    { route: 'qa-consultants', role: 'consultant', suffix: '2' },
    { route: 'qa-senior-consultants', role: 'senior_consultant', suffix: '3' }
  ];

  for (const item of cases) {
    const created = await postJson(server.baseUrl, `/v1/internal/delegated/${item.route}`, {
      name: `Phase C ${item.role}`,
      email: `phase-c-${item.role}-${Date.now()}@example.com`,
      mobileNumber: `+91976200668${item.suffix}`,
      reason: 'Phase C governed identity provisioning'
    }, {
      headers: {
        'x-zestiva-delegation': sign({ permissions: ['fiteatsy.qa.identity.create'] }),
        'idempotency-key': crypto.randomUUID(),
        'x-correlation-id': `phase-c-${item.role}`
      }
    });

    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.user.role, item.role);
    assert.equal(created.body.user.accountPurpose, 'QA_TEST');
    const audit = await pool.query(
      'select actor_user_id, metadata from qa_provisioning_audit_events where target_user_id = $1 and action = $2',
      [created.body.user.id, 'QAIdentityCreated']
    );
    assert.equal(audit.rows[0].actor_user_id, null);
    assert.deepEqual(audit.rows[0].metadata, { delegatedActorReference: 'owner-qa-operator' });
  }
});
