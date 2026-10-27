import { HealthObservationDraft, WearableSyncPayload } from '../types';

export type DailyHealthSummary = {
  dateKey: string;
  steps: number | null;
  distanceMeters: number | null;
  activeEnergyKcal: number | null;
  workoutMinutes: number | null;
  sleepMinutes: number | null;
  sleepScore: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  recoveryScore: number | null;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const average = (values: number[]) => values.length ? sum(values) / values.length : null;
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const keyFor = (iso: string) => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const valuesFor = (items: HealthObservationDraft[], metricType: string) =>
  items.filter((item) => item.metricType === metricType && Number.isFinite(item.value) && item.value > 0).map((item) => item.value);

/** Builds seven truthful calendar-day summaries. Missing signals remain null and are never fabricated. */
export const buildSevenDayHealthHistory = (payload: WearableSyncPayload | null, now = new Date()): DailyHealthSummary[] => {
  const observations = payload?.observations ?? [];
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const dateKey = keyFor(date.toISOString())!;
    const daily = observations.filter((item) => keyFor(item.measuredAtISO) === dateKey);
    const steps = valuesFor(daily, 'steps');
    const distance = valuesFor(daily, 'distance');
    const energy = valuesFor(daily, 'active_energy');
    const workouts = [...valuesFor(daily, 'workout_minutes'), ...valuesFor(daily, 'active_minutes')];
    const sleep = valuesFor(daily, 'sleep_minutes');
    const restingHr = valuesFor(daily, 'resting_heart_rate');
    const hrv = valuesFor(daily, 'hrv_ms');

    const components: Array<{ score: number; weight: number }> = [];
    if (sleep.length) components.push({ score: clamp((sum(sleep) / 480) * 100), weight: 0.4 });
    if (hrv.length) components.push({ score: clamp((average(hrv)! / 70) * 100), weight: 0.3 });
    if (restingHr.length) components.push({ score: clamp(100 - Math.abs(average(restingHr)! - 62) * 2.2), weight: 0.2 });
    if (steps.length || workouts.length) {
      const activity = Math.max(steps.length ? (sum(steps) / 7500) * 100 : 0, workouts.length ? (sum(workouts) / 30) * 100 : 0);
      components.push({ score: clamp(activity), weight: 0.1 });
    }
    const totalWeight = sum(components.map((item) => item.weight));

    const sleepMinutes = sleep.length ? Math.round(sum(sleep)) : null;
    return {
      dateKey,
      steps: steps.length ? Math.round(sum(steps)) : null,
      distanceMeters: distance.length ? sum(distance) : null,
      activeEnergyKcal: energy.length ? Math.round(sum(energy)) : null,
      workoutMinutes: workouts.length ? Math.round(sum(workouts)) : null,
      sleepMinutes,
      sleepScore: sleepMinutes == null ? null : Math.round(clamp((sleepMinutes / 480) * 100)),
      restingHeartRate: restingHr.length ? Math.round(average(restingHr)!) : null,
      hrvMs: hrv.length ? Number(average(hrv)!.toFixed(1)) : null,
      recoveryScore: components.length >= 2 ? Math.round(sum(components.map((item) => item.score * item.weight)) / totalWeight) : null
    };
  });
};

export const calculateHealthStreak = (history: DailyHealthSummary[]) => {
  let streak = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const day = history[index];
    const hasHealthData = [day.steps, day.sleepMinutes, day.restingHeartRate, day.hrvMs, day.workoutMinutes].some((value) => value != null);
    if (!hasHealthData) break;
    streak += 1;
  }
  return streak;
};

export const buildSleepRecommendation = (history: DailyHealthSummary[]) => {
  const sleepDays = history.filter((day) => day.sleepMinutes != null);
  if (!sleepDays.length) return 'Allow Sleep access and wear your device overnight to receive a personal sleep recommendation.';
  const latest = sleepDays.at(-1)!;
  const averageMinutes = Math.round(sum(sleepDays.map((day) => day.sleepMinutes!)) / sleepDays.length);
  if (latest.sleepMinutes! < 420) return `Last sleep was ${Math.floor(latest.sleepMinutes! / 60)}h ${latest.sleepMinutes! % 60}m. Protect an earlier wind-down and aim for at least 7 hours tonight.`;
  if (averageMinutes < 420) return `Your ${sleepDays.length}-night average is ${Math.floor(averageMinutes / 60)}h ${averageMinutes % 60}m. Add 15–30 minutes to your sleep window this week.`;
  if (averageMinutes > 540) return `Your recent sleep average is ${Math.floor(averageMinutes / 60)}h ${averageMinutes % 60}m. Keep the schedule consistent and review how refreshed you feel.`;
  return `Your recent sleep average is ${Math.floor(averageMinutes / 60)}h ${averageMinutes % 60}m. Keep bedtime and wake time consistent within about 30 minutes.`;
};
