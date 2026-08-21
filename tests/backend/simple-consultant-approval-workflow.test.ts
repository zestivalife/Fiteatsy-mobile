import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLifecycleTransition,
  assertPublishVersionEligibility,
  canApproveOrPublishDietPlan,
  canPublishAssignedDietPlan,
  classifyDietPlanDeliveryLifecycle,
} from '../../backend/src/modules/nutrition/nutrition.service.js';
import type { AuthenticatedAccount } from '../../backend/src/modules/auth/auth.repository.js';

const account = (role: string) => ({
  accountId: `${role}-account`,
  user: { id: `${role}-user`, role },
}) as AuthenticatedAccount;

test('only Senior Consultant and platform authority roles can approve or publish', () => {
  assert.equal(canApproveOrPublishDietPlan(account('senior_consultant')), true);
  assert.equal(canApproveOrPublishDietPlan(account('platform_owner')), true);
  assert.equal(canApproveOrPublishDietPlan(account('admin')), true);
  assert.equal(canApproveOrPublishDietPlan(account('consultant')), false);
});

test('publication allows the assigned Consultant but denies wrong or unassigned Consultants', () => {
  const assigned = account('consultant');
  assert.equal(canPublishAssignedDietPlan(assigned, assigned.accountId), true);
  assert.equal(canPublishAssignedDietPlan(assigned, 'another-consultant'), false);
  assert.equal(canPublishAssignedDietPlan(assigned, null), false);
  assert.equal(canPublishAssignedDietPlan(account('senior_consultant'), null), true);
});

test('only the exact approved version is publishable and repeat publication is idempotent', () => {
  const base = {
    dietPlanId: 'plan-1',
    requestedVersionId: 'version-1',
    requestedVersionDietPlanId: 'plan-1',
    latestPublishedVersionId: null,
  };

  assert.equal(assertPublishVersionEligibility({ ...base, requestedVersionLifecycle: 'approved' }), 'publish');
  assert.throws(() => assertPublishVersionEligibility({ ...base, requestedVersionLifecycle: 'draft' }), /exact Senior-Consultant-approved version/);
  assert.throws(() => assertPublishVersionEligibility({ ...base, requestedVersionLifecycle: 'submitted_for_review' }), /exact Senior-Consultant-approved version/);
  assert.throws(() => assertPublishVersionEligibility({ ...base, requestedVersionLifecycle: 'changes_requested' }), /exact Senior-Consultant-approved version/);
  assert.throws(() => assertPublishVersionEligibility({ ...base, requestedVersionDietPlanId: 'plan-2', requestedVersionLifecycle: 'approved' }), /does not belong/);
  assert.equal(assertPublishVersionEligibility({ ...base, latestPublishedVersionId: 'version-1', requestedVersionLifecycle: 'published' }), 'already_published');
});

test('an approved historical version remains publishable while a different draft is current', () => {
  assert.equal(assertPublishVersionEligibility({
    dietPlanId: 'plan-1',
    requestedVersionId: 'version-1',
    requestedVersionDietPlanId: 'plan-1',
    requestedVersionLifecycle: 'approved',
    latestPublishedVersionId: null,
  }), 'publish');
});

test('an approved update can replace an older published version explicitly', () => {
  assert.equal(assertPublishVersionEligibility({
    dietPlanId: 'plan-1',
    requestedVersionId: 'version-2',
    requestedVersionDietPlanId: 'plan-1',
    requestedVersionLifecycle: 'approved',
    latestPublishedVersionId: 'version-1',
  }), 'publish');
});

test('client delivery stays active on the published version while a newer draft is edited', () => {
  assert.equal(classifyDietPlanDeliveryLifecycle({
    planStatus: 'draft',
    currentLifecycle: 'draft',
    latestPublishedVersionId: 'version-1',
    publishedVersionId: 'version-1',
    publishedLifecycle: 'published',
  }), 'ACTIVE_PUBLISHED');
  assert.equal(classifyDietPlanDeliveryLifecycle({
    planStatus: 'approved',
    currentLifecycle: 'approved',
    latestPublishedVersionId: null,
    publishedVersionId: null,
    publishedLifecycle: null,
  }), 'APPROVED_NOT_PUBLISHED');
});

test('diet plan review lifecycle permits only the intended transitions', () => {
  assert.doesNotThrow(() => assertLifecycleTransition('draft', 'submitted_for_review'));
  assert.doesNotThrow(() => assertLifecycleTransition('submitted_for_review', 'changes_requested'));
  assert.doesNotThrow(() => assertLifecycleTransition('changes_requested', 'submitted_for_review'));
  assert.doesNotThrow(() => assertLifecycleTransition('submitted_for_review', 'approved'));
  assert.doesNotThrow(() => assertLifecycleTransition('approved', 'published'));
  assert.throws(() => assertLifecycleTransition('submitted_for_review', 'draft'));
  assert.throws(() => assertLifecycleTransition('published', 'draft'));
});
