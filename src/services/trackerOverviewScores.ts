import type { BiomarkerHistoryItem } from './reportUploadService';
import type { CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const mean = (values: number[]) => values.length
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  : null;

const latestDayValue = (aggregates: CanonicalDailyAggregate[], metricTypes: string[]) => {
  const latestDay = aggregates
    .filter((item) => metricTypes.includes(item.metricType))
    .map((item) => item.healthDay)
    .sort()
    .at(-1);
  if (!latestDay) return null;
  return aggregates.find((item) => item.healthDay === latestDay && metricTypes.includes(item.metricType))?.value ?? null;
};

const activityComponent = (metric: 'steps' | 'exercise_minutes', value: number) =>
  clamp(metric === 'steps' ? value / 10_000 * 100 : value / 30 * 100);
const sleepComponent = (minutes: number) => clamp(100 - Math.abs(minutes - 450) / 3);
const hydrationComponent = (millilitres: number) => clamp(millilitres / 2_500 * 100);

export const calculateTrackerEnergyBalance = (aggregates: CanonicalDailyAggregate[]) => {
  const steps = latestDayValue(aggregates, ['steps']);
  const exercise = latestDayValue(aggregates, ['active_minutes'])
    ?? latestDayValue(aggregates, ['workout_minutes']);
  const sleep = latestDayValue(aggregates, ['sleep_minutes']);
  const hydration = latestDayValue(aggregates, ['hydration_ml']);
  return mean([
    ...(steps == null ? [] : [activityComponent('steps', steps)]),
    ...(exercise == null ? [] : [activityComponent('exercise_minutes', exercise)]),
    ...(sleep == null ? [] : [sleepComponent(sleep)]),
    ...(hydration == null ? [] : [hydrationComponent(hydration)])
  ]);
};

export const calculateTrackerStressRecovery = (aggregates: CanonicalDailyAggregate[]) => {
  const hrv = latestDayValue(aggregates, ['hrv_sdnn_ms', 'hrv_rmssd_ms']);
  const restingHeartRate = latestDayValue(aggregates, ['resting_heart_rate']);
  const stress = latestDayValue(aggregates, ['stress_score']);
  const mindfulness = latestDayValue(aggregates, ['mindfulness_minutes']);
  const sleep = latestDayValue(aggregates, ['sleep_minutes']);
  return mean([
    ...(hrv == null ? [] : [clamp(hrv / 70 * 100)]),
    ...(restingHeartRate == null ? [] : [clamp(100 - Math.abs(restingHeartRate - 62) * 2)]),
    ...(stress == null ? [] : [clamp(100 - stress)]),
    ...(mindfulness == null ? [] : [clamp(mindfulness / 15 * 100)]),
    ...(sleep == null ? [] : [sleepComponent(sleep)])
  ]);
};

export const scoreTrackerBiomarkerReference = (value: number, referenceRange: string | null | undefined) => {
  if (!referenceRange) return null;
  const cleaned = referenceRange.replace(/\s/g, '');
  const between = cleaned.match(/(-?\d+(?:\.\d+)?)[-–](-?\d+(?:\.\d+)?)/);
  if (between) {
    const minimum = Number(between[1]);
    const maximum = Number(between[2]);
    if (value >= minimum && value <= maximum) return 88;
    const width = Math.max(1, maximum - minimum);
    const distance = value < minimum ? minimum - value : value - maximum;
    return Math.round(clamp(88 - distance / width * 45));
  }
  const below = cleaned.match(/^<(-?\d+(?:\.\d+)?)/);
  if (below) return value < Number(below[1]) ? 88 : 55;
  const above = cleaned.match(/^>(-?\d+(?:\.\d+)?)/);
  if (above) return value > Number(above[1]) ? 88 : 55;
  return null;
};

export const calculateTrackerBodyBiomarkerHealth = (items: BiomarkerHistoryItem[]) => {
  const eligible = items.filter((item) => item.validationStatus === 'validated' &&
    /glucose|hba1c|insulin|cholesterol|triglyceride|hdl|ldl|creatinine|uric|crp|esr|hemoglobin|ferritin|vitamin d|b12/i
      .test(`${item.biomarkerName} ${item.unit}`));
  const latestByBiomarker = new Map<string, BiomarkerHistoryItem>();
  eligible.forEach((item) => {
    const current = latestByBiomarker.get(item.biomarkerId);
    if (!current || item.testDate > current.testDate) latestByBiomarker.set(item.biomarkerId, item);
  });
  return mean([...latestByBiomarker.values()]
    .map((item) => scoreTrackerBiomarkerReference(item.value, item.referenceRange))
    .filter((value): value is number => value != null));
};

export const calculateTrackerHealthIntelligence = (input: {
  activity: number | null;
  sleep: number | null;
  nutrition: number | null;
  calm: number | null;
  stressRecovery: number | null;
}) => {
  const weighted: Array<{ value: number | null; weight: number }> = [
    { value: input.activity, weight: 0.15 }, { value: input.sleep, weight: 0.20 },
    { value: input.nutrition, weight: 0.20 }, { value: input.calm, weight: 0.15 },
    { value: input.stressRecovery, weight: 0.15 }
  ];
  const available = weighted.filter((item): item is { value: number; weight: number } => item.value != null);
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  return availableWeight
    ? Math.round(available.reduce((sum, item) => sum + item.value * item.weight, 0) / availableWeight)
    : null;
};
