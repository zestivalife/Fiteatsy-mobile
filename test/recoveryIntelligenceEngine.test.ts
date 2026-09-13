import { buildRecoveryIntelligence } from '../src/services/recoveryIntelligenceEngine';
import { DailyCheckIn, HealthObservationDraft, WellnessSnapshot } from '../src/types';

const baseWellness: WellnessSnapshot = {
  focusMinutes: 38,
  breathingMinutes: 9,
  movementMinutes: 24,
  hydrationLiters: 2.2,
  hydrationGoalLiters: 3,
  heartRateAvg: 74,
  sleepHours: 7.1,
  moodScore: 72,
  recoveryScore: 70,
  nourishmentScore: 68,
  wellnessScore: 69,
  hrvStatus: 'Normal',
  stressScore: 36,
  availability: 'available',
  lastUpdatedISO: '2026-08-23T06:30:00.000Z',
  source: 'test'
};

const makeCheckIn = (day: number, mood: 1 | 2 | 3 | 4 | 5, energy: 1 | 2 | 3 | 4 | 5, sleepQuality: 1 | 2 | 3 | 4 | 5): DailyCheckIn => ({
  dateISO: new Date(`2026-05-${String(day).padStart(2, '0')}T08:00:00.000Z`).toISOString(),
  mood,
  energy,
  sleepQuality
});

describe('recoveryIntelligenceEngine', () => {
  const observedAt = new Date().toISOString();
  const observation = (metricType:string,value:number,unit:string):HealthObservationDraft => ({metricType,value,unit,measuredAtISO:observedAt,sourceProvider:'HEALTH_CONNECT'});
  const healthObservations = [observation('steps',8000,'count'),observation('sleep_minutes',444,'min'),observation('resting_heart_rate',63,'bpm'),observation('hrv_rmssd_ms',46,'ms'),observation('workout_minutes',34,'min')];

  it('returns context without becoming a second canonical score authority', () => {
    const output = buildRecoveryIntelligence({
      wellness: baseWellness,
      checkIns: [makeCheckIn(12, 4, 4, 4), makeCheckIn(13, 4, 3, 4), makeCheckIn(14, 3, 4, 3)],
      medication: { scheduledToday: 3, takenToday: 2, pendingToday: 1, skippedToday: 0, missedToday: 0 },
      healthObservations
    });

    expect(output.recoveryScore).toBeNull();
    expect(output.calmScore).toBeNull();
    expect(output.stressRecoveryScore).toBeNull();
    expect(output.recoveryDrivers.length).toBeGreaterThanOrEqual(6);
    expect(output.trendValues7d).toEqual([80, 73, 67]);
    expect(output.highestImpactActions.length).toBeGreaterThan(0);
    expect(output.whyChanged.length).toBeGreaterThan(0);
  });

  it('handles missing-data and no-wearable states', () => {
    const output = buildRecoveryIntelligence({
      wellness: { ...baseWellness, sleepHours: 5.2, movementMinutes: 6, hydrationLiters: 0.8, focusMinutes: 4, breathingMinutes: 0, stressScore: 71 },
      checkIns: [],
      medication: { scheduledToday: 0, takenToday: 0, pendingToday: 0, skippedToday: 0, missedToday: 0 },
      healthObservations: []
    });

    expect(output.isCalibrating).toBe(true);
    expect(output.recoveryScore).toBeNull();
    expect(output.blockers.length).toBeGreaterThan(0);
    expect(output.contextualInsights[0]).toContain('Recovery insights improve');
  });

  it('retains approved PSS-10 input without deriving a competing stress-recovery score', () => {
    const output = buildRecoveryIntelligence({
      wellness: baseWellness,
      checkIns: [],
      medication: { scheduledToday: 0, takenToday: 0, pendingToday: 0, skippedToday: 0, missedToday: 0 },
      healthObservations: [],
      pss10Results: [
        { rawScore: 20, completedAtISO: '2026-09-05T10:00:00.000Z' },
        { rawScore: 10, completedAtISO: '2026-09-06T10:00:00.000Z' }
      ]
    });
    expect(output.questionnaireAvailable).toBe(true);
    expect(output.pss10Score).toBe(10);
    expect(output.stressRecoveryScore).toBeNull();
    expect(output.trendValues7d).toEqual([50, 75]);
  });
});
