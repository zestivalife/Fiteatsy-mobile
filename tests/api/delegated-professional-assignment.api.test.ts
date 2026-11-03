import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { pool } from '../../backend/src/db/pool.js';
import { resolveVerifiedAccountIdentity } from '../../backend/src/modules/auth/auth.repository.js';
import { ensureActiveTenantMembership, resolveFiteatsyHomeTenantId } from '../../backend/src/modules/client/client.repository.js';
import { resetDelegatedIdempotencyForTests } from '../../backend/src/modules/admin/delegated-operation-idempotency.js';
import { resetDelegatedAuthorityReplayStoreForTests } from '../../backend/src/modules/auth/delegated-authority.js';
import { postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sign = () => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'Zestiva-Delegated-Authority', kid: 'assignment-contract-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'zestiva-platform', sub: 'owner-assignment-operator', aud: 'fiteatsy-backend',
    iat: now, exp: now + 180, jti: crypto.randomUUID(), product: 'fiteatsy',
    permissions: ['fiteatsy.client.assign'], purpose: 'client_assignment', actor_type: 'platform_owner',
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
};

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  process.env.ZESTIVA_DELEGATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  process.env.ZESTIVA_DELEGATION_KEY_ID = 'assignment-contract-key';
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

test('delegated HTTP assignment accepts a governed external consultant and persists tenant-scoped assignment', async () => {
  const client = await resolveVerifiedAccountIdentity({
    name: 'Delegated Assignment Client', email: `assignment-client-${crypto.randomUUID()}@example.com`, mobileNumber: '+919810009901',
  });
  const tenantId = await resolveFiteatsyHomeTenantId();
  await ensureActiveTenantMembership(client.user.id, tenantId, 'CLIENT');
  const externalConsultantId = `ext_${crypto.randomUUID()}`;
  await pool.query(
    `insert into users(id,name,email_normalized,role,status) values($1,$2,$3,'dietician','active')`,
    [externalConsultantId, 'Governed External Dietitian', `external-${crypto.randomUUID()}@example.com`],
  );
  await ensureActiveTenantMembership(externalConsultantId, tenantId, 'CONSULTANT');

  const result = await postJson(server.baseUrl, '/v1/internal/delegated/professional-assignments', {
    clientUserId: client.user.id,
    professionalUserId: externalConsultantId,
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
    reason: 'Platform Owner assigned Fiteatsy lead',
  }, { headers: { 'x-zestiva-delegation': sign(), 'idempotency-key': crypto.randomUUID() } });

  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.assignment.consultant_user_id, externalConsultantId);
  assert.equal(result.body.assignment.client_user_id, client.user.id);
  assert.equal(result.body.assignment.tenant_id, tenantId);
  const persisted = await pool.query(
    `select consultant_user_id, client_user_id, tenant_id, status from consultant_client_assignments where id=$1`,
    [result.body.assignment.id],
  );
  assert.deepEqual(persisted.rows[0], {
    consultant_user_id: externalConsultantId, client_user_id: client.user.id, tenant_id: tenantId, status: 'active',
  });
});

test('delegated HTTP assignment rejects malformed principals before persistence', async () => {
  const result = await postJson(server.baseUrl, '/v1/internal/delegated/professional-assignments', {
    clientUserId: crypto.randomUUID(), professionalUserId: 'external-test', professionalType: 'CONSULTANT', relationshipType: 'CLIENT_CARE',
  }, { headers: { 'x-zestiva-delegation': sign(), 'idempotency-key': crypto.randomUUID() } });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error, 'INVALID_INPUT');
  const count = await pool.query('select count(*)::int as count from consultant_client_assignments');
  assert.equal(count.rows[0].count, 0);
});
