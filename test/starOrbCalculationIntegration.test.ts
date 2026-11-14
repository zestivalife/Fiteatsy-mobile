import {
  activityScore,
  calmScore,
  cycleScore,
  nutritionScore,
  overallScore,
  sleepScore,
  stressRecoveryScore
} from '../packages/health-intelligence/src';

const calculated = (key: string, score: number) => ({
  ...calmScore({ hrv: score, stress: score, mindfulness: score }),
  key
});

describe('Star Orb governed calculations', () => {
  test('uses the exact activity weights and technical targets', () => {
    expect(activityScore({ steps: 5_000, stepGoal: 10_000, exerciseMinutes: 15, exerciseTarget: 30, balance: 50 }).score).toBe(50);
    expect(activityScore({ steps: 10_000, stepGoal: 10_000, exerciseMinutes: 30, exerciseTarget: 30, balance: 100 }).score).toBe(100);
  });

  test('clamps each component before weighting', () => {
    expect(activityScore({ steps: -100, stepGoal: 10_000, exerciseMinutes: 60, exerciseTarget: 30, balance: 120 }).score).toBe(60);
  });

  test('keeps an undefined governed child pending instead of reweighting it', () => {
    const score = activityScore({ steps: 8_000, stepGoal: 10_000, exerciseMinutes: 30, exerciseTarget: 30, balance: null });
    expect(score.score).toBeNull();
    expect(score.status).toBe('METHODOLOGY_PENDING');
    expect(score.methodologyPending).toEqual(['balance']);
  });

  test('does not redistribute a missing applicable overall domain', () => {
    const score = overallScore({
      activity: calculated('activity', 80),
      sleep: calculated('sleep', 80),
      nutrition: calculated('nutrition', 80),
      calm: calculated('calm', 80),
      stressRecovery: calculated('stressRecovery', 80)
    });
    expect(score.score).toBeNull();
    expect(score.status).toBe('INSUFFICIENT_DATA');
    expect(score.inputsMissing).toEqual(['cycle']);
  });

  test('redistributes only a genuinely not-applicable cycle weight', () => {
    const score = overallScore({
      activity: calculated('activity', 80),
      sleep: calculated('sleep', 80),
      nutrition: calculated('nutrition', 80),
      calm: calculated('calm', 80),
      stressRecovery: calculated('stressRecovery', 80),
      cycle: cycleScore({ applicable: false })
    });
    expect(score.score).toBe(80);
    expect(score.status).toBe('CALCULATED');
  });

  test('preserves stale freshness without altering a valid value', () => {
    const score = calmScore({ hrv: 70, stress: 60, mindfulness: 50, freshness: 'STALE' });
    expect(score.score).toBe(61);
    expect(score.status).toBe('STALE');
    expect(score.confidence).toBe('LOW');
  });

  test('all unresolved parent methods remain explicitly pending', () => {
    expect(sleepScore({ minutes: 480, targetMinutes: null }).status).toBe('METHODOLOGY_PENDING');
    expect(nutritionScore({ protein: null, hydration: null, foodQuality: null, clinical: null }).status).toBe('METHODOLOGY_PENDING');
    expect(stressRecoveryScore({ hrv: 70, sleep: 80, adaptation: null }).status).toBe('METHODOLOGY_PENDING');
    expect(calmScore({ hrv: null, stress: null, mindfulness: null }).methodologyPending).toEqual(['hrv', 'stress', 'mindfulness']);
  });
});
