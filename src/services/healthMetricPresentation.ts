import type { HealthObservationDto } from './healthSyncManager';
import { HEALTH_METRIC_REGISTRY } from './healthMetricRegistry';
import { aggregateCanonicalHealthObservations } from '@fiteatsy/health-intelligence';

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
  const all=[...valid,...devicePresentation.filter((item) => Date.parse(item.measuredAtISO) <= nowMs + futureToleranceMs)];
  const aggregates=aggregateCanonicalHealthObservations(all.map(item=>({...item,sourceProvider:item.sourceMetadata?.measurementMethod==='HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'?'platform_aggregate':item.sourceProvider})),
    {fallbackOffsetMinutes:-new Date().getTimezoneOffset(),nowMs});
  const result = new Map<string, HealthObservationDto>();
  HEALTH_METRIC_REGISTRY.forEach((definition) => {
    const aggregate=aggregates.filter(row=>row.metricType===definition.backendCanonicalType).sort((a,b)=>b.healthDay.localeCompare(a.healthDay))[0];
    if(!aggregate)return;const source=all.find(item=>(item.syncKey||item.sourceRecordId||item.id)===aggregate.sourceObservationIds[0])??all.find(item=>item.metricType===definition.backendCanonicalType);
    if(!source)return;result.set(definition.backendCanonicalType,{...source,id:`aggregate:${aggregate.lineageHash}`,value:aggregate.value,
      unit:aggregate.unit,measuredAtISO:aggregate.latestMeasuredAtISO});
  });
  return result;
};
