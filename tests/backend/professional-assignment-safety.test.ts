import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repository = readFileSync(new URL('../../backend/src/modules/professional-assignments/professional-assignments.repository.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../backend/src/modules/professional-assignments/professional-assignments.routes.ts', import.meta.url), 'utf8');

test('same-consultant retries are idempotent', () => {
  assert.match(repository, /consultant_user_id\) === input\.professionalUserId/);
  assert.match(repository, /return activeAssignment/);
});

test('changing consultants requires explicit reassignment confirmation', () => {
  assert.match(repository, /!input\.allowReassignment/);
  assert.match(repository, /ReassignmentRequiredError/);
  assert.match(routes, /REASSIGNMENT_CONFIRMATION_REQUIRED/);
  assert.match(routes, /status\(409\)/);
});

test('assignment mutation is atomic and preserves prior records', () => {
  assert.match(repository, /query\('begin'\)/);
  assert.match(repository, /set status = 'revoked'/);
  assert.match(repository, /insert into professional_assignment_audit_events/);
  assert.match(repository, /query\('commit'\)/);
  assert.match(repository, /query\('rollback'\)/);
});

test('multi-client assignment is one atomic transaction and rejects partial eligibility', () => {
  assert.match(repository, /createProfessionalAssignmentsBatch/);
  assert.match(repository, /client\.id = any\(\$1::uuid\[\]\)/);
  assert.match(repository, /eligibleClients\.rowCount !== input\.clientUserIds\.length/);
  assert.match(repository, /const conflicts = input\.clientUserIds/);
  assert.match(routes, /professionalAssignmentsRouter\.post\('\/batch'/);
  assert.match(routes, /z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)\.max\(100\)/);
});

test('eligible-client queries exclude deleted and inactive records and mask contacts', () => {
  assert.match(repository, /c\.deleted_at is null/);
  assert.match(repository, /u\.deleted_at is null/);
  assert.match(repository, /lower\(coalesce\(u\.status, ''\)\) = 'active'/);
  assert.match(repository, /maskedEmail: maskEmail/);
  assert.match(repository, /maskedMobileNumber: maskMobile/);
});

test('only authorised operational roles can mutate assignments', () => {
  assert.match(routes, /canManageProfessionalAssignments/);
  assert.match(routes, /status\(403\).*ASSIGNMENT_PERMISSION_REQUIRED/);
});

test('administrative assignment does not create Connection PIN consent', () => {
  assert.doesNotMatch(repository, /connection.?pin|consent/i);
  assert.doesNotMatch(routes, /connection.?pin|consent/i);
});
