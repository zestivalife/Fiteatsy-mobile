import { buildSevenDayHealthHistory, buildSleepRecommendation, calculateHealthStreak } from '../src/services/healthHistoryService';
import type { WearableSyncPayload } from '../src/types';

const payload = (observations: WearableSyncPayload['observations']): WearableSyncPayload => ({
  deviceId: 'device', brand: 'Apple', model: 'Watch', provider: 'Apple Health', syncedAtISO: '2026-10-27T12:00:00.000Z', source: 'api',
  metrics: { heartRateAvg: null, sleepHours: null, hydrationLiters: null, focusMinutes: null, breathingMinutes: null, movementMinutes: null },
  dataQuality: { confidence: 1, isEstimated: false, warnings: [] }, observations
});

describe('healthHistoryService', () => {
  it('builds scores only from real daily observations and preserves missing days', () => {
    const result = buildSevenDayHealthHistory(payload([
      { metricType: 'sleep_minutes', value: 450, unit: 'min', measuredAtISO: '2026-10-27T06:00:00.000Z', sourceProvider: 'apple_health' },
      { metricType: 'hrv_ms', value: 60, unit: 'ms', measuredAtISO: '2026-10-27T07:00:00.000Z', sourceProvider: 'apple_health' },
      { metricType: 'steps', value: 2000, unit: 'count', measuredAtISO: '2026-10-27T10:00:00.000Z', sourceProvider: 'apple_health' }
    ]), new Date('2026-10-27T12:00:00'));
    expect(result).toHaveLength(7);
    expect(result[0].recoveryScore).toBeNull();
    expect(result[6].steps).toBe(2000);
    expect(result[6].recoveryScore).not.toBeNull();
  });

  it('creates an actionable sleep recommendation and streak', () => {
    const result = buildSevenDayHealthHistory(payload([
      { metricType: 'sleep_minutes', value: 360, unit: 'min', measuredAtISO: '2026-10-26T06:00:00.000Z', sourceProvider: 'apple_health' },
      { metricType: 'steps', value: 1000, unit: 'count', measuredAtISO: '2026-10-26T10:00:00.000Z', sourceProvider: 'apple_health' },
      { metricType: 'sleep_minutes', value: 390, unit: 'min', measuredAtISO: '2026-10-27T06:00:00.000Z', sourceProvider: 'apple_health' },
      { metricType: 'steps', value: 1200, unit: 'count', measuredAtISO: '2026-10-27T10:00:00.000Z', sourceProvider: 'apple_health' }
    ]), new Date('2026-10-27T12:00:00'));
    expect(calculateHealthStreak(result)).toBe(2);
    expect(buildSleepRecommendation(result)).toContain('aim for at least 7 hours');
  });
});
