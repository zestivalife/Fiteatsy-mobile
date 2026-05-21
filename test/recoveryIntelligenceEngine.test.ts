import { buildRecoveryIntelligence } from '../src/services/recoveryIntelligenceEngine';
import { DailyCheckIn, WellnessSnapshot } from '../src/types';

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
  stressScore: 36
};

const makeCheckIn = (day: number, mood: 1 | 2 | 3 | 4 | 5, energy: 1 | 2 | 3 | 4 | 5, sleepQuality: 1 | 2 | 3 | 4 | 5): DailyCheckIn => ({
  dateISO: new Date(`2026-05-${String(day).padStart(2, '0')}T08:00:00.000Z`).toISOString(),
  mood,
  energy,
  sleepQuality
});

describe('recoveryIntelligenceEngine', () => {
  it('returns explainable, bounded recovery output', () => {
    const output = buildRecoveryIntelligence({
      wellness: baseWellness,
      checkIns: [makeCheckIn(12, 4, 4, 4), makeCheckIn(13, 4, 3, 4), makeCheckIn(14, 3, 4, 3)],
      medication: { scheduledToday: 3, takenToday: 2, pendingToday: 1, skippedToday: 0, missedToday: 0 },
      hasWearable: true
    });

    expect(output.recoveryScore).toBeGreaterThanOrEqual(0);
    expect(output.recoveryScore).toBeLessThanOrEqual(100);
    expect(output.recoveryDrivers).toHaveLength(8);
    expect(output.trendValues7d).toHaveLength(7);
    expect(output.highestImpactActions.length).toBeGreaterThan(0);
    expect(output.whyChanged.length).toBeGreaterThan(0);
  });

  it('handles missing-data and no-wearable states', () => {
    const output = buildRecoveryIntelligence({
      wellness: { ...baseWellness, sleepHours: 5.2, movementMinutes: 6, hydrationLiters: 0.8, focusMinutes: 4, breathingMinutes: 0, stressScore: 71 },
      checkIns: [],
      medication: { scheduledToday: 0, takenToday: 0, pendingToday: 0, skippedToday: 0, missedToday: 0 },
      hasWearable: false
    });

    expect(output.recoveryScore).toBeGreaterThanOrEqual(0);
    expect(output.recoveryScore).toBeLessThanOrEqual(100);
    expect(output.blockers.length).toBeGreaterThan(0);
    expect(output.contextualInsights[0]).toContain('Recovery');
  });
});
