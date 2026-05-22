import { DailyCheckIn, WellnessSnapshot, WearableSyncPayload } from '../types';

type RecoveryDirection = 'improving' | 'declining' | 'stable';

export type RecoveryDriver = {
  key:
    | 'sleep'
    | 'activity'
    | 'medication_adherence'
    | 'wellness_sessions'
    | 'hydration'
    | 'focus_consistency'
    | 'stress_recovery'
    | 'emotional_checkins';
  label: string;
  score: number;
  weight: number;
  contribution: number;
  status: 'strong' | 'steady' | 'needs_attention';
  reason: string;
};

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
  recoveryScore: number | null;
  calmScore: number | null;
  stressRecoveryScore: number | null;
  recoveryDrivers: RecoveryDriver[];
  highestImpactActions: string[];
  contextualInsights: string[];
  whyChanged: string[];
  blockers: string[];
  trendValues7d: number[];
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
  hasWearable: boolean;
  wearableSyncData: WearableSyncPayload[];
  sessionAntiManipulation?: SessionAntiManipulation;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value);
const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

const lastNDays = (entries: DailyCheckIn[], n: number) =>
  [...entries]
    .sort((a, b) => (+new Date(b.dateISO)) - (+new Date(a.dateISO)))
    .slice(0, n);

const toStatus = (score: number): RecoveryDriver['status'] => {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'steady';
  return 'needs_attention';
};

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

const hasStatus = (payload: WearableSyncPayload | null, key: 'steps' | 'sleep' | 'heart_rate' | 'hrv' | 'workouts') =>
  payload?.dataQuality.connectedMetrics?.[key] === 'synced';

const smoothScore = (previous: number, nextRaw: number, maxDelta = 8) => {
  const bounded = clamp(nextRaw, previous - maxDelta, previous + maxDelta);
  return round(clamp(previous * 0.72 + bounded * 0.28, 0, 100));
};

const buildTrend = (stableScore: number, checkIns: DailyCheckIn[]) => {
  const recent = lastNDays(checkIns, 7).reverse();
  if (recent.length === 0) {
    return [stableScore - 7, stableScore - 5, stableScore - 4, stableScore - 2, stableScore - 1, stableScore, stableScore].map((v) =>
      round(clamp(v, 0, 100))
    );
  }

  const samples = recent.map((entry, index) => {
    const moodAdj = (entry.mood - 3) * 2.6;
    const energyAdj = (entry.energy - 3) * 2.2;
    const sleepAdj = (entry.sleepQuality - 3) * 2.4;
    const recencyAdj = -((recent.length - 1 - index) * 0.9);
    return round(clamp(stableScore + moodAdj + energyAdj + sleepAdj + recencyAdj, 0, 100));
  });

  const padded = samples.length >= 7 ? samples.slice(-7) : [...Array(7 - samples.length).fill(samples[0] ?? stableScore), ...samples];
  const smoothed: number[] = [];
  for (let i = 0; i < padded.length; i += 1) {
    if (i === 0) {
      smoothed.push(padded[i]);
      continue;
    }
    const prev = smoothed[i - 1];
    smoothed.push(round(clamp(prev * 0.7 + padded[i] * 0.3, 0, 100)));
  }
  return smoothed;
};

const contextualInsight = (direction: RecoveryDirection, topDriver: string, blocker: string) => {
  if (direction === 'improving') {
    return `Recovery stabilizing after stronger ${topDriver.toLowerCase()} rhythm.`;
  }
  if (direction === 'declining') {
    return `${blocker} is slowing recovery momentum today.`;
  }
  return `Recovery trend is steady with support from ${topDriver.toLowerCase()}.`;
};

export const buildRecoveryIntelligence = (input: Input): RecoveryOutput => {
  const latestSync = input.wearableSyncData[0] ?? null;
  const latestSyncAt = latestSync?.syncedAtISO;

  const signalCoverage = {
    steps: hasStatus(latestSync, 'steps') && isRecent(latestSyncAt, freshnessWindows.steps),
    sleep: hasStatus(latestSync, 'sleep') && isRecent(latestSyncAt, freshnessWindows.sleep),
    restingHeartRate: hasStatus(latestSync, 'heart_rate') && isRecent(latestSyncAt, freshnessWindows.restingHeartRate),
    hrv: hasStatus(latestSync, 'hrv') && isRecent(latestSyncAt, freshnessWindows.hrv),
    workouts: hasStatus(latestSync, 'workouts') && isRecent(latestSyncAt, freshnessWindows.workouts)
  };
  const coverageCount = Object.values(signalCoverage).filter(Boolean).length;

  const hasSessionSignals = input.wellness.breathingMinutes > 0 || input.wellness.focusMinutes > 0 || input.wellness.moodScore > 0;
  const hasEnoughForCalibration = coverageCount >= 3 && hasSessionSignals;
  const insufficientReason = hasEnoughForCalibration
    ? null
    : coverageCount < 3
      ? 'Recovery insights improve as more recovery signals become available.'
      : 'Recovery calibration adapting to your rhythm.';

  const sleepHours = latestSync?.metrics.sleepHours ?? 0;
  const workoutsMinutes = latestSync?.metrics.workoutMinutes ?? latestSync?.metrics.movementMinutes ?? 0;
  const restingHr = latestSync?.metrics.heartRateAvg ?? 0;
  const hrvDerived = latestSync?.metrics.hrvMs ?? null;

  const antiManip = input.sessionAntiManipulation ?? {
    todaySessionCount: 0,
    recentCooldownPenalty: 1,
    sessionInfluenceMultiplier: 1
  };
  const sessionInfluence = clamp(antiManip.sessionInfluenceMultiplier * antiManip.recentCooldownPenalty, 0.15, 1);

  const sleepScore = round(clamp((sleepHours / 8) * 100, 0, 100));
  const activityScore = round(clamp((workoutsMinutes / 35) * 100, 0, 100));
  const hrvScore = hrvDerived == null ? 0 : round(clamp((hrvDerived / 70) * 100, 0, 100));
  const restingHrScore = restingHr > 0 ? round(clamp(100 - Math.abs(restingHr - 62) * 2.2, 0, 100)) : 0;
  const rawSessionsScore = round(clamp((input.wellness.breathingMinutes / 14) * 55 + (input.wellness.focusMinutes / 45) * 45, 0, 100));
  const sessionsScore = round(clamp(rawSessionsScore * sessionInfluence, 0, 100));
  const emotionalScore = round(clamp(input.wellness.moodScore, 0, 100));
  const stressRecoverySignal = round(clamp((sessionsScore * 0.4) + (sleepScore * 0.3) + (hrvScore * 0.3), 0, 100));

  const drivers: RecoveryDriver[] = [
    {
      key: 'sleep',
      label: 'Sleep',
      score: sleepScore,
      weight: 0.3,
      contribution: sleepScore * 0.3,
      status: toStatus(sleepScore),
      reason: sleepHours > 0 ? `Sleep is ${sleepHours.toFixed(1)}h from recent health sync.` : 'No recent sleep signal available.'
    },
    {
      key: 'activity',
      label: 'Movement / Workouts',
      score: activityScore,
      weight: 0.15,
      contribution: activityScore * 0.15,
      status: toStatus(activityScore),
      reason: workoutsMinutes > 0 ? `${Math.round(workoutsMinutes)} workout minutes from recent health sync.` : 'No recent workout signal available.'
    },
    {
      key: 'wellness_sessions',
      label: 'Calm sessions',
      score: sessionsScore,
      weight: 0.1,
      contribution: sessionsScore * 0.1,
      status: toStatus(sessionsScore),
      reason:
        antiManip.todaySessionCount > 1
          ? `Session impact adjusted for continuity (${antiManip.todaySessionCount} sessions today).`
          : 'Calm session signal is contributing at full influence.'
    },
    {
      key: 'emotional_checkins',
      label: 'Emotional stability',
      score: emotionalScore,
      weight: 0.05,
      contribution: emotionalScore * 0.05,
      status: toStatus(emotionalScore),
      reason: 'Derived from mood and emotional session interactions.'
    },
    {
      key: 'sleep',
      label: 'HRV / Recovery balance',
      score: hrvScore,
      weight: 0.25,
      contribution: hrvScore * 0.25,
      status: toStatus(hrvScore),
      reason: hrvDerived == null ? 'No recent HRV records found.' : `HRV is ${hrvDerived.toFixed(1)} ms from health sync.`
    },
    {
      key: 'stress_recovery',
      label: 'Resting heart load',
      score: restingHrScore,
      weight: 0.15,
      contribution: restingHrScore * 0.15,
      status: toStatus(restingHrScore),
      reason: restingHr > 0 ? `Resting heart rate is ${Math.round(restingHr)} bpm from health sync.` : 'No recent resting heart rate records found.'
    },
    {
      key: 'stress_recovery',
      label: 'Stress recovery',
      score: stressRecoverySignal,
      weight: 0,
      contribution: 0,
      status: toStatus(stressRecoverySignal),
      reason: 'Derived from sleep, HRV, and calm-session continuity.'
    }
  ];

  const rawRecoveryScore = round(clamp(drivers.reduce((sum, item) => sum + item.contribution, 0), 0, 100));
  const rawCalmScore = round(clamp((sessionsScore * 0.35) + (hrvScore * 0.35) + (sleepScore * 0.2) + (restingHrScore * 0.1), 0, 100));
  const rawStressRecoveryScore = round(clamp((rawCalmScore * 0.55) + (sleepScore * 0.25) + (hrvScore * 0.2), 0, 100));

  const previousRecovery = clamp(input.wellness.recoveryScore, 0, 100);
  const previousCalm = clamp(100 - input.wellness.stressScore, 0, 100);
  const previousStressRecovery = clamp(100 - input.wellness.stressScore, 0, 100);

  const recoveryScore = hasEnoughForCalibration ? smoothScore(previousRecovery, rawRecoveryScore, 9) : null;
  const calmScore = hasEnoughForCalibration ? smoothScore(previousCalm, rawCalmScore, 8) : null;
  const stressRecoveryScore = hasEnoughForCalibration ? smoothScore(previousStressRecovery, rawStressRecoveryScore, 8) : null;

  const prior7 = lastNDays(input.checkIns, 14).slice(7);
  const priorMood = prior7.length ? mean(prior7.map((item) => item.mood)) : 3;
  const recent7 = lastNDays(input.checkIns, 7);
  const recentMood = recent7.length ? mean(recent7.map((item) => item.mood)) : 3;
  const moodDelta = recentMood - priorMood;

  const direction: RecoveryDirection =
    recoveryScore == null
      ? 'stable'
      : recoveryScore >= previousRecovery + 2 && moodDelta >= -0.1
        ? 'improving'
        : recoveryScore <= previousRecovery - 2 || moodDelta <= -0.25
          ? 'declining'
          : 'stable';

  const scored = drivers.filter((driver) => driver.weight > 0);
  const sortedByScore = [...scored].sort((a, b) => a.score - b.score);
  const lowest = sortedByScore.slice(0, 3);
  const highest = [...scored].sort((a, b) => b.score - a.score);

  const blockers = hasEnoughForCalibration
    ? lowest.filter((item) => item.score < 60).map((item) => `${item.label} may improve with one small recovery step.`)
    : ['Continue syncing recovery signals for deeper insights.'];

  const actionMap: Record<RecoveryDriver['key'], string> = {
    sleep: 'Protect a fixed sleep window tonight and aim for at least 7 hours.',
    activity: 'Add a 12–20 minute low-intensity walk to improve recovery momentum.',
    medication_adherence: 'Maintain medication consistency today to support recovery continuity.',
    wellness_sessions: 'Complete one calm session and avoid repeating the same session back-to-back.',
    hydration: 'Support recovery with consistent hydration habits.',
    focus_consistency: 'Use one protected deep-work block and one decompression break.',
    stress_recovery: 'Run a breathing reset before evening to lower recovery load.',
    emotional_checkins: 'Log one emotional check-in and add one calming routine before sleep.'
  };

  const highestImpactActions = hasEnoughForCalibration
    ? lowest.map((item) => actionMap[item.key])
    : ['Recovery calibration adapting to your rhythm.', 'Continue syncing recovery signals and complete one calm session.'];

  const whyChanged = hasEnoughForCalibration
    ? [
        `${highest[0]?.label ?? 'Sleep'} is currently supporting recovery continuity.`,
        `${lowest[0]?.label ?? 'Recovery balance'} is currently limiting recovery momentum.`
      ]
    : ['Recovery interpretation is waiting for enough recent real signals.'];

  const contextualInsights = hasEnoughForCalibration
    ? [
        contextualInsight(direction, highest[0]?.label ?? 'Sleep', lowest[0]?.label ?? 'Recovery balance'),
        `Calm response is ${antiManip.todaySessionCount > 2 ? 'stabilizing with reduced repeat-session impact.' : 'responding to recent session consistency.'}`,
        `Recovery confidence is based on ${coverageCount}/5 recent device signals.`
      ]
    : [
        'Recovery insights improve as more recovery signals become available.',
        'Continue syncing recovery signals for deeper insights.',
        'Recovery calibration adapting to your rhythm.'
      ];

  return {
    isCalibrating: !hasEnoughForCalibration,
    insufficientReason,
    signalCoverage,
    recoveryDirection: direction,
    recoveryScore,
    calmScore,
    stressRecoveryScore,
    recoveryDrivers: drivers,
    highestImpactActions,
    contextualInsights,
    whyChanged,
    blockers,
    trendValues7d: buildTrend(recoveryScore ?? previousRecovery, input.checkIns)
  };
};

