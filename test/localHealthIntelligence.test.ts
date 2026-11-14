import {
  calculateCanonicalHealthIntelligence,
  calculateCanonicalHealthIntelligenceFromObservations,
  markCanonicalSnapshotStale
} from '../src/services/localHealthIntelligence';

const completeInputs = {
  activity: { steps: 8_000, stepGoal: 10_000, exerciseMinutes: 30, exerciseTarget: 30, balance: 75, freshness: 'CURRENT' as const },
  sleep: { minutes: 420, targetMinutes: 480, deep: 70, rem: 80, efficiency: 90, consistency: 75, freshness: 'CURRENT' as const },
  nutrition: { protein: 80, hydration: 90, foodQuality: 70, clinical: 60, freshness: 'CURRENT' as const },
  calm: { hrv: 65, stress: 70, mindfulness: 80, freshness: 'CURRENT' as const },
  stressRecovery: { hrv: 65, sleep: 75, adaptation: 70, freshness: 'CURRENT' as const },
  recovery: { sleep: 75, body: 70, activityBalance: 80, lifestyle: 60, freshness: 'CURRENT' as const },
  cycle: { applicable: false }
};

describe('device-local canonical Health Intelligence', () => {
  it('is network-independent because online and offline invoke the same V1 authority', () => {
    const at = '2026-09-14T10:00:00.000Z';
    const online = calculateCanonicalHealthIntelligence(completeInputs, at);
    const offline = calculateCanonicalHealthIntelligence(completeInputs, at);
    expect(offline.scores).toEqual(online.scores);
    expect(offline.scores.healthIntelligence.score).not.toBeNull();
  });

  it('keeps unavailable clinical methodology pending without invented values', () => {
    const result = calculateCanonicalHealthIntelligenceFromObservations([
      { metricType: 'steps', value: 400, unit: 'count', measuredAtISO: '2026-09-14T05:00:00.000Z',
        sourceProvider: 'apple_health', sourceRecordId: 'a' },
      { metricType: 'steps', value: 600, unit: 'count', measuredAtISO: '2026-09-14T06:00:00.000Z',
        sourceProvider: 'apple_health', sourceRecordId: 'b' }
    ], { now: new Date('2026-09-14T08:00:00.000Z') });
    expect(result.scores.activity.status).toBe('METHODOLOGY_PENDING');
    expect(result.scores.activity.score).toBeNull();
    expect(result.scores.healthIntelligence.score).toBeNull();
  });

  it('maps Health Connect workout duration to the governed Exercise component without double counting', () => {
    const result = calculateCanonicalHealthIntelligenceFromObservations([
      { metricType: 'steps', value: 5_000, unit: 'count', measuredAtISO: '2026-09-14T05:00:00.000Z',
        sourceProvider: 'health_connect', sourceRecordId: 'steps' },
      { metricType: 'workout_minutes', value: 15, unit: 'min', measuredAtISO: '2026-09-14T06:00:00.000Z',
        startAtISO: '2026-09-14T05:45:00.000Z', endAtISO: '2026-09-14T06:00:00.000Z',
        sourceProvider: 'health_connect', sourceRecordId: 'workout' }
    ], { now: new Date('2026-09-14T08:00:00.000Z') });
    expect(result.scores.activity.inputsUsed).toEqual(['steps', 'exercise']);
    expect(result.scores.activity.inputsMissing).toEqual(['balance']);
    expect(result.scores.activity.score).toBeNull();
  });

  it('does not normalize hydration or mindfulness with unapproved historical targets', () => {
    const result = calculateCanonicalHealthIntelligenceFromObservations([
      { metricType: 'hydration_ml', value: 2_500, unit: 'ml', measuredAtISO: '2026-09-14T05:00:00.000Z',
        sourceProvider: 'apple_health', sourceRecordId: 'water' },
      { metricType: 'mindfulness_minutes', value: 15, unit: 'min', measuredAtISO: '2026-09-14T06:00:00.000Z',
        startAtISO: '2026-09-14T05:45:00.000Z', endAtISO: '2026-09-14T06:00:00.000Z',
        sourceProvider: 'apple_health', sourceRecordId: 'mindful' }
    ], { now: new Date('2026-09-14T08:00:00.000Z') });
    expect(result.scores.nutrition.inputsUsed).not.toContain('hydration');
    expect(result.scores.calm.inputsUsed).not.toContain('mindfulness');
  });

  it('propagates a governed calculated Sleep score into Recovery when no specialist override is supplied', () => {
    const result = calculateCanonicalHealthIntelligence({
      ...completeInputs,
      stressRecovery: { hrv: 65, adaptation: 70, freshness: 'CURRENT' },
      recovery: { body: 70, activityBalance: 80, lifestyle: 60, freshness: 'CURRENT' }
    });
    expect(result.scores.sleep.score).toBe(82);
    expect(result.scores.recovery.inputsUsed).toEqual(['sleep', 'body', 'activityBalance', 'lifestyle']);
    expect(result.scores.recovery.score).toBe(75.8);
  });

  it('marks a persisted canonical snapshot stale without changing its score or version', () => {
    const snapshot = calculateCanonicalHealthIntelligence(completeInputs, '2026-09-13T10:00:00.000Z');
    const stale = markCanonicalSnapshotStale(snapshot);
    expect(stale.scores.healthIntelligence.score).toBe(snapshot.scores.healthIntelligence.score);
    expect(stale.scores.healthIntelligence.status).toBe('STALE');
    expect(stale.calculationVersion).toBe('HEALTH_INTELLIGENCE_V1');
  });
});
