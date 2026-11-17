export const STAR_ORB_METHODOLOGY_ID = 'FITEATSY_STAR_ORB_V1' as const;
export const STAR_ORB_METHODOLOGY_VERSION = '1.0.0-candidate.1' as const;

export type MethodologyLevel = 'LEVEL_A_APPROVED' | 'LEVEL_B_CANDIDATE' | 'LEVEL_C_CLINICAL_REVIEW';
export type MethodologyActivation = 'ACTIVE' | 'CANDIDATE_ONLY' | 'FAIL_CLOSED';

export const STAR_ORB_METHOD_REGISTRY = {
  stepsGoalAttainment: { level: 'LEVEL_A_APPROVED', activation: 'ACTIVE', requiresExplicitGoal: true },
  exerciseGoalAttainment: { level: 'LEVEL_A_APPROVED', activation: 'ACTIVE', requiresExplicitGoal: true },
  activityBalance: { level: 'LEVEL_B_CANDIDATE', activation: 'CANDIDATE_ONLY', minimumHistoryDays: 14 },
  sleepConsistency: { level: 'LEVEL_B_CANDIDATE', activation: 'CANDIDATE_ONLY', minimumHistoryDays: 7 },
  sleepDuration: { level: 'LEVEL_C_CLINICAL_REVIEW', activation: 'FAIL_CLOSED', requiresExplicitGoal: true },
  sleepQuality: { level: 'LEVEL_C_CLINICAL_REVIEW', activation: 'FAIL_CLOSED' },
  nutrition: { level: 'LEVEL_C_CLINICAL_REVIEW', activation: 'FAIL_CLOSED' },
  calm: { level: 'LEVEL_C_CLINICAL_REVIEW', activation: 'FAIL_CLOSED' },
  mind: { level: 'LEVEL_C_CLINICAL_REVIEW', activation: 'FAIL_CLOSED' },
  bodyRecovery: { level: 'LEVEL_C_CLINICAL_REVIEW', activation: 'FAIL_CLOSED' },
  recovery: { level: 'LEVEL_C_CLINICAL_REVIEW', activation: 'FAIL_CLOSED' },
  overall: { level: 'LEVEL_C_CLINICAL_REVIEW', activation: 'FAIL_CLOSED' }
} as const satisfies Record<string, { level: MethodologyLevel; activation: MethodologyActivation; minimumHistoryDays?: number; requiresExplicitGoal?: boolean }>;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export type CandidateResult = {
  methodologyId: typeof STAR_ORB_METHODOLOGY_ID;
  methodologyVersion: typeof STAR_ORB_METHODOLOGY_VERSION;
  activation: 'CANDIDATE_ONLY';
  value: number | null;
  status: 'CANDIDATE_CALCULATED' | 'INSUFFICIENT_DATA';
  missingDependencies: string[];
};
const candidateResult = (value: number | null, missingDependencies: string[]): CandidateResult => ({
  methodologyId: STAR_ORB_METHODOLOGY_ID,
  methodologyVersion: STAR_ORB_METHODOLOGY_VERSION,
  activation: 'CANDIDATE_ONLY',
  value: value == null ? null : Number(clamp(value).toFixed(2)),
  status: value == null ? 'INSUFFICIENT_DATA' : 'CANDIDATE_CALCULATED',
  missingDependencies
});

/**
 * Product candidate only. It cannot feed production ScoreResult values.
 * Formula: recent-load balance 40%, distribution 35%, recovery/rest 25%.
 * The 50% load-deviation and coefficient-of-variation boundaries are
 * hypotheses requiring clinical review, recorded in the methodology spec.
 */
export const calculateActivityBalanceCandidate = (input: {
  dailyActivityLoad: number[];
  dailyRecoveryOrRest: number[];
}): CandidateResult => {
  if (input.dailyActivityLoad.length < 14 || input.dailyRecoveryOrRest.length < 7) {
    return candidateResult(null, [
      ...(input.dailyActivityLoad.length < 14 ? ['14 activity-load days'] : []),
      ...(input.dailyRecoveryOrRest.length < 7 ? ['7 recovery/rest days'] : [])
    ]);
  }
  const baseline = input.dailyActivityLoad.slice(-14, -7);
  const recent = input.dailyActivityLoad.slice(-7);
  if (![...baseline, ...recent, ...input.dailyRecoveryOrRest.slice(-7)].every(finite)) {
    return candidateResult(null, ['finite source-backed daily values']);
  }
  const baselineMean = average(baseline);
  const recentMean = average(recent);
  if (baselineMean <= 0 || recentMean <= 0) return candidateResult(null, ['positive personal activity baseline']);
  const loadDeviation = Math.abs(recentMean / baselineMean - 1);
  const loadBalance = clamp(100 - (loadDeviation / 0.5) * 100);
  const variance = average(recent.map(value => (value - recentMean) ** 2));
  const coefficientOfVariation = Math.sqrt(variance) / recentMean;
  const distribution = clamp(100 - coefficientOfVariation * 100);
  const recovery = clamp(average(input.dailyRecoveryOrRest.slice(-7)));
  return candidateResult(loadBalance * 0.4 + distribution * 0.35 + recovery * 0.25, []);
};

const circularDistanceMinutes = (left: number, right: number) => {
  const distance = Math.abs(left - right) % 1440;
  return Math.min(distance, 1440 - distance);
};

const circularMeanMinutes = (minutes: number[]) => {
  const radians = minutes.map(value => value / 1440 * Math.PI * 2);
  const angle = Math.atan2(average(radians.map(Math.sin)), average(radians.map(Math.cos)));
  return ((angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2)) * 1440;
};

/** Product candidate only: 50% bedtime regularity + 50% wake regularity. */
export const calculateSleepConsistencyCandidate = (input: {
  localBedtimeMinute: number[];
  localWakeMinute: number[];
}): CandidateResult => {
  if (input.localBedtimeMinute.length < 7 || input.localWakeMinute.length < 7) {
    return candidateResult(null, ['7 valid local bedtime/wake pairs']);
  }
  const bed = input.localBedtimeMinute.slice(-7);
  const wake = input.localWakeMinute.slice(-7);
  if (![...bed, ...wake].every(value => finite(value) && value >= 0 && value < 1440)) {
    return candidateResult(null, ['valid local clock minutes']);
  }
  const bedDeviation = average(bed.map(value => circularDistanceMinutes(value, circularMeanMinutes(bed))));
  const wakeDeviation = average(wake.map(value => circularDistanceMinutes(value, circularMeanMinutes(wake))));
  const toCandidateScore = (deviation: number) => clamp(100 - deviation / 120 * 100);
  return candidateResult(toCandidateScore(bedDeviation) * 0.5 + toCandidateScore(wakeDeviation) * 0.5, []);
};
