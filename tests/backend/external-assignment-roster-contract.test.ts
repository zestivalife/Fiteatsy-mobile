import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = readFileSync(new URL('../../backend/src/modules/external-consultants/external-consultant-access.routes.ts', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../../backend/src/modules/consultants/consultants.repository.ts', import.meta.url), 'utf8');

test('external assignment roster is delegated, purpose-bound, and exposes identity-safe display metadata', () => {
  assert.match(routes, /fiteatsy\.external\.assignment\.read/);
  assert.match(routes, /external_consultant_assignment_roster/);
  assert.match(routes, /EXTERNAL_CONSULTANT/);
  assert.match(routes, /assignmentState: 'ACTIVE'/);
  assert.match(routes, /clients\.map\(\(client\) => \(\{[\s\S]*?userId:[\s\S]*?clientId:[\s\S]*?displayName: client\.name[\s\S]*?assignmentState/);
  assert.doesNotMatch(routes, /email: client\./);
  assert.doesNotMatch(routes, /mobile: client\./);
});

test('assignment roster requires active professional membership in the assignment tenant', () => {
  assert.match(repository, /professional_membership\.tenant_id = assignment\.tenant_id/);
  assert.match(repository, /c\.tenant_id = assignment\.tenant_id/);
  assert.match(repository, /assignment\.relationship_type = 'CLIENT_CARE'/);
  assert.match(repository, /assignment\.status = 'active'/);
  assert.match(repository, /c\.fiteatsy_client_id, u\.name/);
});
