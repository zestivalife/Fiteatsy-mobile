import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  assertCanonicalTenantFixture,
  legacyZestivaConsultant,
  revokedTenantMember,
  tenantAConsultant,
  tenantAwareZestivaConsultant,
  tenantBConsultant,
  zestivaSeniorConsultant,
} from '../helpers/tenantFixtures.js';
import { ZESTIVA_INTERNAL_TENANT_ID } from '../../backend/src/test-support/test-tenants.js';
import { resolveTenantResolutionDecision } from '../../backend/src/modules/tenancy/tenant-context.js';

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('canonical fixture inventory is explicit, valid and tenant-isolated', () => {
  const fixtures = [
    legacyZestivaConsultant(), tenantAwareZestivaConsultant(), zestivaSeniorConsultant(),
    tenantAConsultant(), tenantBConsultant(), revokedTenantMember(),
  ].map(assertCanonicalTenantFixture);
  assert.equal(fixtures[0].tenant.id, ZESTIVA_INTERNAL_TENANT_ID);
  assert.notEqual(fixtures[3].tenant.id, fixtures[4].tenant.id);
  assert.equal(fixtures[5].membership?.status, 'removed');
});

test('tenant resolution smoke matrix remains deterministic', () => {
  const membership = {
    tenantId: 'tenant-a', tenantName: 'Tenant A', tenantType: 'PRACTICE' as const,
    currentMembershipRole: 'CONSULTANT' as const, resolutionPath: 'MEMBERSHIP' as const,
  };
  assert.equal(resolveTenantResolutionDecision({ activeMembership: null, hasAnyMembership: false, legacyZestivaEligible: true, migrationMode: 'EXPAND' }), 'LEGACY_ZESTIVA_FALLBACK');
  assert.equal(resolveTenantResolutionDecision({ activeMembership: membership, hasAnyMembership: true, legacyZestivaEligible: true, migrationMode: 'EXPAND' }), 'MEMBERSHIP');
  assert.equal(resolveTenantResolutionDecision({ activeMembership: null, hasAnyMembership: true, legacyZestivaEligible: true, migrationMode: 'EXPAND' }), 'DENIED');
  assert.equal(resolveTenantResolutionDecision({ activeMembership: null, hasAnyMembership: false, legacyZestivaEligible: false, migrationMode: 'EXPAND' }), 'DENIED');
});

test('reset, fixture, request and background boundaries carry explicit tenant authority', () => {
  const reset = read('backend/src/test-support/reset.ts');
  const tenants = read('backend/src/test-support/test-tenants.ts');
  const commonFood = read('tests/helpers/commonFoodFixtures.ts');
  const lifecycle = read('tests/helpers/consultantLifecycleFixtures.ts');
  const request = read('tests/helpers/authenticatedApi.ts');
  const nutrition = read('backend/src/modules/nutrition/nutrition.service.ts');
  assert.match(reset, /ensureCanonicalTestTenants/);
  assert.match(reset, /assertCanonicalTestTenantInvariant/);
  assert.match(tenants, /on conflict \(id\) do update/);
  assert.match(commonFood, /assignment_tenant_id/);
  assert.match(commonFood, /client_tenant_id/);
  assert.match(lifecycle, /reviewAuthority/);
  assert.match(request, /requestId/);
  assert.match(nutrition, /resolveActiveTenantContextForUserId\(account\.accountId\)/);
});

test('new tenant-owned writes remain protected by expand dual-write triggers', () => {
  const migration = read('backend/src/db/migrations/0082_multi_tenant_expand_backfill.sql');
  assert.match(migration, /create or replace function set_zestiva_tenant_during_transition/);
  assert.match(migration, /create trigger tenant_dual_write before insert/);
  assert.match(migration, /tenant_backfill_verification/);
});
