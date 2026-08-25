import { WellnessSnapshot } from '../types';

/**
 * Truthful pre-sync state. Numeric fields remain neutral for compatibility with
 * existing calculations; `availability` is the authority for presentation.
 */
export const emptyWellness: WellnessSnapshot = {
  focusMinutes: 0,
  breathingMinutes: 0,
  movementMinutes: 0,
  hydrationLiters: 0,
  hydrationGoalLiters: 4,
  heartRateAvg: 0,
  sleepHours: 0,
  moodScore: 0,
  recoveryScore: 0,
  nourishmentScore: 0,
  wellnessScore: 0,
  hrvStatus: 'Unavailable',
  stressScore: 0,
  availability: 'not_synced',
  lastUpdatedISO: null,
  source: null,
};
