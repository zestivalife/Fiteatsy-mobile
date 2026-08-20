import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLifecycleTransition,
  canApproveOrPublishDietPlan,
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

test('diet plan review lifecycle permits only the intended transitions', () => {
  assert.doesNotThrow(() => assertLifecycleTransition('draft', 'submitted_for_review'));
  assert.doesNotThrow(() => assertLifecycleTransition('submitted_for_review', 'changes_requested'));
  assert.doesNotThrow(() => assertLifecycleTransition('changes_requested', 'submitted_for_review'));
  assert.doesNotThrow(() => assertLifecycleTransition('submitted_for_review', 'approved'));
  assert.doesNotThrow(() => assertLifecycleTransition('approved', 'published'));
  assert.throws(() => assertLifecycleTransition('submitted_for_review', 'draft'));
  assert.throws(() => assertLifecycleTransition('published', 'draft'));
});
