import { hydrationProgress } from './hydration';
import { HrvStatus, MoodSelection, WellnessSnapshot } from '../types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundedPercent = (value: number) => Math.round(clamp(value, 0, 1) * 100);

const moodWeightMap: Record<MoodSelection, number> = {
  '😂': 1,
  '😀': 0.92,
  '🙂': 0.78,
  '😐': 0.62,
  '☹️': 0.44,
  '😔': 0.28
};

const toHrvStatus = (heartRateAvg: number): HrvStatus => {
  if (heartRateAvg <= 66) {
    return 'High';
  }
  if (heartRateAvg <= 78) {
    return 'Normal';
  }
  return 'Low';
};

const toSleepTag = (sleepHours: number) => {
  const safe = Math.max(0, sleepHours);
  const totalMinutes = Math.round(safe * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m Sleep`;
};

export const recalculateWellness = (snapshot: WellnessSnapshot): WellnessSnapshot => {
  const focusQuality = clamp(snapshot.focusMinutes / 60, 0, 1);
  const breathingQuality = clamp(snapshot.breathingMinutes / 20, 0, 1);
  const movementQuality = clamp(snapshot.movementMinutes / 30, 0, 1);
  const hydrationQuality = hydrationProgress(snapshot.hydrationLiters, snapshot.hydrationGoalLiters);
  const sleepQuality = clamp(snapshot.sleepHours / 8, 0, 1);
  const moodQuality = clamp(snapshot.moodScore / 100, 0, 1);
  const heartRhythmQuality = clamp(1 - Math.abs(snapshot.heartRateAvg - 68) / 24, 0, 1);

  const recoveryScore = roundedPercent(
    0.31 * sleepQuality +
      0.2 * hydrationQuality +
      0.18 * breathingQuality +
      0.14 * moodQuality +
      0.1 * movementQuality +
      0.07 * heartRhythmQuality
  );

  const nourishmentScore = roundedPercent(0.68 * hydrationQuality + 0.32 * sleepQuality);

  const stressScore = roundedPercent(
    0.36 * (1 - moodQuality) +
      0.24 * (1 - sleepQuality) +
      0.18 * (1 - breathingQuality) +
      0.14 * (1 - heartRhythmQuality) +
      0.08 * (1 - movementQuality)
  );

  const baseWellness =
    0.18 * focusQuality +
    0.14 * movementQuality +
    0.12 * breathingQuality +
    0.14 * hydrationQuality +
    0.12 * sleepQuality +
    0.1 * moodQuality +
    0.08 * heartRhythmQuality +
    0.07 * (recoveryScore / 100) +
    0.05 * (nourishmentScore / 100);

  const stressPenalty = 0.12 * (stressScore / 100);
  const wellnessScore = roundedPercent(baseWellness - stressPenalty + 0.06);

  return {
    ...snapshot,
    recoveryScore,
    nourishmentScore,
    wellnessScore,
    stressScore,
    hrvStatus: toHrvStatus(snapshot.heartRateAvg)
  };
};

export const applyMoodImpact = (snapshot: WellnessSnapshot, mood: MoodSelection | null): WellnessSnapshot => {
  if (!mood) {
    return recalculateWellness({
      ...snapshot,
      moodScore: 60
    });
  }

  return recalculateWellness({
    ...snapshot,
    moodScore: Math.round(moodWeightMap[mood] * 100)
  });
};

export const wellnessTagsFromSnapshot = (snapshot: WellnessSnapshot): [string, string, string, string] => {
  return [
    `${snapshot.nourishmentScore}% Nourishment`,
    `${snapshot.recoveryScore}% Recovery`,
    toSleepTag(snapshot.sleepHours),
    `HRV ${snapshot.hrvStatus}`
  ];
};
