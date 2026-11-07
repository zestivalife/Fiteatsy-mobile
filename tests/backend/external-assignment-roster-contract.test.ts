import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../../backend/src/modules/external-consultants/external-consultant-access.routes.ts', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../../backend/src/modules/consultants/consultants.repository.ts', import.meta.url), 'utf8');

test('assignment roster is registered with the exact delegated authority contract', () => {
  assert.match(route, /get\('\/assignments\/clients'/);
  assert.match(route, /fiteatsy\.external\.assignment\.read/);
  assert.match(route, /external_consultant_assignment_roster/);
  assert.match(route, /'EXTERNAL_CONSULTANT'/);
});

test('assignment roster resolves the governed principal and fails closed', () => {
  assert.match(route, /resolveConsultantApplicationIdentity\(auth\.sub\.slice\('ext_'\.length\), auth\.sub\)/);
  assert.match(route, /identity\.status !== 'RESOLVED'/);
  assert.match(route, /CONSULTANT_IDENTITY_\$\{identity\.status\}/);
  assert.match(route, /listAssignedConsultantClientContexts\(identity\.applicationUserId\)/);
});

test('assignment lookup preserves product, role, status and client eligibility restrictions', () => {
  const start = repository.indexOf('export const listAssignedConsultantClientContexts');
  const end = repository.indexOf('export const getRegisteredConsultantClientProfile', start);
  assert.notEqual(start, -1);
  const implementation = repository.slice(start, end);
  assert.match(implementation, /cap003\.consultant_user_id/);
  assert.match(implementation, /cap003\.client_user_id = u\.id/);
  assert.match(implementation, /cap003\.product = 'FITEATSY'/);
  assert.match(implementation, /cap003\.professional_type = 'CONSULTANT'/);
  assert.match(implementation, /cap003\.status = 'active'/);
  assert.match(implementation, /c\.deleted_at is null/);
});

test('roster response uses the consumer contract and never fabricates connection or consent', () => {
  assert.match(route, /userId: client\.accountId/);
  assert.match(route, /clientId: client\.publicClientId/);
  assert.match(route, /assignmentState: 'ACTIVE'/);
  const assignmentHandler = route.slice(route.indexOf("get('/assignments/clients'"), route.indexOf("get('/:userId/health-context'"));
  assert.doesNotMatch(assignmentHandler, /connectionId|consent|healthContext/);
  assert.match(assignmentHandler, /Cache-Control', 'no-store, private'/);
});
