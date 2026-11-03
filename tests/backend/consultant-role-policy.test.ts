import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONSULTANT_DIET_WORKFLOW_ROLES,
  isConsultantDietWorkflowRole,
} from '../../backend/src/modules/auth/consultant-role.policy.js';

test('consultant diet workflow roles share one fail-closed contract', () => {
  assert.deepEqual(
    [...CONSULTANT_DIET_WORKFLOW_ROLES],
    ['consultant', 'provider', 'dietician', 'senior_consultant'],
  );
  for (const role of ['consultant', 'CONSULTANT', 'provider', 'dietician', 'senior_consultant']) {
    assert.equal(isConsultantDietWorkflowRole(role), true, role);
  }
  for (const role of [null, undefined, '', 'user', 'admin', 'super_admin', 'platform_owner', 'mentor', 'practitioner']) {
    assert.equal(isConsultantDietWorkflowRole(role), false, String(role));
  }
});
