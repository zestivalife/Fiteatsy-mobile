import assert from 'node:assert/strict';
import { createCommonFoodAuthenticatedFixture, provisionQaIdentity } from './commonFoodFixtures.js';

export const createConsultantLifecycleFixture = async (baseUrl: string, adminToken: string) => {
  const consultant = await provisionQaIdentity(baseUrl, adminToken, 'consultant', 'lifecycle-consultant');
  const seniorConsultant = await provisionQaIdentity(baseUrl, adminToken, 'senior_consultant', 'lifecycle-senior');
  const clientFixture = await createCommonFoodAuthenticatedFixture({
    baseUrl,
    adminToken,
    consultant,
    marker: 'lifecycle-client',
    dietType: 'vegetarian',
  });
  assert.ok(clientFixture.tenant, 'Consultant lifecycle fixture requires an explicit tenant');
  assert.equal(clientFixture.assignment.status, 'active', 'Consultant lifecycle fixture requires an active assignment');
  assert.equal(seniorConsultant.user.role, 'senior_consultant', 'Consultant lifecycle fixture requires Senior review authority');
  return {
    tenant: clientFixture.tenant,
    consultant,
    seniorConsultant,
    client: clientFixture.client,
    assignment: clientFixture.assignment,
    reviewAuthority: seniorConsultant,
  };
};
