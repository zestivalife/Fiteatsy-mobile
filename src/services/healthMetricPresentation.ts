import type { HealthObservationDto } from './healthSyncManager';
import { HEALTH_METRIC_REGISTRY } from './healthMetricRegistry';

const dayKey = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/** Builds card values without changing or manufacturing source observations.
 * Cumulative cards use platform source-aware daily statistics; interval cards
 * sum the latest local day; point-in-time metrics retain their latest sample. */
export const buildPresentedHealthObservations = (
  source: HealthObservationDto[],
  devicePresentation: HealthObservationDto[] = [],
  nowMs = Date.now()
) => {
  const futureToleranceMs = 5 * 60_000;
  const valid = source.filter((item) => !item.deleted && Number.isFinite(item.value)
    && Date.parse(item.measuredAtISO) <= nowMs + futureToleranceMs);
  const byMetric = new Map<string, HealthObservationDto[]>();
  valid.forEach((item) => byMetric.set(item.metricType, [...(byMetric.get(item.metricType) ?? []), item]));
  const result = new Map<string, HealthObservationDto>();
  HEALTH_METRIC_REGISTRY.forEach((definition) => {
    const items = byMetric.get(definition.backendCanonicalType) ?? [];
    const latest = [...items].sort((a,b) => b.measuredAtISO.localeCompare(a.measuredAtISO))[0];
    if (!latest) return;
    if (definition.aggregation === 'INTERVAL') {
      const latestDay = dayKey(latest.measuredAtISO);
      const dayItems = items.filter((item) => dayKey(item.measuredAtISO) === latestDay);
      result.set(definition.backendCanonicalType, {...latest,
        id:`presentation:${definition.metricKey}:${latestDay}`,value:dayItems.reduce((total,item)=>total+item.value,0)});
    } else {
      result.set(definition.backendCanonicalType, latest);
    }
  });
  devicePresentation.filter((item) => Date.parse(item.measuredAtISO) <= nowMs + futureToleranceMs)
    .forEach((item) => result.set(item.metricType, item));
  return result;
};
