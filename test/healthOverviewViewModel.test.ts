import type { CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';
import { buildHealthTrend, categoryForMetric, displayUnit, displayValue, metricFreshness } from '../src/services/healthOverviewViewModel';

const aggregate = (healthDay: string, value: number, overrides: Partial<CanonicalDailyAggregate> = {}): CanonicalDailyAggregate => ({
  healthDay, metricType: 'steps', value, unit: 'count', method: 'DAILY_SUM', latest: value, average: value,
  minimum: value, maximum: value, sourceObservationIds: [`${healthDay}:${value}`], sourceProvider: 'apple_health',
  sourcePriority: 400, aggregateVersion: 'HEALTH_AGGREGATION_V2', lineageHash: `${healthDay}:${value}`,
  latestMeasuredAtISO: `${healthDay}T08:00:00.000Z`, calculatedAtISO: `${healthDay}T09:00:00.000Z`,
  aggregateSource: 'CANONICAL_RAW_RECOMPUTATION', rawLineageAvailable: true, ...overrides
});

describe('health overview view model', () => {
  test('maps all supported UI categories without changing canonical types', () => {
    expect(categoryForMetric('steps')).toBe('Activity');
    expect(categoryForMetric('sleep')).toBe('Sleep');
    expect(categoryForMetric('heart_rate')).toBe('Heart');
    expect(categoryForMetric('respiratory_rate')).toBe('Respiratory');
    expect(categoryForMetric('weight')).toBe('Body');
    expect(categoryForMetric('active_energy')).toBe('Energy');
    expect(categoryForMetric('hydration')).toBe('Nutrition & Hydration');
  });

  test('deduplicates the same canonical day and keeps the authoritative source', () => {
    const points = buildHealthTrend([
      aggregate('2026-11-15', 1000, { sourcePriority: 300 }),
      aggregate('2026-11-15', 2000, { sourcePriority: 600, aggregateSource: 'HEALTHKIT_STATISTICS' })
    ], 'steps', 'W', Date.parse('2026-11-17T12:00:00+05:30'));
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(2000);
  });

  test('uses calendar buckets across the DST transition and bounds yearly output', () => {
    const days = Array.from({ length: 370 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 10, 13 + index));
      return aggregate(date.toISOString().slice(0, 10), index + 1);
    });
    const weekly = buildHealthTrend(days, 'steps', 'W', Date.parse('2026-03-10T12:00:00-04:00'));
    expect(weekly.length).toBeLessThanOrEqual(7);
    const yearly = buildHealthTrend(days, 'steps', 'Y', Date.parse('2026-11-17T12:00:00+05:30'));
    expect(yearly.length).toBeLessThanOrEqual(12);
  });

  test('preserves truthful missing and stale states and converts display-only sleep units', () => {
    const base = { supported: true, queryState: 'NO_VISIBLE_DATA', observation: null, definition: { metricKey: 'steps' } } as any;
    expect(metricFreshness(base)).toBe('NO_RECORDS');
    expect(metricFreshness({ ...base, observation: { measuredAtISO: '2026-01-01T00:00:00Z' } }, Date.parse('2026-11-17T00:00:00Z'))).toBe('STALE');
    expect(displayValue('sleep_minutes', 480)).toBe(8);
    expect(displayUnit('sleep_minutes', 'min')).toBe('hr');
  });
});
