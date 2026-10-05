import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXTERNAL_SIGNUP_STATES,
  InvalidExternalSignupTransitionError,
  assertExternalSignupTransition,
  canTransitionExternalSignup,
  isExternalSignupTerminal
} from '../../backend/src/modules/external-signup/external-signup.state-machine.js';

const happyPath = [
  'STARTED',
  'OTP_PENDING',
  'MOBILE_VERIFIED',
  'ACCOUNT_CREATED',
  'TENANT_CREATED',
  'PROFILE_PENDING',
  'ONBOARDING_IN_PROGRESS',
  'READY'
] as const;

const directRegistrationPath = [
  'REGISTRATION_ACCEPTED',
  'ACCOUNT_CREATED',
  'TENANT_CREATED',
  'PROFILE_PENDING',
  'ONBOARDING_IN_PROGRESS',
  'READY'
] as const;

test('external signup accepts every governed forward transition', () => {
  for (let index = 0; index < happyPath.length - 1; index += 1) {
    assert.equal(canTransitionExternalSignup(happyPath[index], happyPath[index + 1]), true);
    assert.doesNotThrow(() => assertExternalSignupTransition(happyPath[index], happyPath[index + 1]));
  }
});

test('external signup accepts CAPTCHA-protected direct registration without OTP', () => {
  for (let index = 0; index < directRegistrationPath.length - 1; index += 1) {
    assert.equal(canTransitionExternalSignup(directRegistrationPath[index], directRegistrationPath[index + 1]), true);
  }
});

test('external signup rejects every non-governed transition', () => {
  for (const from of EXTERNAL_SIGNUP_STATES) {
    for (const to of EXTERNAL_SIGNUP_STATES) {
      if (canTransitionExternalSignup(from, to)) continue;
      assert.throws(() => assertExternalSignupTransition(from, to), InvalidExternalSignupTransitionError);
    }
  }
});

test('blocked, suspended and cancelled states are terminal', () => {
  assert.equal(isExternalSignupTerminal('BLOCKED'), true);
  assert.equal(isExternalSignupTerminal('SUSPENDED'), true);
  assert.equal(isExternalSignupTerminal('CANCELLED'), true);
  assert.equal(isExternalSignupTerminal('READY'), false);
});
