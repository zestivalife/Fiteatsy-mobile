import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  applicationUserIdSchema,
  professionalAssignmentBatchSchema,
  professionalAssignmentSchema,
} from '../../backend/src/modules/professional-assignments/professional-assignment.schemas.js';

const uuid = randomUUID();
const externalId = `ext_${randomUUID()}`;

test('assignment contract accepts native and governed external application identities', () => {
  assert.equal(applicationUserIdSchema.parse(uuid), uuid);
  assert.equal(applicationUserIdSchema.parse(externalId), externalId);
  assert.equal(professionalAssignmentSchema.parse({
    clientUserId: uuid,
    professionalUserId: externalId,
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
    reason: 'Platform Owner assigned Fiteatsy lead',
  }).professionalUserId, externalId);
});

test('assignment contract remains fail-closed for malformed and invented principals', () => {
  for (const value of ['', 'external-test', 'ext_not-a-uuid', '../owner', `${externalId}x`]) {
    assert.equal(applicationUserIdSchema.safeParse(value).success, false, value);
  }
});

test('batch contract supports text-backed application identities and de-duplicates clients', () => {
  const parsed = professionalAssignmentBatchSchema.parse({
    clientUserIds: [uuid, uuid],
    professionalUserId: externalId,
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
  });
  assert.deepEqual(parsed.clientUserIds, [uuid]);
});

test('assignment upsert targets the canonical tenant-scoped active uniqueness contract', async () => {
  const repository = await readFile(
    new URL('../../backend/src/modules/professional-assignments/professional-assignments.repository.ts', import.meta.url),
    'utf8',
  );
  const migration = await readFile(
    new URL('../../backend/src/db/migrations/0090_tenant_scoped_assignment_uniqueness.sql', import.meta.url),
    'utf8',
  );

  assert.match(
    repository,
    /on conflict \(tenant_id, consultant_user_id, client_user_id, scope\) where status = 'active'/,
  );
  assert.match(
    migration,
    /unique index if not exists consultant_client_assignments_active_tenant_unique[\s\S]*\(tenant_id, consultant_user_id, client_user_id, scope\)/,
  );
});
