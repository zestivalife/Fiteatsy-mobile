import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCanonicalHealthObservations } from '../../packages/health-intelligence/src/index.js';

const observation = (
  id: string,
  value: number,
  sourceApplication: string,
  measuredAtISO = '2026-08-25T04:00:00.000Z'
) => ({
  id,
  userId: 'user-1',
  clientId: 'client-1',
  metricType: 'steps',
  value,
  unit: 'count',
  measuredAtISO,
  sourceProvider: 'health_connect',
  sourceRecordId: id,
  syncKey: id,
  qualityStatus: 'accepted',
  createdAtISO: '2026-08-25T05:00:00.000Z',
  sourceMetadata: { sourceApplication }
});

test('canonical aggregation prefers the governed watch source without double-counting phone overlap', () => {
  const normalized = aggregateCanonicalHealthObservations([
    observation('watch-1', 3000, 'com.watch'),
    observation('watch-2', 4000, 'com.watch'),
    observation('phone-1', 6800, 'com.phone')
  ], { fallbackOffsetMinutes: 330, nowMs: Date.parse('2026-08-25T08:00:00.000Z') });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].value, 7000);
  assert.equal(normalized[0].sourcePriority, 500);
});

test('canonical business-day boundary keeps observations on their correct health day', () => {
  const normalized = aggregateCanonicalHealthObservations([
    observation('day-1', 2000, 'com.watch', '2026-08-24T18:29:59.000Z'),
    observation('day-2', 2500, 'com.watch', '2026-08-24T18:30:00.000Z')
  ], { fallbackOffsetMinutes: 330, nowMs: Date.parse('2026-08-25T08:00:00.000Z') });

  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized.map((item) => item.value).sort((a, b) => a - b), [2000, 2500]);
});
