import {
  STAR_ORB_METHOD_REGISTRY,
  STAR_ORB_METHODOLOGY_ID,
  calculateActivityBalanceCandidate,
  calculateSleepConsistencyCandidate,
  goalScore
} from '../packages/health-intelligence/src';

describe('Star Orb Methodology V1 governance', () => {
  test('calculates approved goal attainment only with an explicit valid goal', () => {
    expect(goalScore(5_000, 10_000)).toBe(50);
    expect(goalScore(12_000, 10_000)).toBe(100);
    expect(goalScore(-1, 10_000)).toBe(0);
    expect(goalScore(5_000, null)).toBeNull();
    expect(goalScore(5_000, 0)).toBeNull();
  });

  test('keeps activity balance candidate isolated from production activation', () => {
    const result = calculateActivityBalanceCandidate({
      dailyActivityLoad: Array(14).fill(50),
      dailyRecoveryOrRest: Array(7).fill(80)
    });
    expect(result).toMatchObject({
      methodologyId: STAR_ORB_METHODOLOGY_ID,
      activation: 'CANDIDATE_ONLY',
      status: 'CANDIDATE_CALCULATED',
      value: 95
    });
    expect(STAR_ORB_METHOD_REGISTRY.activityBalance.activation).toBe('CANDIDATE_ONLY');
  });

  test('activity balance candidate fails closed without its complete history', () => {
    expect(calculateActivityBalanceCandidate({
      dailyActivityLoad: Array(13).fill(50),
      dailyRecoveryOrRest: Array(6).fill(80)
    })).toMatchObject({ value: null, status: 'INSUFFICIENT_DATA' });
  });

  test('sleep consistency handles midnight with circular local time', () => {
    const result = calculateSleepConsistencyCandidate({
      localBedtimeMinute: [1435, 5, 0, 10, 1430, 2, 1438],
      localWakeMinute: [420, 425, 415, 430, 418, 422, 420]
    });
    expect(result.status).toBe('CANDIDATE_CALCULATED');
    expect(result.activation).toBe('CANDIDATE_ONLY');
    expect(result.value).toBeGreaterThan(90);
  });

  test('sleep consistency rejects invalid or incomplete local sessions', () => {
    expect(calculateSleepConsistencyCandidate({
      localBedtimeMinute: Array(6).fill(1380), localWakeMinute: Array(6).fill(420)
    }).value).toBeNull();
    expect(calculateSleepConsistencyCandidate({
      localBedtimeMinute: Array(7).fill(1440), localWakeMinute: Array(7).fill(420)
    }).value).toBeNull();
  });
});
