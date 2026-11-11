import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = readFileSync(new URL('../../backend/src/modules/admin/delegated.routes.ts', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../../backend/src/modules/professional-assignments/professional-assignments.repository.ts', import.meta.url), 'utf8');

test('external practice referrals use a separate delegated contract', () => {
  assert.match(routes, /external-practice-referrals\/professionals/);
  assert.match(routes, /external-practice-referrals/);
  assert.match(routes, /external_practice_referral/);
  assert.match(routes, /PENDING_CLIENT_CONNECTION/);
  assert.match(routes, /NOT_GRANTED/);
});

test('external practice referral resolves canonical signup identity without granting connection or consent', () => {
  assert.match(repository, /external_consultant_signups/);
  assert.match(repository, /signup\.signup_state = 'READY'/);
  assert.match(repository, /EXTERNAL_PRACTICE_REFERRAL/);
  assert.doesNotMatch(repository, /createExternalPracticeReferral[\s\S]*external_fiteatsy_connections/);
  assert.doesNotMatch(repository, /createExternalPracticeReferral[\s\S]*external_fiteatsy_consents/);
});

test('internal owner discovery retains Senior Consultants while excluding external pseudo-identities', () => {
  assert.match(repository, /left\(id, 4\) <> 'ext_'/);
  assert.match(repository, /'senior_consultant'/);
});
