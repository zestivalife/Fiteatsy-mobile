import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthIntelligenceV1 } from '../../backend/src/modules/intelligence/health-intelligence-projection.js';

const observation = (metricType: string, value: number, measuredAtISO: string) => ({
  id: `${metricType}-${measuredAtISO}`,
  userId: 'account-1',
  clientId: 'client-1',
  metricType,
  value,
  unit: metricType === 'steps' ? 'count' : metricType === 'hydration_ml' ? 'ml' : 'min',
  measuredAtISO,
  sourceProvider: 'apple_health',
  sourceRecordId: `${metricType}-record`,
  syncKey: `${metricType}-key`,
  qualityStatus: 'accepted',
  createdAtISO: measuredAtISO,
  sourceMetadata: null,
  startAtISO: null,
  endAtISO: null,
  timezoneOffsetMinutes: 0,
  providerUpdatedAtISO: null,
  providerVersion: null,
  deletedAtISO: null
});

test('projection preserves Steps and Exercise while unconfigured goals and Activity Balance remain pending', () => {
  const projection = buildHealthIntelligenceV1([
    observation('steps', 5_000, '2026-11-17T08:00:00.000Z'),
    observation('workout_minutes', 15, '2026-11-17T09:00:00.000Z')
  ] as never, '2026-11-17');
  assert.equal(projection.aggregates.find(item => item.metric === 'steps')?.value, 5_000);
  assert.equal(projection.aggregates.find(item => item.metric === 'workout_minutes')?.value, 15);
  assert.deepEqual(projection.scores.activity.inputsUsed, []);
  assert.deepEqual(projection.scores.activity.methodologyPending, ['steps', 'exercise', 'balance']);
  assert.equal(projection.scores.activity.score, null);
});

test('projection preserves raw hydration without the unapproved 2500 ml score target', () => {
  const projection = buildHealthIntelligenceV1([
    observation('hydration_ml', 2_500, '2026-11-17T08:00:00.000Z')
  ] as never, '2026-11-17');
  assert.equal(projection.scores.nutrition.score, null);
  assert.deepEqual(projection.scores.nutrition.inputsUsed, []);
  assert.ok(projection.scores.nutrition.methodologyPending.includes('hydration'));
});

test('projection reports the newest source timestamp independent of input order', () => {
  const projection = buildHealthIntelligenceV1([
    observation('steps', 1_000, '2026-11-17T09:00:00.000Z'),
    observation('steps', 2_000, '2026-11-17T10:00:00.000Z')
  ] as never, '2026-11-17');
  assert.equal(projection.latestSourceReadAt, '2026-11-17T10:00:00.000Z');
});
