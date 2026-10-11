import test from 'node:test';
import assert from 'node:assert/strict';
import { isClientDashboardSelfReadAllowed } from '../../backend/src/modules/auth/auth.middleware.js';

test('client dashboard session permits only exact published-plan self reads', () => {
  for (const path of [
    '/v1/platform/nutrition-plan',
    '/v1/platform/nutrition-plan?refresh=1',
    '/v1/platform/nutrition-plan/status',
    '/v1/platform/nutrition-plan/today',
  ]) {
    assert.equal(isClientDashboardSelfReadAllowed('GET', path, 'user'), true, path);
  }

  assert.equal(isClientDashboardSelfReadAllowed('POST', '/v1/platform/nutrition-plan', 'user'), false);
  assert.equal(isClientDashboardSelfReadAllowed('GET', '/v1/platform/nutrition-plan/other-client', 'user'), false);
  assert.equal(isClientDashboardSelfReadAllowed('GET', '/v1/platform/nutrition-plan', 'consultant'), false);
  assert.equal(isClientDashboardSelfReadAllowed('GET', '/v1/platform/users', 'user'), false);
});
