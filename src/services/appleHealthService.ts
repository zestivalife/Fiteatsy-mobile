import { Platform } from 'react-native';
import { enableHealthKitBackgroundDelivery, inspectHealthKitAuthorization, isHealthKitAvailable, readHealthKitChanges,
  readHealthKitCumulativeStatistics, requestHealthKitAuthorization } from '../../modules/fiteatsy-healthkit';
import type { HealthObservationDraft, WearableSyncPayload } from '../types';
import { APPLE_HEALTH_QUERYABLE_METRICS, APPLE_HEALTH_READ_TYPES } from './healthMetricRegistry';

export const APPLE_HEALTH_SCOPES = APPLE_HEALTH_READ_TYPES;
export const APPLE_HEALTH_AVAILABILITY_TIMEOUT_MS = 5_000;
export const APPLE_HEALTH_PERMISSION_TIMEOUT_MS = 20_000;
// Thirteen reads run serially. Keep the worst-case local read budget
// below HEALTH_SYNC_PIPELINE_TIMEOUT_MS even when every native query times out.
export const APPLE_HEALTH_METRIC_TIMEOUT_MS = 3_000;
// Keep the native-to-JS transfer deliberately small. A first HealthKit read can
// contain years of dense heart-rate samples; retaining several 2,500-record
// pages for three metrics at once caused >1.6 GiB resident memory and Jetsam.
// The returned anchor makes every transaction incremental, so subsequent
// explicit syncs continue without sacrificing source records.
export const APPLE_HEALTH_QUERY_CONCURRENCY = 1;
export const APPLE_HEALTH_MAX_PAGES_PER_METRIC = 1;
const APPLE_HEALTH_STATUS_KEYS: Record<string, string> = {
  steps: 'steps', sleep_minutes: 'sleep', resting_heart_rate: 'heart_rate', heart_rate: 'heart_rate',
  hrv_ms: 'hrv', workout_minutes: 'workouts', exercise_minutes: 'workouts', active_energy: 'calories', distance: 'distance',
  weight: 'weight', hydration_ml: 'hydration', spo2: 'spo2', respiratory_rate: 'respiratory_rate'
};
export const withAppleHealthTimeout = <T>(operation: Promise<T>, timeoutMs: number, code: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(code)), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });

const diagnostic = (event: string, metadata: Record<string, string | number>) => {
  if (__DEV__) console.info(`[HealthSync] ${event}`, metadata);
};

export const inspectAppleHealthAvailability = async () => Platform.OS === 'ios' && withAppleHealthTimeout(
  isHealthKitAvailable(), APPLE_HEALTH_AVAILABILITY_TIMEOUT_MS, 'apple_health_availability_timeout'
);
export const requestAppleHealthPermissions = async () => withAppleHealthTimeout(
  requestHealthKitAuthorization(APPLE_HEALTH_SCOPES), APPLE_HEALTH_PERMISSION_TIMEOUT_MS, 'apple_health_permission_timeout'
);
export const inspectAppleHealthPermissionState = async () => withAppleHealthTimeout(
  inspectHealthKitAuthorization(APPLE_HEALTH_SCOPES), APPLE_HEALTH_AVAILABILITY_TIMEOUT_MS,
  'apple_health_permission_status_timeout'
);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const average = (values: number[]) => values.length ? sum(values) / values.length : null;
const validValues = (values: number[]) => values.filter((value) => Number.isFinite(value) && value > 0);

export const settleWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> => {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
  return results;
};

export const syncFromAppleHealth = async (
  anchors: Record<string,string> = {},
  options: { forceBackfill?: boolean } = {}
): Promise<WearableSyncPayload & { anchors: Record<string,string> }> => {
  const availabilityStartedAt = Date.now();
  if (Platform.OS !== 'ios' || !(await inspectAppleHealthAvailability())) throw new Error('apple_health_unavailable');
  diagnostic('HEALTHKIT_AVAILABLE', { durationMs: Date.now() - availabilityStartedAt, status: 'SUCCESS' });
  const observations: HealthObservationDraft[] = []; const presentationObservations: HealthObservationDraft[] = [];
  const nextAnchors: Record<string,string> = {};
  const statuses: Record<string,string> = {};
  const metricValues: Record<string, number[]> = {};
  const metricDiagnostics:NonNullable<WearableSyncPayload['dataQuality']['metricDiagnostics']>={};
  diagnostic('HEALTH_SYNC_START', { metricCount: APPLE_HEALTH_SCOPES.length, status: 'STARTED' });
  // Statistics are independent of anchored change reads. Starting them here
  // prevents their timeout budget from being added after every read batch.
  const readStatistics = async () => {
    const results: Array<{ metric: string; value: number | null }> = [];
    for (const metric of ['steps', 'active_energy', 'distance', 'exercise_minutes']) {
    const startDate = new Date(); startDate.setHours(0, 0, 0, 0);
    const start = startDate.toISOString();
    try {
      const statistic = await withAppleHealthTimeout(readHealthKitCumulativeStatistics(metric, start, new Date().toISOString()),
        APPLE_HEALTH_METRIC_TIMEOUT_MS, `apple_health_statistics_timeout:${metric}`);
      results.push({ metric, value: statistic.value });
    } catch {
      results.push({ metric, value: null });
    }
    }
    return results;
  };
  const settledReads = await settleWithConcurrency(APPLE_HEALTH_SCOPES, APPLE_HEALTH_QUERY_CONCURRENCY, async (metric) => {
    const definition = APPLE_HEALTH_QUERYABLE_METRICS.find((item) => item.appleHealthType === metric);
    const start = new Date(Date.now() - (definition?.syncWindowDays ?? 30) * 86400000).toISOString();
    const startedAt = Date.now();
    diagnostic('METRIC_QUERY_START', { metric, durationMs: 0, status: 'CHECKING' });
    try {
      let pageAnchor = options.forceBackfill ? undefined : anchors[metric];
      const samples = []; const deletedIds:string[] = [];
      let hasMore = false; let pagesRead = 0;
      do {
        const page = await withAppleHealthTimeout(
          readHealthKitChanges(metric, pageAnchor,
            options.forceBackfill || !pageAnchor ? start : undefined),
          APPLE_HEALTH_METRIC_TIMEOUT_MS,
          `apple_health_metric_timeout:${metric}`
        );
        samples.push(...page.samples); deletedIds.push(...page.deletedIds);
        pageAnchor = page.anchor; hasMore = page.hasMore; pagesRead += 1;
      } while (hasMore && pagesRead < APPLE_HEALTH_MAX_PAGES_PER_METRIC);
      const result = { samples, deletedIds, anchor: pageAnchor ?? '', hasMore };
      const status = result.samples.length ? 'SUCCESS' : 'NO_DATA';
      diagnostic(status === 'SUCCESS' ? 'METRIC_QUERY_SUCCESS' : 'METRIC_QUERY_NO_DATA', {
        metric, durationMs: Date.now() - startedAt, status
      });
      return { metric, result, status };
    } catch (error) {
      const timeout = error instanceof Error && error.message.startsWith('apple_health_metric_timeout:');
      diagnostic(timeout ? 'METRIC_QUERY_TIMEOUT' : 'METRIC_QUERY_ERROR', {
        metric, durationMs: Date.now() - startedAt, status: timeout ? 'TIMEOUT' : 'ERROR'
      });
      throw { metric, timeout, error };
    }
  });

  settledReads.forEach((settled, index) => {
    const metric = APPLE_HEALTH_SCOPES[index];
    if (settled.status === 'fulfilled') {
      const { result } = settled.value;
      // An empty pre-authorisation query can still return an anchor. Persisting
      // it would make the first authorised read skip existing history forever.
      // Retain an existing cursor on a genuine incremental no-op, but only
      // advance/create it when HealthKit returned a change.
      if (result.samples.length > 0 || result.deletedIds.length > 0) {
        nextAnchors[metric] = result.anchor;
      }
      const observationCountBefore = observations.length;
      result.samples.forEach((sample) => {
        if (sample.metric === 'sleep_minutes' && sample.sleepStage === 'IN_BED') return;
        const canonicalMetric = sample.metric === 'exercise_minutes' ? 'active_minutes'
          : sample.metric === 'hrv_ms' ? 'hrv_sdnn_ms' : sample.metric;
        if(sample.metric!=='sleep_minutes'||sample.sleepStage!=='AWAKE') {
          const values = metricValues[canonicalMetric] ?? (metricValues[canonicalMetric] = []);
          values.push(sample.value);
        }
        // Zero/negative quantity samples do not contribute to Fiteatsy health
        // aggregates and are invalid under the backend observation contract.
        // Drop them locally so one empty HealthKit sample cannot poison a
        // complete upload batch. Deletion tombstones remain handled below.
        if (!Number.isFinite(sample.value) || sample.value <= 0) return;
        const base={value:sample.value,unit:sample.unit,
          measuredAtISO:sample.endAtISO,startAtISO:sample.startAtISO,endAtISO:sample.endAtISO,
          timezoneOffsetMinutes:-new Date(sample.endAtISO).getTimezoneOffset(),sourceProvider:'apple_health',sourceRecordId:sample.id,
          qualityStatus:'accepted' as const,
          providerVersion:sample.measurementMethod ? `APPLE_${sample.measurementMethod}` : null,
          sourceMetadata:{recordType:sample.metric,sourceApplication:sample.sourceApplication,sleepStage:sample.sleepStage,
            measurementMethod:sample.measurementMethod,
            workoutActivityType:typeof sample.metadata?.workoutActivityType==='number'?sample.metadata.workoutActivityType:undefined,
            workoutEnergyKcal:typeof sample.metadata?.energyKcal==='number'?sample.metadata.energyKcal:undefined,
            workoutDistanceMeters:typeof sample.metadata?.distanceMeters==='number'?sample.metadata.distanceMeters:undefined,
            workoutDurationSeconds:typeof sample.metadata?.durationSeconds==='number'?sample.metadata.durationSeconds:undefined,
            sourceVersion:sample.sourceVersion,sourceProductType:sample.sourceProductType,
            canonicalFingerprint:sample.metric==='workout_minutes'
              ? [Math.round(Date.parse(sample.startAtISO)/60_000),Math.round(Date.parse(sample.endAtISO)/60_000),Number(sample.value.toFixed(1))].join(':')
              : undefined,
            ...(sample.device ? { device: { manufacturer:'Apple', model:sample.device } } : {})}};
        if(sample.metric!=='sleep_minutes'||sample.sleepStage!=='AWAKE')observations.push({...base,metricType:canonicalMetric,
          syncKey:`apple_health:${sample.metric}:${sample.sourceApplication ?? 'unknown_source'}:${sample.id}`});
        if(sample.metric==='sleep_minutes'&&sample.sleepStage){const stageMetric={AWAKE:'sleep_awake_minutes',DEEP:'sleep_deep_minutes',
          REM:'sleep_rem_minutes',CORE:'sleep_core_minutes'}[sample.sleepStage];
          if(stageMetric)observations.push({...base,metricType:stageMetric,
            syncKey:`apple_health:${stageMetric}:${sample.sourceApplication ?? 'unknown_source'}:${sample.id}`});}
      });
      result.deletedIds.forEach((id) => observations.push({metricType:'provider_record_deletion',value:0,unit:'deleted',measuredAtISO:new Date().toISOString(),
        sourceProvider:'apple_health',sourceRecordId:id,syncKey:`apple_health:${metric}:${id}`,deleted:true}));
      const statusKey = APPLE_HEALTH_STATUS_KEYS[metric] ?? metric;
      const acceptedSampleCount = observations.length - observationCountBefore - result.deletedIds.length;
      metricDiagnostics[metric]={nativeRecordCount:result.samples.length,normalizedRecordCount:acceptedSampleCount,
        droppedRecordCount:result.samples.length-acceptedSampleCount,
        dropReasons:result.samples.length===acceptedSampleCount?[]:['NON_CONSUMPTIVE_OR_NON_POSITIVE_SAMPLE']};
      const nextStatus = acceptedSampleCount > 0 ? 'synced' : 'no_recent_data';
      statuses[statusKey] = statuses[statusKey] === 'synced' ? 'synced' : nextStatus;
    } else {
      const statusKey = APPLE_HEALTH_STATUS_KEYS[metric] ?? metric;
      if (statuses[statusKey] !== 'synced') statuses[statusKey] = 'unavailable';
    }
  });
  // HealthKit statistics apply Apple's source-priority policy for cumulative
  // product totals while anchored source rows remain available for audit.
  const statisticEndISO = new Date().toISOString();
  const statisticStartDate = new Date(); statisticStartDate.setHours(0, 0, 0, 0);
  (await readStatistics()).forEach(({ metric, value }) => {
    // Older installed native builds may not expose statistics yet. Anchored
    // values remain truthful fallback data until the next native build.
    if (value != null) {
      metricValues[metric] = value > 0 ? [value] : [];
      if (value > 0) {
        const canonicalMetric = metric === 'exercise_minutes' ? 'active_minutes' : metric;
        const unit = {steps:'count',active_energy:'kcal',distance:'m',exercise_minutes:'min'}[metric] ?? '';
        presentationObservations.push({metricType:canonicalMetric,value,unit,measuredAtISO:statisticEndISO,
          startAtISO:statisticStartDate.toISOString(),endAtISO:statisticEndISO,sourceProvider:'apple_health',
          sourceRecordId:`daily-total:${metric}:${statisticStartDate.toISOString().slice(0,10)}`,
          qualityStatus:'accepted',sourceMetadata:{recordType:metric,measurementMethod:'HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'}});
      }
    }
  });
  void withAppleHealthTimeout(enableHealthKitBackgroundDelivery(APPLE_HEALTH_SCOPES), 5_000,
    'apple_health_background_delivery_timeout').catch(() => undefined);
  const steps = sum(validValues(metricValues.steps ?? []));
  const sleepMinutes = sum(validValues(metricValues.sleep_minutes ?? []));
  const restingHeartRate = average(validValues(metricValues.resting_heart_rate ?? []))
    ?? average(validValues(metricValues.heart_rate ?? []));
  const hrvMs = average(validValues(metricValues.hrv_sdnn_ms ?? []));
  const workoutMinutes = Math.max(sum(validValues(metricValues.workout_minutes ?? [])), sum(validValues(metricValues.active_minutes ?? [])));
  const activeEnergy = sum(validValues(metricValues.active_energy ?? []));
  diagnostic('HEALTH_SYNC_COMPLETE', { durationMs: 0, status: observations.length ? 'SUCCESS' : 'NO_DATA' });
  const metricStatuses = Object.values(statuses);
  return {deviceId:'ios-healthkit',brand:'Apple',model:'Apple Health',provider:'Apple Health',syncedAtISO:new Date().toISOString(),source:'api',
    metrics:{heartRateAvg:restingHeartRate,sleepHours:sleepMinutes > 0 ? sleepMinutes / 60 : null,
      hydrationLiters:sum(validValues(metricValues.hydration_ml ?? [])) / 1000 || null,focusMinutes:null,breathingMinutes:null,
      movementMinutes:workoutMinutes || null,hrvMs,caloriesKcal:activeEnergy || null,workoutMinutes:workoutMinutes || null,
      spo2Pct:average(validValues(metricValues.spo2 ?? [])),respiratoryRateBrpm:average(validValues(metricValues.respiratory_rate ?? []))},
    dataQuality:{confidence:observations.length ? 0.96 : 0,isEstimated:false,
      warnings:observations.length ? [] : ['No recent Apple Health records were found for the requested metrics.'],
      connectedMetrics:statuses as never,syncCounts:{requestedMetricCount:APPLE_HEALTH_SCOPES.length,
        metricsWithData:metricStatuses.filter((status)=>status==='synced').length,
        metricsNoData:metricStatuses.filter((status)=>status==='no_recent_data').length,
        metricsErrored:metricStatuses.filter((status)=>status==='unavailable').length,
        sourceRecordCount:observations.filter((item)=>!item.deleted).length,
        normalizedRecordCount:observations.length},metricDiagnostics,
      normalizedDomains:{Activity:steps > 0 || workoutMinutes > 0 ? Math.max(steps / 100, workoutMinutes) : null,
        Sleep:sleepMinutes > 0 ? sleepMinutes / 60 : null,Recovery:hrvMs,Calm:null,Cycle:null,Nutrition:null}},observations,
    presentationObservations,anchors:nextAnchors};
};
