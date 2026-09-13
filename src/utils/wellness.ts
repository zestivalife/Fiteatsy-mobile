import { MoodSelection, WellnessSnapshot } from '../types';

const moodWeightMap: Record<MoodSelection, number> = {
  '😂': 1,
  '😀': 0.92,
  '🙂': 0.78,
  '😐': 0.62,
  '☹️': 0.44,
  '😔': 0.28
};

const toSleepTag = (sleepHours: number) => {
  const safe = Math.max(0, sleepHours);
  const totalMinutes = Math.round(safe * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m Sleep`;
};

/**
 * Retains non-scoring wellness inputs and the last canonical score projection.
 * Score calculation belongs exclusively to HEALTH_INTELLIGENCE_V1.
 */
export const mergeWellnessInputs = (snapshot: WellnessSnapshot): WellnessSnapshot => snapshot;

export const applyMoodImpact = (snapshot: WellnessSnapshot, mood: MoodSelection | null): WellnessSnapshot => {
  if (!mood) {
    return mergeWellnessInputs({
      ...snapshot,
      moodScore: 60
    });
  }

  return mergeWellnessInputs({
    ...snapshot,
    moodScore: Math.round(moodWeightMap[mood] * 100)
  });
};

export const wellnessTagsFromSnapshot = (snapshot: WellnessSnapshot): [string, string, string, string] => {
  if (snapshot.availability !== 'available') {
    return ['Nourishment unavailable', 'Recovery unavailable', 'Sleep not synced', 'HRV unavailable'];
  }
  return [
    `${snapshot.nourishmentScore}% Nourishment`,
    `${snapshot.recoveryScore}% Recovery`,
    toSleepTag(snapshot.sleepHours),
    `HRV ${snapshot.hrvStatus}`
  ];
};
