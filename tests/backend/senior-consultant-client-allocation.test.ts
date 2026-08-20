import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageProfessionalAssignments } from '../../backend/src/modules/professional-assignments/professional-assignments.routes.js';

test('Senior Consultants can manage CAP-003 allocation while ordinary Consultants cannot', () => {
  assert.equal(canManageProfessionalAssignments('senior_consultant'), true);
  assert.equal(canManageProfessionalAssignments('admin'), true);
  assert.equal(canManageProfessionalAssignments('platform_owner'), true);
  assert.equal(canManageProfessionalAssignments('consultant'), false);
  assert.equal(canManageProfessionalAssignments('user'), false);
});
