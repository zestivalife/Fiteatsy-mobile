import { DailyCheckIn, HealthObservationDraft, WellnessSnapshot } from '../types';

type RecoveryDirection = 'improving' | 'declining' | 'stable';

export type RecoveryOutput = {
  isCalibrating: boolean;
  insufficientReason: string | null;
  signalCoverage: {
    steps: boolean;
    sleep: boolean;
    restingHeartRate: boolean;
    hrv: boolean;
    workouts: boolean;
  };
  recoveryDirection: RecoveryDirection;
  /** Canonical scores are intentionally unavailable from this context-only helper. */
  recoveryScore: null;
  calmScore: null;
  stressRecoveryScore: null;
  pss10Score: number | null;
  questionnaireAvailable: boolean;
  highestImpactActions: string[];
  contextualInsights: string[];
  whyChanged: string[];
  blockers: string[];
  trendValues7d: number[];
  debug: {
    signalCoverageCount: number;
    confidenceState: 'high' | 'moderate' | 'low';
  };
};

type SessionAntiManipulation = {
  todaySessionCount: number;
  recentCooldownPenalty: number;
  sessionInfluenceMultiplier: number;
};

type Input = {
  wellness: WellnessSnapshot;
  checkIns: DailyCheckIn[];
  medication: {
    scheduledToday: number;
    takenToday: number;
    pendingToday: number;
    skippedToday: number;
    missedToday: number;
  };
  healthObservations: HealthObservationDraft[];
  sessionAntiManipulation?: SessionAntiManipulation;
  pss10Results?: Array<{ rawScore: number; completedAtISO: string }>;
};

const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

const lastNDays = (entries: DailyCheckIn[], n: number) =>
  [...entries]
    .sort((a, b) => (+new Date(b.dateISO)) - (+new Date(a.dateISO)))
    .slice(0, n);

const freshnessWindows = {
  steps: 24 * 60 * 60 * 1000,
  sleep: 48 * 60 * 60 * 1000,
  restingHeartRate: 7 * 24 * 60 * 60 * 1000,
  hrv: 7 * 24 * 60 * 60 * 1000,
  workouts: 7 * 24 * 60 * 60 * 1000
} as const;

const isRecent = (iso: string | undefined, windowMs: number) => {
  if (!iso) return false;
  const time = +new Date(iso);
  if (!Number.isFinite(time)) return false;
  return Date.now() - time <= windowMs;
};

const latestMetric = (observations: HealthObservationDraft[], metricTypes: string[]) =>
  observations.filter(item => !item.deleted && metricTypes.includes(item.metricType))
    .sort((left,right) => right.measuredAtISO.localeCompare(left.measuredAtISO))[0] ?? null;

export const buildRecoveryIntelligence = (input: Input): RecoveryOutput => {
  const steps = latestMetric(input.healthObservations, ['steps']);
  const sleep = latestMetric(input.healthObservations, ['sleep_minutes']);
  const restingHeartRate = latestMetric(input.healthObservations, ['resting_heart_rate','heart_rate']);
  const hrv = latestMetric(input.healthObservations, ['hrv_sdnn_ms','hrv_rmssd_ms']);
  const workouts = latestMetric(input.healthObservations, ['workout_minutes','active_minutes']);

  const signalCoverage = {
    steps: Boolean(steps && isRecent(steps.measuredAtISO, freshnessWindows.steps)),
    sleep: Boolean(sleep && isRecent(sleep.measuredAtISO, freshnessWindows.sleep)),
    restingHeartRate: Boolean(restingHeartRate && isRecent(restingHeartRate.measuredAtISO, freshnessWindows.restingHeartRate)),
    hrv: Boolean(hrv && isRecent(hrv.measuredAtISO, freshnessWindows.hrv)),
    workouts: Boolean(workouts && isRecent(workouts.measuredAtISO, freshnessWindows.workouts))
  };
  const coverageCount = Object.values(signalCoverage).filter(Boolean).length;
  const pss10Results = [...(input.pss10Results ?? [])].sort((a, b) => +new Date(a.completedAtISO) - +new Date(b.completedAtISO));
  const latestPss10 = pss10Results[pss10Results.length - 1] ?? null;

  const hasSessionSignals = input.wellness.breathingMinutes > 0 || input.wellness.focusMinutes > 0 || input.wellness.moodScore > 0;
  const hasEnoughForCalibration = coverageCount >= 3 && hasSessionSignals;
  const insufficientReason = hasEnoughForCalibration
    ? null
    : coverageCount < 3
      ? 'Recovery insights improve as more recovery signals become available.'
      : 'Recovery calibration adapting to your rhythm.';

  // This module supplies context and freshness only. HEALTH_INTELLIGENCE_V1 is
  // the sole authority allowed to produce Recovery, Calm, or Stress Recovery.
  const recoveryScore = null;
  const calmScore = null;
  const stressRecoveryScore = null;

  const prior7 = lastNDays(input.checkIns, 14).slice(7);
  const priorMood = prior7.length ? mean(prior7.map((item) => item.mood)) : 3;
  const recent7 = lastNDays(input.checkIns, 7);
  const recentMood = recent7.length ? mean(recent7.map((item) => item.mood)) : 3;
  const moodDelta = recentMood - priorMood;

  const direction: RecoveryDirection =
    moodDelta > 0.25 ? 'improving' : moodDelta < -0.25 ? 'declining' : 'stable';

  const blockers = hasEnoughForCalibration ? [] : ['Continue syncing recovery signals for deeper insights.'];
  const highestImpactActions = hasEnoughForCalibration
    ? ['Keep your current sleep, movement, and recovery routine consistent.']
    : ['Recovery calibration adapting to your rhythm.', 'Continue syncing recovery signals and complete one calm session.'];
  const whyChanged = ['Score interpretation comes from the canonical Health Intelligence snapshot.'];
  const contextualInsights = hasEnoughForCalibration
    ? [`Recovery context includes ${coverageCount}/5 recent device signals.`]
    : ['Recovery insights improve as more recovery signals become available.'];

  const confidenceState: 'high' | 'moderate' | 'low' =
    coverageCount >= 4 && !hasEnoughForCalibration ? 'moderate' : coverageCount >= 4 ? 'high' : coverageCount >= 2 ? 'moderate' : 'low';

  return {
    isCalibrating: !hasEnoughForCalibration,
    insufficientReason,
    signalCoverage,
    recoveryDirection: direction,
    recoveryScore,
    calmScore,
    stressRecoveryScore,
    pss10Score: latestPss10?.rawScore ?? null,
    questionnaireAvailable: latestPss10 !== null,
    highestImpactActions,
    contextualInsights,
    whyChanged,
    blockers,
    trendValues7d: [],
    debug: {
      signalCoverageCount: coverageCount,
      confidenceState
    }
  };
};
