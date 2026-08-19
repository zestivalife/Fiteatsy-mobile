import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { env } from '../../backend/src/config/env.js';
import {
  resetDelegatedAuthorityReplayStoreForTests,
  verifyDelegatedAuthority,
} from '../../backend/src/modules/auth/delegated-authority.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sign = (overrides: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'Zestiva-Delegated-Authority', kid: 'test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'zestiva-platform', sub: 'owner-1', aud: 'fiteatsy-backend', iat: now, exp: now + 180, jti: crypto.randomUUID(), product: 'fiteatsy', permissions: ['fiteatsy:qa_provisioning'], purpose: 'qa_provisioning', actor_type: 'platform_owner', ...overrides })).toString('base64url');
  const input = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(input);
  return `${input}.${signer.sign(privateKey).toString('base64url')}`;
};

test.beforeEach(() => {
  process.env.ZESTIVA_DELEGATION_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  process.env.ZESTIVA_DELEGATION_KEY_ID = 'test-key';
  process.env.ZESTIVA_DELEGATION_ISSUER = 'zestiva-platform';
  process.env.ZESTIVA_DELEGATION_AUDIENCE = 'fiteatsy-backend';
  resetDelegatedAuthorityReplayStoreForTests();
});

test('valid delegation is accepted and replay is denied', async () => {
  const token = sign();
  assert.equal((await verifyDelegatedAuthority(token, 'fiteatsy:qa_provisioning', 'qa_provisioning')).sub, 'owner-1');
  await assert.rejects(() => verifyDelegatedAuthority(token, 'fiteatsy:qa_provisioning', 'qa_provisioning'), /already been used/);
});

for (const [label, overrides, expected] of [
  ['wrong issuer', { iss: 'other' }, 'INVALID_ISSUER'],
  ['wrong audience', { aud: 'other' }, 'INVALID_AUDIENCE'],
  ['wrong product', { product: 'consultants' }, 'INVALID_PRODUCT'],
  ['wrong purpose', { purpose: 'browser_login' }, 'INVALID_PURPOSE'],
  ['missing permission', { permissions: [] }, 'MISSING_PERMISSION'],
  ['expired', { exp: Math.floor(Date.now() / 1000) - 1 }, 'EXPIRED_TOKEN'],
] as const) {
  test(`delegation denies ${label}`, async () => assert.rejects(
    () => verifyDelegatedAuthority(sign(overrides), 'fiteatsy:qa_provisioning', 'qa_provisioning'),
    (error: unknown) => error instanceof Error && (error as { code?: string }).code === expected
  ));
}

test('tampered signature and ordinary bearer JWT are denied', async () => {
  const token = sign();
  const tampered = `${token.slice(0, token.lastIndexOf('.') + 1)}${Buffer.from('tampered').toString('base64url')}`;
  await assert.rejects(() => verifyDelegatedAuthority(tampered, 'fiteatsy:qa_provisioning', 'qa_provisioning'), /signature is invalid/);
  await assert.rejects(() => verifyDelegatedAuthority('ordinary.browser.jwt', 'fiteatsy:qa_provisioning', 'qa_provisioning'), /malformed/);
});

test('verification rejects future-issued tokens outside clock skew', async () => {
  const future = Math.floor(Date.now() / 1000) + env.zestivaDelegationClockSkewSeconds + 10;
  await assert.rejects(() => verifyDelegatedAuthority(sign({ iat: future, exp: future + 180 }), 'fiteatsy:qa_provisioning', 'qa_provisioning'), /invalid timing/);
});
