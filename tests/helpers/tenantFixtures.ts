import assert from 'node:assert/strict';
import {
  TENANT_A_ID,
  TENANT_B_ID,
  ZESTIVA_INTERNAL_TENANT_ID,
} from '../../backend/src/test-support/test-tenants.js';

export type CanonicalTenantUserFixture = {
  key: string;
  user: { id: string; role: 'consultant' | 'senior_consultant'; status: 'active' };
  tenant: { id: string; type: 'ZESTIVA_INTERNAL' | 'PRACTICE' };
  membership: { role: 'CONSULTANT' | 'SENIOR_CONSULTANT'; status: 'active' | 'removed' } | null;
  assignment: { required: boolean; tenantId: string | null };
  clientOwnership: { tenantId: string | null };
};

const fixture = (
  key: string,
  role: CanonicalTenantUserFixture['user']['role'],
  tenantId: string,
  tenantType: CanonicalTenantUserFixture['tenant']['type'],
  membershipStatus: 'active' | 'removed' | null,
): CanonicalTenantUserFixture => ({
  key,
  user: { id: `fixture-${key}`, role, status: 'active' },
  tenant: { id: tenantId, type: tenantType },
  membership: membershipStatus == null ? null : {
    role: role === 'senior_consultant' ? 'SENIOR_CONSULTANT' : 'CONSULTANT',
    status: membershipStatus,
  },
  assignment: { required: role === 'consultant', tenantId },
  clientOwnership: { tenantId },
});

export const legacyZestivaConsultant = () =>
  fixture('legacy-zestiva-consultant', 'consultant', ZESTIVA_INTERNAL_TENANT_ID, 'ZESTIVA_INTERNAL', null);

export const tenantAwareZestivaConsultant = () =>
  fixture('tenant-aware-zestiva-consultant', 'consultant', ZESTIVA_INTERNAL_TENANT_ID, 'ZESTIVA_INTERNAL', 'active');

export const zestivaSeniorConsultant = () =>
  fixture('zestiva-senior-consultant', 'senior_consultant', ZESTIVA_INTERNAL_TENANT_ID, 'ZESTIVA_INTERNAL', 'active');

export const tenantAConsultant = () =>
  fixture('tenant-a-consultant', 'consultant', TENANT_A_ID, 'PRACTICE', 'active');

export const tenantASeniorConsultant = () =>
  fixture('tenant-a-senior-consultant', 'senior_consultant', TENANT_A_ID, 'PRACTICE', 'active');

export const tenantBConsultant = () =>
  fixture('tenant-b-consultant', 'consultant', TENANT_B_ID, 'PRACTICE', 'active');

export const revokedTenantMember = () =>
  fixture('revoked-tenant-member', 'consultant', TENANT_A_ID, 'PRACTICE', 'removed');

export const assertCanonicalTenantFixture = (value: CanonicalTenantUserFixture) => {
  assert.ok(value.user.id, `${value.key}: user identity is required`);
  assert.equal(value.user.status, 'active', `${value.key}: user must be active`);
  assert.ok([ZESTIVA_INTERNAL_TENANT_ID, TENANT_A_ID, TENANT_B_ID].includes(value.tenant.id), `${value.key}: unknown tenant`);
  if (value.membership) {
    assert.equal(
      value.membership.role,
      value.user.role === 'senior_consultant' ? 'SENIOR_CONSULTANT' : 'CONSULTANT',
      `${value.key}: role and membership differ`,
    );
  }
  assert.equal(value.assignment.tenantId, value.clientOwnership.tenantId, `${value.key}: assignment and client tenant differ`);
  return value;
};
