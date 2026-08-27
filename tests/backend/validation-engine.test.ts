import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertHealthProfile } from '../../backend/src/modules/platform/platform.service.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { createReportRecord, updateReportStatus } from '../../backend/src/modules/reports/reports.store.js';
import { resolveVerifiedAccountIdentity } from '../../backend/src/modules/auth/auth.repository.js';
import { ClientOwnershipContext } from '../../backend/src/modules/platform/platform.types.js';
import { canonicalCompleteHealthProfile } from '../helpers/canonicalFixtures.js';

test.beforeEach(async () => {
  await resetBackendStateForTests();
});

const createOwner = async (label: string): Promise<ClientOwnershipContext> => {
  const { user, client } = await resolveVerifiedAccountIdentity({
    name: `${label} User`,
    email: `${label}@example.com`,
    mobileNumber: `+9198768${label.replace(/\D/g, '').padStart(5, '0').slice(-5)}`
  });
  return { accountId: user.id, clientId: client.id };
};

test('validation engine keeps incomplete profiles below AI readiness threshold', async () => {
  const owner = await createOwner('validation-incomplete-001');
  const bundle = await upsertHealthProfile(owner, {
    gender: 'Female',
    heightCm: 160,
  });
  assert.equal(bundle.nutrition.aiReady, false);
  assert.ok(bundle.nutrition.missingFields.length > 0);
  assert.equal(bundle.careCase.currentStage, 'health_profile_pending');
});

test('validation engine upgrades complete profiles with reports into consultant workflow', async () => {
  const owner = await createOwner('validation-ready-002');
  const report = await createReportRecord({
    userId: owner.accountId,
    clientId: owner.clientId,
    fileName: 'ready.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
  });
  await updateReportStatus(report.id, 'PUBLISHED');
  const bundle = await upsertHealthProfile(owner, canonicalCompleteHealthProfile());
  assert.equal(bundle.nutrition.aiReady, true);
  assert.equal(bundle.careCase.currentStage, 'consultant_review');
});
