import { baselineCopy, buildSleepStagePresentation, currentDayAggregate, hasCanonicalMetricData } from '../src/services/healthPresentationState';
import type { CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';

const row = (healthDay: string, metricType: string, value: number): CanonicalDailyAggregate => ({
  healthDay, metricType, value, unit: 'min', method: 'SESSION_AGGREGATE', latest: value,
  average: value, minimum: value, maximum: value, sourceObservationIds: [`${healthDay}:${metricType}`],
  sourceProvider: 'apple_health', sourcePriority: 300, aggregateVersion: 'HEALTH_AGGREGATION_V2',
  lineageHash: `${healthDay}:${metricType}`, latestMeasuredAtISO: `${healthDay}T08:00:00.000Z`,
  calculatedAtISO: `${healthDay}T09:00:00.000Z`, aggregateSource: 'CANONICAL_RAW_RECOMPUTATION',
  rawLineageAvailable: true
});

describe('post-sync health presentation integrity', () => {
  it('never labels raw sleep-stage minutes as percentages', () => {
    const result = buildSleepStagePresentation([
      row('2026-09-20', 'sleep_minutes', 336),
      row('2026-09-20', 'sleep_deep_minutes', 34),
      row('2026-09-20', 'sleep_rem_minutes', 58),
      row('2026-09-20', 'sleep_core_minutes', 244),
      row('2026-09-20', 'sleep_awake_minutes', 50)
    ]);
    expect(result.stages).toEqual(['Deep 9%', 'REM 15%', 'Light 63%', 'Awake 13%']);
    expect(result.stages.join(' ')).not.toContain('244%');
  });

  it('hides stage percentages when total sleep is unavailable or on another day', () => {
    expect(buildSleepStagePresentation([row('2026-09-20', 'sleep_core_minutes', 244)]).stages).toEqual([]);
    expect(buildSleepStagePresentation([
      row('2026-09-20', 'sleep_minutes', 300),
      row('2026-09-19', 'sleep_core_minutes', 244)
    ]).stages).toEqual([]);
  });

  it('distinguishes current metric data from an incomplete baseline', () => {
    const aggregates = [row('2026-09-20', 'steps', 4938)];
    expect(hasCanonicalMetricData(aggregates, ['steps'])).toBe(true);
    expect(baselineCopy(aggregates, 'steps', 7)).toBe('Building your baseline');
    expect(baselineCopy([...aggregates, row('2026-09-19', 'steps', 4000)], 'steps', 7)).toBe('4,469');
  });

  it('does not use the latest historical aggregate as today\'s value', () => {
    const aggregates = [row('2026-08-04', 'steps', 1750), row('2026-09-20', 'steps', 513)];
    expect(currentDayAggregate(aggregates, ['steps'], Date.parse('2026-09-20T12:00:00.000Z'), 0)?.value).toBe(513);
    expect(currentDayAggregate(aggregates, ['steps'], Date.parse('2026-09-21T12:00:00.000Z'), 0)).toBeNull();
  });
});
