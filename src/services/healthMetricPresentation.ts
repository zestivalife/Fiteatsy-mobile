import type { HealthObservationDto } from './healthSyncManager';
import { HEALTH_METRIC_REGISTRY } from './healthMetricRegistry';
import { aggregateCanonicalHealthObservations, type CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';

/** Builds card values without changing or manufacturing source observations.
 * Cumulative cards use platform source-aware daily statistics; interval cards
 * sum the latest local day; point-in-time metrics retain their latest sample. */
export const buildPresentedHealthObservations = (
  source: HealthObservationDto[],
  devicePresentation: HealthObservationDto[] = [],
  persistedAggregates: CanonicalDailyAggregate[] = [],
  nowMs = Date.now(),
  timezoneOffsetMinutes = -new Date(nowMs).getTimezoneOffset()
) => {
  const futureToleranceMs = 5 * 60_000;
  const valid = source.filter((item) => !item.deleted && Number.isFinite(item.value)
    && Date.parse(item.measuredAtISO) <= nowMs + futureToleranceMs);
  const all = [
    ...valid,
    ...devicePresentation.filter((item) => Date.parse(item.measuredAtISO) <= nowMs + futureToleranceMs)
  ];
  const recomputedAggregates = aggregateCanonicalHealthObservations(all.map((item) => ({
    ...item,
    sourceProvider: item.sourceMetadata?.measurementMethod === 'HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'
      ? 'platform_aggregate'
      : item.sourceProvider
  })), { fallbackOffsetMinutes: timezoneOffsetMinutes, nowMs });
  // The persisted aggregate projection is the canonical local authority shared
  // by Home, Tracker and the sync screen. Prefer freshly recomputed rows when
  // their source observations are in memory, then fill gaps from the durable
  // projection. This prevents a successful native read from rendering a blank
  // value merely because the bounded in-memory observation list lacks lineage.
  const aggregateByIdentity = new Map(persistedAggregates.map((item) => [
    `${item.healthDay}|${item.metricType}`,
    item
  ]));
  recomputedAggregates.forEach((item) => aggregateByIdentity.set(`${item.healthDay}|${item.metricType}`, item));
  const aggregates = [...aggregateByIdentity.values()];
  const currentHealthDay = new Date(nowMs + timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
  const result = new Map<string, HealthObservationDto>();
  HEALTH_METRIC_REGISTRY.forEach((definition) => {
    const candidates=aggregates.filter(row=>row.metricType===definition.backendCanonicalType);
    const aggregate=definition.aggregation==='LATEST'
      ? candidates.filter((row)=>nowMs-Date.parse(row.latestMeasuredAtISO)<=definition.syncWindowDays*86_400_000)
        .sort((a,b)=>b.latestMeasuredAtISO.localeCompare(a.latestMeasuredAtISO))[0]
      : candidates.find((row)=>row.healthDay===currentHealthDay);
    if (!aggregate) return;
    const sourceObservation = all.find((item) => (
      item.syncKey || item.sourceRecordId || item.id
    ) === aggregate.sourceObservationIds[0])
      ?? all.find((item) => item.metricType === definition.backendCanonicalType);
    result.set(definition.backendCanonicalType, sourceObservation ? {
      ...sourceObservation,
      id: `aggregate:${aggregate.lineageHash}`,
      value: aggregate.value,
      unit: aggregate.unit,
      measuredAtISO: aggregate.latestMeasuredAtISO
    } : {
      id: `aggregate:${aggregate.lineageHash}`,
      fiteatsyClientId: 'local',
      createdAtISO: aggregate.calculatedAtISO,
      metricType: aggregate.metricType,
      value: aggregate.value,
      unit: aggregate.unit,
      measuredAtISO: aggregate.latestMeasuredAtISO,
      sourceProvider: aggregate.sourceProvider,
      sourceRecordId: aggregate.sourceObservationIds[0] ?? aggregate.lineageHash,
      qualityStatus: 'accepted',
      sourceMetadata: { measurementMethod: aggregate.aggregateSource }
    });
  });
  return result;
};
