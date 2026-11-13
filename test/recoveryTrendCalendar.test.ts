import { buildSevenDayRecoveryTrend } from '../src/services/recoveryTrend';
import type { HealthScore } from '../src/services/healthIntelligenceService';

const score = (calculatedAtISO: string, scoreValue: number, scoreStatus: HealthScore['scoreStatus'] = 'calculated'): HealthScore => ({
  id: `recovery-${calculatedAtISO}`,
  fiteatsyClientId: 'client-test',
  scoreType: 'recovery',
  scoreValue,
  scoreStatus,
  confidence: 0.8,
  inputSummary: {},
  calculationVersion: 'HEALTH_INTELLIGENCE_V1',
  calculatedAtISO
});

describe('seven-day Recovery calendar alignment', () => {
  test('keeps missing days empty and maps real scores to their actual local calendar day', () => {
    const trend = buildSevenDayRecoveryTrend([
      score('2026-11-09T08:00:00+05:30', 64),
      score('2026-11-11T08:00:00+05:30', 72),
      score('2026-11-11T18:00:00+05:30', 76),
      score('2026-11-12T08:00:00+05:30', 99, 'insufficient_data')
    ], new Date('2026-11-13T12:00:00+05:30'));

    expect(trend).toHaveLength(7);
    expect(trend.map((item) => item.dayKey)).toEqual([
      '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'
    ]);
    expect(trend.map((item) => item.score)).toEqual([null, null, 64, null, 76, null, null]);
  });

  test('clamps only calculated finite values without inventing absent history', () => {
    const trend = buildSevenDayRecoveryTrend([
      score('2026-11-13T08:00:00+05:30', 140),
      score('invalid', 50)
    ], new Date('2026-11-13T12:00:00+05:30'));
    expect(trend.at(-1)?.score).toBe(100);
    expect(trend.filter((item) => item.score != null)).toHaveLength(1);
  });
});
