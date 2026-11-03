import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../../backend/src/modules/external-consultants/external-consultant-access.routes.ts', import.meta.url), 'utf8');

test('assignment roster resolves the governed consultant principal before querying assignments', () => {
  assert.match(route, /fiteatsy\.external\.assignment\.read/);
  assert.match(route, /external_consultant_assignment_roster/);
  assert.match(route, /resolveConsultantApplicationIdentity\(authIdentityId, auth\.sub\)/);
  assert.match(route, /listAssignedConsultantClientContexts\(identity\.applicationUserId\)/);
});

test('assignment roster fails closed for invalid or unresolved identities', () => {
  assert.match(route, /DELEGATED_ASSIGNMENT_ACTOR_INVALID/);
  assert.match(route, /identity\.status !== 'RESOLVED'/);
  assert.match(route, /CONSULTANT_IDENTITY_\$\{identity\.status\}/);
});
