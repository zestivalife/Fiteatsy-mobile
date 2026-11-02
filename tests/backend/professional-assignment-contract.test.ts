import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignmentValidationDetails,
  postgresUuidSchema,
  professionalIdentitySchema,
  professionalAssignmentBatchSchema,
} from '../../backend/src/modules/professional-assignments/professional-assignment.contract.js';

const legacyPostgresUuid = '11111111-1111-f111-1111-111111111111';
const rfcUuid = '22222222-2222-4222-8222-222222222222';
const externalProfessionalId = 'ext_330a4fa0-731b-4162-bcb9-bf4e21e6a014';

const validPayload = {
  clientUserIds: [legacyPostgresUuid],
  professionalUserId: rfcUuid,
  professionalType: 'CONSULTANT' as const,
  relationshipType: 'CLIENT_CARE',
  reason: 'Platform Owner assigned clients',
  allowReassignment: false,
};

test('canonical PostgreSQL UUID identities round-trip without changing IDs', () => {
  assert.equal(postgresUuidSchema.safeParse(legacyPostgresUuid).success, true);
  const parsed = professionalAssignmentBatchSchema.parse(validPayload);
  assert.deepEqual(parsed.clientUserIds, [legacyPostgresUuid]);
  assert.equal(parsed.professionalUserId, rfcUuid);
});

test('namespaced external consultant identities remain strict assignment targets', () => {
  assert.equal(professionalIdentitySchema.safeParse(externalProfessionalId).success, true);
  assert.equal(professionalIdentitySchema.safeParse(`external_${rfcUuid}`).success, false);
  assert.equal(professionalIdentitySchema.safeParse('ext_not-a-uuid').success, false);
  const parsed = professionalAssignmentBatchSchema.parse({
    ...validPayload,
    professionalUserId: externalProfessionalId,
  });
  assert.equal(parsed.professionalUserId, externalProfessionalId);
});

test('batch payload rejects malformed client and professional identities', () => {
  const parsed = professionalAssignmentBatchSchema.safeParse({
    ...validPayload,
    clientUserIds: ['not-a-client-id'],
    professionalUserId: 'not-a-professional-id',
  });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const details = assignmentValidationDetails(parsed.error);
  assert.ok(details.fieldErrors.clientUserIds?.length);
  assert.ok(details.fieldErrors.professionalUserId?.length);
  assert.ok(details.issues.every((issue) => !issue.message.includes('not-a-')));
});

test('batch payload is strict, bounded and de-duplicates idempotent selections', () => {
  assert.equal(professionalAssignmentBatchSchema.safeParse({ ...validPayload, unexpected: true }).success, false);
  assert.equal(professionalAssignmentBatchSchema.safeParse({ ...validPayload, clientUserIds: [] }).success, false);
  const parsed = professionalAssignmentBatchSchema.parse({ ...validPayload, clientUserIds: [rfcUuid, rfcUuid] });
  assert.deepEqual(parsed.clientUserIds, [rfcUuid]);
});
