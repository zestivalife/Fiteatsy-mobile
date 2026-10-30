import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repository = readFileSync(new URL('../../backend/src/modules/professional-assignments/professional-assignments.repository.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../backend/src/modules/professional-assignments/professional-assignments.routes.ts', import.meta.url), 'utf8');
const delegatedRoutes = readFileSync(new URL('../../backend/src/modules/admin/delegated.routes.ts', import.meta.url), 'utf8');
const assignmentContract = readFileSync(new URL('../../backend/src/modules/professional-assignments/professional-assignment.contract.ts', import.meta.url), 'utf8');
const delegatedAuthority = readFileSync(new URL('../../backend/src/modules/auth/delegated-authority.ts', import.meta.url), 'utf8');
const actorMigration = readFileSync(new URL('../../backend/src/db/migrations/0069_delegated_assignment_actor_attribution.sql', import.meta.url), 'utf8');

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
  assert.match(repository, /client\.id = any\(\$1::text\[\]\)/);
  assert.match(repository, /client_user_id = any\(\$1::text\[\]\)/);
  assert.doesNotMatch(repository, /(?:client\.id|client_user_id) = any\(\$1::uuid\[\]\)/);
  assert.match(repository, /eligibleClients\.rowCount !== input\.clientUserIds\.length/);
  assert.match(repository, /const conflicts = input\.clientUserIds/);
  assert.match(routes, /professionalAssignmentsRouter\.post\('\/batch'/);
  assert.match(routes, /professionalAssignmentBatchSchema/);
});

test('professional and client must share an active tenant membership', () => {
  assert.match(repository, /professional_membership\.tenant_id = fc\.tenant_id/);
  assert.match(repository, /professional_membership\.user_id = \$2/);
  assert.match(repository, /lower\(coalesce\(professional_membership\.status, ''\)\) = 'active'/);
});

test('eligible-client queries exclude deleted and inactive records and mask contacts', () => {
  assert.match(repository, /c\.deleted_at is null/);
  assert.match(repository, /u\.deleted_at is null/);
  assert.match(repository, /lower\(coalesce\(u\.status, ''\)\) = 'active'/);
  assert.match(repository, /maskedEmail: maskEmail/);
  assert.match(repository, /maskedMobileNumber: maskMobile/);
  assert.match(repository, /lower\(coalesce\((?:u|client)\.role, 'user'\)\) in \('user', 'client'\)/);
});

test('Senior Consultant delegation preserves supervision and is limited to internal delivery consultants', () => {
  assert.match(repository, /createSeniorDelegatedAssignmentsBatch/);
  assert.match(repository, /supervisor\.consultant_user_id = \$2/);
  assert.match(repository, /supervisor\.relationship_type = 'CLIENT_CARE'/);
  assert.match(repository, /relationship_type = 'DELEGATED_CLIENT_CARE'/);
  assert.match(repository, /input\.professionalUserId\.startsWith\('ext_'\)/);
  assert.match(repository, /lower\(coalesce\(role, ''\)\) in \('consultant', 'provider', 'dietician'\)/);
  assert.match(repository, /target_membership\.tenant_role[\s\S]+\('consultant', 'provider', 'dietician'\)/);
  assert.match(routes, /createSeniorDelegatedAssignmentsBatch/);
  assert.match(routes, /clients\/search[\s\S]+supervisorOnly: true/);
});

test('Senior Consultant can revoke only a delegated assignment beneath an active supervision assignment', () => {
  assert.match(repository, /revokeSeniorDelegatedAssignment/);
  assert.match(repository, /delegated\.relationship_type='DELEGATED_CLIENT_CARE'/);
  assert.match(repository, /supervisor\.consultant_user_id=\$2/);
  assert.match(routes, /revokeSeniorDelegatedAssignment/);
});

test('only authorised operational roles can mutate assignments', () => {
  assert.match(routes, /canManageProfessionalAssignments/);
  assert.match(routes, /status\(403\).*ASSIGNMENT_PERMISSION_REQUIRED/);
});

test('administrative assignment does not create Connection PIN consent', () => {
  assert.doesNotMatch(repository, /connection.?pin|consent/i);
  assert.doesNotMatch(routes, /connection.?pin|consent/i);
});

test('Zestiva assignment operations require exact signed delegated authority', () => {
  assert.match(delegatedRoutes, /fiteatsy\.client\.assignment\.read/);
  assert.match(delegatedRoutes, /fiteatsy\.client\.assign/);
  assert.match(delegatedRoutes, /fiteatsy\.client\.assignment\.revoke/);
  assert.match(delegatedRoutes, /platform_owner/);
  assert.match(delegatedAuthority, /header\.alg !== 'RS256'/);
  assert.match(delegatedAuthority, /INVALID_SIGNATURE/);
  assert.match(delegatedAuthority, /INVALID_ISSUER/);
  assert.match(delegatedAuthority, /INVALID_AUDIENCE/);
  assert.match(delegatedAuthority, /REPLAYED_TOKEN/);
});

test('delegated assignment surface covers reads, atomic batch, reassignment and revoke', () => {
  assert.match(delegatedRoutes, /professional-assignments\/clients\/pool/);
  assert.match(delegatedRoutes, /professional-assignments\/professionals/);
  assert.match(delegatedRoutes, /professional-assignments\/batch/);
  assert.match(assignmentContract, /allowReassignment/);
  assert.match(delegatedRoutes, /REASSIGNMENT_CONFIRMATION_REQUIRED/);
});

test('delegated mutations preserve external actor attribution without forging a Fiteatsy user', () => {
  assert.match(delegatedRoutes, /actorUserId: null, actorReference/);
  assert.match(repository, /created_by_actor_reference/);
  assert.match(repository, /revoked_by_actor_reference/);
  assert.match(repository, /actor_reference/);
  assert.match(actorMigration, /professional_assignment_audit_actor_reference_idx/);
});
