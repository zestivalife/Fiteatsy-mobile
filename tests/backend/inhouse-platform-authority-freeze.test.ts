import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { assertPlatformOperationAuthority } from '../../backend/src/modules/tenancy/platform-authority.js';

const routes = fs.readFileSync(
  new URL('../../backend/src/modules/professional-assignments/professional-assignments.routes.ts', import.meta.url),
  'utf8',
);

test('in-house Senior Consultant retains governed professional discovery authority', () => {
  assert.equal(assertPlatformOperationAuthority('senior_consultant', true, 'ZESTIVA_INTERNAL'), true);
  assert.match(routes, /resolveActiveTenantContext\(account\)/);
  assert.match(routes, /tenantContext\?\.tenantType/);
});

test('external and unscoped Senior Consultant identities remain fail-closed', () => {
  for (const tenantType of [undefined, 'INDEPENDENT_CONSULTANT', 'PRACTICE', 'CLINIC', 'ENTERPRISE']) {
    assert.throws(
      () => assertPlatformOperationAuthority('senior_consultant', true, tenantType),
      /PLATFORM_AUTHORITY_REQUIRED/,
    );
  }
});

test('ordinary Consultant remains denied while platform-global authority is preserved', () => {
  assert.throws(
    () => assertPlatformOperationAuthority('consultant', true, 'ZESTIVA_INTERNAL'),
    /PLATFORM_AUTHORITY_REQUIRED/,
  );
  assert.equal(assertPlatformOperationAuthority('platform_owner', true), true);
  assert.equal(assertPlatformOperationAuthority('super_admin', true), true);
  assert.throws(
    () => assertPlatformOperationAuthority('platform_owner', false),
    /PLATFORM_AUTHORITY_REQUIRED/,
  );
});
