import { DailyCheckIn, WellnessSnapshot } from '../types';

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
  recoveryDirection: RecoveryDirection;
  recoveryScore: number;
  recoveryDrivers: RecoveryDriver[];
  highestImpactActions: string[];
  contextualInsights: string[];
  whyChanged: string[];
  blockers: string[];
  trendValues7d: number[];
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
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value);
const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);
const stddev = (values: number[]) => {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
};

const lastNDays = (entries: DailyCheckIn[], n: number) => {
  return [...entries]
    .sort((a, b) => (a.dateISO > b.dateISO ? -1 : 1))
    .slice(0, n);
};

const toStatus = (score: number): RecoveryDriver['status'] => {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'steady';
  return 'needs_attention';
};

const buildDrivers = (input: Input): RecoveryDriver[] => {
  const { wellness, checkIns, medication, hasWearable } = input;
  const recent7 = lastNDays(checkIns, 7);
  const moodAvg = recent7.length ? mean(recent7.map((item) => item.mood)) : wellness.moodScore / 20;
  const energyValues = recent7.map((item) => item.energy);
  const energyStd = energyValues.length ? stddev(energyValues) : 1.4;

  const sleepScore = round(clamp((wellness.sleepHours / 8) * 100, 20, 100));
  const activityScore = round(clamp((wellness.movementMinutes / 30) * 100, 10, 100));
  const medicationScore = medication.scheduledToday > 0
    ? round(
        clamp(
          ((medication.takenToday + medication.pendingToday * 0.4 + medication.skippedToday * 0.2) /
            medication.scheduledToday) *
            100,
          0,
          100
        )
      )
    : 72;
  const sessionsScore = round(clamp((wellness.breathingMinutes / 10) * 45 + (wellness.focusMinutes / 45) * 55, 15, 100));
  const hydrationScore = round(clamp((wellness.hydrationLiters / Math.max(0.5, wellness.hydrationGoalLiters)) * 100, 10, 100));
  const focusConsistencyScore = round(clamp(100 - energyStd * 24, 25, 100));
  const stressRecoveryScore = round(clamp(100 - wellness.stressScore + wellness.breathingMinutes * 1.2, 10, 100));
  const emotionalScore = round(clamp((moodAvg / 5) * 100, 15, 100));

  return [
    {
      key: 'sleep',
      label: 'Sleep',
      score: sleepScore,
      weight: 0.18,
      contribution: sleepScore * 0.18,
      status: toStatus(sleepScore),
      reason: hasWearable
        ? `Sleep is ${wellness.sleepHours.toFixed(1)}h from wearable sync.`
        : `Sleep is ${wellness.sleepHours.toFixed(1)}h from manual wellness input.`
    },
    {
      key: 'activity',
      label: 'Activity',
      score: activityScore,
      weight: 0.14,
      contribution: activityScore * 0.14,
      status: toStatus(activityScore),
      reason: `${wellness.movementMinutes} movement minutes today vs 30-minute recovery target.`
    },
    {
      key: 'medication_adherence',
      label: 'Medication adherence',
      score: medicationScore,
      weight: 0.2,
      contribution: medicationScore * 0.2,
      status: toStatus(medicationScore),
      reason:
        medication.scheduledToday > 0
          ? `${medication.takenToday}/${medication.scheduledToday} taken, ${medication.pendingToday} pending, ${medication.missedToday} missed.`
          : 'No medication schedule today; neutral adherence weight applied.'
    },
    {
      key: 'wellness_sessions',
      label: 'Wellness sessions',
      score: sessionsScore,
      weight: 0.1,
      contribution: sessionsScore * 0.1,
      status: toStatus(sessionsScore),
      reason: `${wellness.focusMinutes} focus minutes and ${wellness.breathingMinutes} breathing minutes logged.`
    },
    {
      key: 'hydration',
      label: 'Hydration',
      score: hydrationScore,
      weight: 0.1,
      contribution: hydrationScore * 0.1,
      status: toStatus(hydrationScore),
      reason: `${wellness.hydrationLiters.toFixed(1)}L of ${wellness.hydrationGoalLiters.toFixed(1)}L hydration goal.`
    },
    {
      key: 'focus_consistency',
      label: 'Focus consistency',
      score: focusConsistencyScore,
      weight: 0.08,
      contribution: focusConsistencyScore * 0.08,
      status: toStatus(focusConsistencyScore),
      reason: `Energy variation across recent check-ins: ${energyStd.toFixed(2)} std-dev.`
    },
    {
      key: 'stress_recovery',
      label: 'Stress recovery',
      score: stressRecoveryScore,
      weight: 0.12,
      contribution: stressRecoveryScore * 0.12,
      status: toStatus(stressRecoveryScore),
      reason: `Stress score ${wellness.stressScore}/100 adjusted by breathing minutes.`
    },
    {
      key: 'emotional_checkins',
      label: 'Emotional check-ins',
      score: emotionalScore,
      weight: 0.08,
      contribution: emotionalScore * 0.08,
      status: toStatus(emotionalScore),
      reason: recent7.length ? `Average mood from last ${recent7.length} check-ins is ${moodAvg.toFixed(1)}/5.` : 'No recent check-ins; baseline emotional estimate used.'
    }
  ];
};

const buildTrend = (score: number, checkIns: DailyCheckIn[]) => {
  const recent = lastNDays(checkIns, 7).reverse();
  const computed = recent.map((entry, index) => {
    const moodAdj = (entry.mood - 3) * 4;
    const energyAdj = (entry.energy - 3) * 3;
    const sleepAdj = (entry.sleepQuality - 3) * 3;
    return round(clamp(score + moodAdj + energyAdj + sleepAdj - (recent.length - 1 - index) * 1.5, 0, 100));
  });
  if (computed.length >= 7) return computed.slice(-7);
  const seed = [Math.max(0, score - 12), Math.max(0, score - 8), Math.max(0, score - 5), Math.max(0, score - 2), score - 1, score, score].map((item) =>
    round(clamp(item, 0, 100))
  );
  return [...seed.slice(0, 7 - computed.length), ...computed];
};

export const buildRecoveryIntelligence = (input: Input): RecoveryOutput => {
  const drivers = buildDrivers(input);
  const recoveryScore = round(clamp(drivers.reduce((sum, item) => sum + item.contribution, 0), 0, 100));

  const prior7 = lastNDays(input.checkIns, 14).slice(7);
  const priorMood = prior7.length ? mean(prior7.map((item) => item.mood)) : 3;
  const recent7 = lastNDays(input.checkIns, 7);
  const recentMood = recent7.length ? mean(recent7.map((item) => item.mood)) : 3;
  const moodDelta = recentMood - priorMood;
  const direction: RecoveryDirection = recoveryScore >= 75 && moodDelta >= 0.1 ? 'improving' : recoveryScore <= 60 || moodDelta <= -0.2 ? 'declining' : 'stable';

  const sortedByScore = [...drivers].sort((a, b) => a.score - b.score);
  const lowest = sortedByScore.slice(0, 3);
  const blockers = lowest.filter((item) => item.score < 60).map((item) => `${item.label} is reducing recovery (${item.score}/100).`);

  const actionMap: Record<RecoveryDriver['key'], string> = {
    sleep: 'Protect a fixed sleep window tonight and aim for at least 7 hours.',
    activity: 'Add a 12–20 minute low-intensity walk to improve recovery momentum.',
    medication_adherence: 'Clear pending medication reminders to prevent avoidable recovery dips.',
    wellness_sessions: 'Add one short breathing/focus session to improve stress and focus stability.',
    hydration: 'Close your hydration gap with 2–3 timed water check-ins.',
    focus_consistency: 'Use one protected deep-work block and one decompression break.',
    stress_recovery: 'Run a breathing reset before evening to lower recovery drag from stress.',
    emotional_checkins: 'Log one emotional check-in and add one calming routine before sleep.'
  };

  const highestImpactActions = lowest.map((item) => actionMap[item.key]);
  const whyChanged = lowest.map((item) => `${item.label}: ${item.reason}`);
  const contextualInsights = [
    direction === 'improving'
      ? 'Recovery is moving in the right direction because your strongest drivers are stable.'
      : direction === 'declining'
        ? 'Recovery is under pressure from a few behavior-linked blockers today.'
        : 'Recovery is stable, with opportunity to improve through your lowest drivers.',
    `Top positive driver: ${[...drivers].sort((a, b) => b.score - a.score)[0].label}.`,
    `Primary blocker: ${lowest[0].label}.`
  ];

  return {
    recoveryDirection: direction,
    recoveryScore,
    recoveryDrivers: drivers,
    highestImpactActions,
    contextualInsights,
    whyChanged,
    blockers,
    trendValues7d: buildTrend(recoveryScore, input.checkIns)
  };
};
