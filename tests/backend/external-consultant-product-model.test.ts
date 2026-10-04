import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const routes = fs.readFileSync(new URL('../../backend/src/modules/consultants/consultants.routes.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../backend/src/db/migrations/0086_external_consultant_onboarding_lifecycle.sql', import.meta.url), 'utf8');
const audit = fs.readFileSync(new URL('../../docs/governance/P0_2_EXTERNAL_AUTH_ARCHITECTURE_AUDIT.md', import.meta.url), 'utf8');

test('P0.2 exposes governed Consultant onboarding lifecycle without client authentication', () => {
  assert.match(routes, /get\('\/onboarding'/);
  assert.match(routes, /patch\('\/onboarding'/);
  assert.match(routes, /post\('\/onboarding\/complete'/);
  assert.match(migration, /Consultant\/practice onboarding only/);
  assert.match(audit, /External SaaS clients are tenant-owned `CLIENT_RECORD` resources/);
  assert.match(audit, /not\s+required to become authenticated Fiteatsy application users/i);
});
