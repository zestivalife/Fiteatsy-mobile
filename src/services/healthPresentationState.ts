import type { CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';

export type SleepStagePresentation = {
  healthDay: string | null;
  stages: string[];
};

const finitePositive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export const latestAggregate = (
  aggregates: CanonicalDailyAggregate[],
  metricTypes: string[]
) => aggregates
  .filter((item) => metricTypes.includes(item.metricType) && finitePositive(item.value))
  .sort((left, right) => right.healthDay.localeCompare(left.healthDay))[0] ?? null;

export const hasCanonicalMetricData = (
  aggregates: CanonicalDailyAggregate[],
  metricTypes: string[]
) => latestAggregate(aggregates, metricTypes) != null;

/**
 * Sleep stages are only presented for the same canonical wake-day as a valid
 * total sleep aggregate. Stage minutes are converted to a bounded partition;
 * raw minutes must never be labelled as percentages.
 */
export const buildSleepStagePresentation = (
  aggregates: CanonicalDailyAggregate[]
): SleepStagePresentation => {
  const total = latestAggregate(aggregates, ['sleep_minutes']);
  if (!total) return { healthDay: null, stages: [] };

  const definitions = [
    ['Deep', 'sleep_deep_minutes'],
    ['REM', 'sleep_rem_minutes'],
    ['Light', 'sleep_core_minutes'],
    ['Awake', 'sleep_awake_minutes']
  ] as const;
  const values = definitions.map(([label, metricType]) => ({
    label,
    value: aggregates.find((item) => item.healthDay === total.healthDay && item.metricType === metricType)?.value ?? 0
  })).filter((item) => finitePositive(item.value));
  const denominator = values.reduce((sum, item) => sum + item.value, 0);
  if (!finitePositive(denominator)) return { healthDay: total.healthDay, stages: [] };

  return {
    healthDay: total.healthDay,
    stages: values.map(({ label, value }) => `${label} ${Math.min(100, Math.max(0, Math.round(value / denominator * 100)))}%`)
  };
};

export const baselineCopy = (
  aggregates: CanonicalDailyAggregate[],
  metricType: string,
  windowDays: number,
  suffix = ''
) => {
  const rows = aggregates
    .filter((item) => item.metricType === metricType && finitePositive(item.value))
    .sort((left, right) => right.healthDay.localeCompare(left.healthDay))
    .slice(0, windowDays);
  if (rows.length < 2) return 'Building your baseline';
  const average = rows.reduce((sum, item) => sum + item.value, 0) / rows.length;
  return `${Math.round(average).toLocaleString()}${suffix}`;
};
