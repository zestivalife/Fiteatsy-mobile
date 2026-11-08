import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routePath = new URL('../../backend/src/modules/external-consultants/external-consultant-access.routes.ts', import.meta.url);

test('external energy estimate delegates to the authoritative calculator and fails closed on consent', async () => {
  const source = await readFile(routePath, 'utf8');
  const route = source.slice(source.indexOf("post('/:userId/health-calculations/energy-estimate'"), source.indexOf("post('/:userId/common-food/resolve-option'"));
  assert.match(route, /calculateHealthMetrics\(input, calculatedAt\)/);
  assert.match(route, /fiteatsy\.external\.health\.calculate/);
  assert.match(route, /external_consultant_health_calculation/);
  assert.match(route, /scopes\.has\('PROFILE'\)/);
  assert.match(route, /scopes\.has\('MEASUREMENTS'\)/);
  assert.match(route, /HEALTH_CALCULATION_CONSENT_REQUIRED/);
  assert.match(route, /activityLevel: parsed\.data\.activityLevel/);
  assert.match(route, /metrics\.tdee\.formulaVersion/);
  assert.doesNotMatch(route, /10\s*\*|6\.25|ACTIVITY_MULTIPLIERS/);
});

test('energy estimate accepts only governed activity assumptions and bounded adjustment', async () => {
  const source = await readFile(routePath, 'utf8');
  assert.match(source, /z\.enum\(\['sedentary', 'light', 'moderate', 'very_active'\]\)/);
  assert.match(source, /energyAdjustmentKcal: z\.number\(\)\.int\(\)\.min\(-2000\)\.max\(2000\)/);
  assert.match(source, /adjustedDailyEnergy/);
  assert.match(source, /Cache-Control', 'no-store/);
});
