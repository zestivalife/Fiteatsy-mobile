import assert from 'node:assert/strict';
import test from 'node:test';
import { isConsultantDashboardRouteAllowed } from '../../backend/src/modules/auth/auth.middleware.js';

test('dashboard bridge session may bootstrap its canonical tenant through auth/me', () => {
  assert.equal(isConsultantDashboardRouteAllowed('/v1/auth/me', 'consultant'), true);
  assert.equal(isConsultantDashboardRouteAllowed('/v1/auth/me?refresh=1', 'consultant'), true);
});

test('dashboard bridge scope remains fail closed outside governed workspace routes', () => {
  assert.equal(isConsultantDashboardRouteAllowed('/v1/admin/users', 'consultant'), false);
  assert.equal(isConsultantDashboardRouteAllowed('/v1/platform/tenants', 'consultant'), false);
  assert.equal(isConsultantDashboardRouteAllowed('/v1/professional-assignments', 'consultant'), false);
  assert.equal(isConsultantDashboardRouteAllowed('/v1/professional-assignments', 'senior_consultant'), true);
});
