import type { CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';
import type { CanonicalHealthMetricState } from './canonicalHealthSyncCoordinator';

export type HealthRange = 'D' | 'W' | 'M' | 'Y';
export type HealthCategory = 'Activity' | 'Sleep' | 'Heart' | 'Respiratory' | 'Body' | 'Energy' | 'Nutrition & Hydration';
export type HealthTrendPoint = { key: string; label: string; value: number; measuredAtISO: string };

const DAY_MS = 86_400_000;
const RANGE_DAYS: Record<HealthRange, number> = { D: 1, W: 7, M: 30, Y: 365 };
const RANGE_POINT_LIMITS: Record<HealthRange, number> = { D: 1, W: 7, M: 6, Y: 12 };

export const categoryForMetric = (metricKey: string): HealthCategory => {
  if (['steps', 'distance', 'exercise', 'workout'].includes(metricKey)) return 'Activity';
  if (metricKey === 'sleep') return 'Sleep';
  if (['heart_rate', 'resting_heart_rate', 'hrv_sdnn', 'hrv_rmssd'].includes(metricKey)) return 'Heart';
  if (['spo2', 'respiratory_rate'].includes(metricKey)) return 'Respiratory';
  if (metricKey === 'weight') return 'Body';
  if (metricKey === 'active_energy') return 'Energy';
  return 'Nutrition & Hydration';
};

export const displayUnit = (metricType: string, unit: string) => metricType === 'sleep_minutes' ? 'hr' : unit === 'count' ? '' : unit;

export const displayValue = (metricType: string, value: number) => metricType === 'sleep_minutes' ? value / 60 : value;

export const metricFreshness = (metric: CanonicalHealthMetricState, nowMs = Date.now()) => {
  if (!metric.supported) return 'UNSUPPORTED' as const;
  if (metric.queryState === 'ERROR') return 'ERROR' as const;
  if (metric.queryState === 'TIMEOUT') return 'STALE' as const;
  if (!metric.observation) return 'NO_RECORDS' as const;
  const measuredAt = Date.parse(metric.observation.measuredAtISO);
  if (!Number.isFinite(measuredAt)) return 'UNKNOWN' as const;
  const staleHours = metric.definition.metricKey === 'weight' ? 168 : 36;
  return nowMs - measuredAt > staleHours * 3_600_000 ? 'STALE' as const : 'CURRENT' as const;
};

const dayStart = (timeMs: number) => {
  const date = new Date(timeMs);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const subtractCalendarDays = (timeMs: number, days: number) => {
  const date = new Date(dayStart(timeMs));
  date.setDate(date.getDate() - days);
  return date.getTime();
};

const weekStart = (timeMs: number) => {
  const date = new Date(timeMs);
  const mondayOffset = (date.getDay() + 6) % 7;
  return dayStart(timeMs) - mondayOffset * DAY_MS;
};

const bucketKey = (timeMs: number, range: HealthRange) => {
  const date = new Date(timeMs);
  if (range === 'Y') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  if (range === 'M') return new Date(weekStart(timeMs)).toISOString().slice(0, 10);
  return new Date(dayStart(timeMs)).toISOString().slice(0, 10);
};

const bucketLabel = (timeMs: number, range: HealthRange) => new Intl.DateTimeFormat(undefined,
  range === 'Y' ? { month: 'short' } : range === 'M' ? { month: 'short', day: 'numeric' } : { weekday: 'short' }
).format(new Date(timeMs));

export const buildHealthTrend = (
  aggregates: readonly CanonicalDailyAggregate[],
  metricType: string,
  range: HealthRange,
  nowMs = Date.now()
): HealthTrendPoint[] => {
  const cutoff = subtractCalendarDays(nowMs, RANGE_DAYS[range] - 1);
  const selected = aggregates
    .filter((row) => row.metricType === metricType)
    .filter((row) => {
      const time = Date.parse(`${row.healthDay}T12:00:00`);
      return Number.isFinite(time) && time >= cutoff && time <= nowMs + DAY_MS;
    });
  const deduplicated = new Map<string, CanonicalDailyAggregate>();
  selected.forEach((row) => {
    const identity = `${row.healthDay}:${row.metricType}`;
    const current = deduplicated.get(identity);
    if (!current || current.sourcePriority < row.sourcePriority || current.calculatedAtISO < row.calculatedAtISO) deduplicated.set(identity, row);
  });
  const buckets = new Map<string, { rows: CanonicalDailyAggregate[]; time: number }>();
  deduplicated.forEach((row) => {
    const time = Date.parse(`${row.healthDay}T12:00:00`);
    const key = bucketKey(time, range);
    const bucket = buckets.get(key) ?? { rows: [], time };
    bucket.rows.push(row);
    bucket.time = Math.max(bucket.time, time);
    buckets.set(key, bucket);
  });
  return [...buckets.entries()].map(([key, bucket]) => {
    const latestMethod = bucket.rows[0]?.method === 'LATEST';
    const values = bucket.rows.map((row) => row.value);
    const value = latestMethod ? bucket.rows.sort((a, b) => b.healthDay.localeCompare(a.healthDay))[0].value
      : values.reduce((sum, item) => sum + item, 0) / (bucket.rows[0]?.method === 'DAILY_AVERAGE' || bucket.rows[0]?.method === 'RAW_SERIES' ? values.length : 1);
    return { key, label: bucketLabel(bucket.time, range), value: displayValue(metricType, value), measuredAtISO: new Date(bucket.time).toISOString() };
  }).sort((a, b) => a.measuredAtISO.localeCompare(b.measuredAtISO)).slice(-RANGE_POINT_LIMITS[range]);
};
