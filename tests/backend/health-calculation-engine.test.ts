import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdditiveObservationsForScoring } from '../../backend/src/modules/intelligence/health-calculation-engine.js';

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

test('additive Health Connect fragments aggregate by IST day without double-counting source streams', () => {
  const normalized = normalizeAdditiveObservationsForScoring([
    observation('watch-1', 3000, 'com.watch'),
    observation('watch-2', 4000, 'com.watch'),
    observation('phone-1', 6800, 'com.phone')
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].value, 7000);
  assert.equal(normalized[0].sourceMetadata?.sourceApplication, 'com.watch');
});

test('IST business-day boundary keeps additive observations on their correct day', () => {
  const normalized = normalizeAdditiveObservationsForScoring([
    observation('day-1', 2000, 'com.watch', '2026-08-24T18:29:59.000Z'),
    observation('day-2', 2500, 'com.watch', '2026-08-24T18:30:00.000Z')
  ]);

  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized.map((item) => item.value).sort((a, b) => a - b), [2000, 2500]);
});
