import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  externalPracticeReferralSchema,
  professionalAssignmentSchema,
} from '../../backend/src/modules/professional-assignments/professional-assignment.contract.js';

test('external referral accepts the provisioned ext identity contract', () => {
  const parsed = externalPracticeReferralSchema.safeParse({
    clientUserId: randomUUID(),
    professionalUserId: `ext_${randomUUID()}`,
  });
  assert.equal(parsed.success, true);
});

test('external referral rejects plain UUID and malformed external identities', () => {
  for (const professionalUserId of [
    randomUUID(),
    'ext_not-a-uuid',
    `external_${randomUUID()}`,
    `ext_${randomUUID()}_suffix`,
  ]) {
    assert.equal(externalPracticeReferralSchema.safeParse({
      clientUserId: randomUUID(),
      professionalUserId,
    }).success, false);
  }
});

test('internal assignment remains canonical UUID-only', () => {
  const input = {
    clientUserId: randomUUID(),
    professionalUserId: randomUUID(),
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
  };
  assert.equal(professionalAssignmentSchema.safeParse(input).success, true);
  assert.equal(professionalAssignmentSchema.safeParse({
    ...input,
    professionalUserId: `ext_${input.professionalUserId}`,
  }).success, false);
});
