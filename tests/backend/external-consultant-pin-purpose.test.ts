import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createFiteatsyIdentityAssertion } from '../../backend/src/modules/external-consultants/external-consultants.service.js';
import type { AuthenticatedAccount } from '../../backend/src/modules/auth/auth.repository.js';

test('Fiteatsy connection assertions are purpose-bound and short-lived', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.EXTERNAL_FITEATSY_CONNECTION_ENABLED = 'true';
  process.env.EXTERNAL_FITEATSY_BASE_URL = 'https://qa.example.invalid';
  process.env.EXTERNAL_FITEATSY_ASSERTION_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.EXTERNAL_FITEATSY_ASSERTION_ISSUER = 'fiteatsy-auth-service';
  process.env.EXTERNAL_FITEATSY_ASSERTION_AUDIENCE = 'practice-operations-service';

  const account = {
    user: { id: crypto.randomUUID() },
  } as AuthenticatedAccount;
  const issuedAt = 1_800_000_000;
  const assertion = createFiteatsyIdentityAssertion(account, issuedAt);
  const payload = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString()) as Record<string, unknown>;

  assert.equal(payload.sub, account.user.id);
  assert.equal(payload.actor_type, 'FITEATSY_USER');
  assert.equal(payload.purpose, 'consultant_connection');
  assert.equal(payload.iss, 'fiteatsy-auth-service');
  assert.equal(payload.aud, 'practice-operations-service');
  assert.equal(payload.exp, issuedAt + 120);
});
