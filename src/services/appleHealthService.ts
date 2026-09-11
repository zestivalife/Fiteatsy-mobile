import { Platform } from 'react-native';
import { enableHealthKitBackgroundDelivery, inspectHealthKitAuthorization, isHealthKitAvailable, readHealthKitChanges,
  requestHealthKitAuthorization } from '../../modules/fiteatsy-healthkit';
import type { HealthObservationDraft, WearableSyncPayload } from '../types';
import { APPLE_HEALTH_READ_TYPES } from './healthMetricRegistry';

export const APPLE_HEALTH_SCOPES = APPLE_HEALTH_READ_TYPES;
export const APPLE_HEALTH_AVAILABILITY_TIMEOUT_MS = 5_000;
export const APPLE_HEALTH_PERMISSION_TIMEOUT_MS = 20_000;
export const APPLE_HEALTH_METRIC_TIMEOUT_MS = 8_000;
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

export const syncFromAppleHealth = async (anchors: Record<string,string> = {}): Promise<WearableSyncPayload & { anchors: Record<string,string> }> => {
  const availabilityStartedAt = Date.now();
  if (Platform.OS !== 'ios' || !(await inspectAppleHealthAvailability())) throw new Error('apple_health_unavailable');
  diagnostic('HEALTHKIT_AVAILABLE', { durationMs: Date.now() - availabilityStartedAt, status: 'SUCCESS' });
  const start = new Date(Date.now() - 90 * 86400000).toISOString();
  const observations: HealthObservationDraft[] = []; const nextAnchors: Record<string,string> = {};
  const statuses: Record<string,string> = {};
  const metricValues: Record<string, number[]> = {};
  diagnostic('HEALTH_SYNC_START', { metricCount: APPLE_HEALTH_SCOPES.length, status: 'STARTED' });
  const settledReads = await Promise.allSettled(APPLE_HEALTH_SCOPES.map(async (metric) => {
    const startedAt = Date.now();
    diagnostic('METRIC_QUERY_START', { metric, durationMs: 0, status: 'CHECKING' });
    try {
      const result = await withAppleHealthTimeout(
        readHealthKitChanges(metric, anchors[metric], anchors[metric] ? undefined : start),
        APPLE_HEALTH_METRIC_TIMEOUT_MS,
        `apple_health_metric_timeout:${metric}`
      );
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
  }));

  settledReads.forEach((settled, index) => {
    const metric = APPLE_HEALTH_SCOPES[index];
    if (settled.status === 'fulfilled') {
      const { result } = settled.value;
      nextAnchors[metric] = result.anchor;
      const observationCountBefore = observations.length;
      result.samples.forEach((sample) => {
        if (sample.metric === 'sleep_minutes' && ['AWAKE', 'IN_BED'].includes(sample.sleepStage ?? '')) return;
        const canonicalMetric = sample.metric === 'exercise_minutes' ? 'active_minutes'
          : sample.metric === 'hrv_ms' ? 'hrv_sdnn_ms' : sample.metric;
        metricValues[canonicalMetric] = [...(metricValues[canonicalMetric] ?? []), sample.value];
        observations.push({ metricType:canonicalMetric,value:sample.value,unit:sample.unit,
          measuredAtISO:sample.endAtISO,startAtISO:sample.startAtISO,endAtISO:sample.endAtISO,
          timezoneOffsetMinutes:-new Date(sample.endAtISO).getTimezoneOffset(),sourceProvider:'apple_health',sourceRecordId:sample.id,
          syncKey:`apple_health:${sample.metric}:${sample.id}`,qualityStatus:'accepted',
          providerVersion:sample.measurementMethod ? `APPLE_${sample.measurementMethod}` : null,
          sourceMetadata:{recordType:sample.metric,sourceApplication:sample.sourceApplication,sleepStage:sample.sleepStage,
            measurementMethod:sample.measurementMethod,
            ...(sample.device ? { device: { manufacturer:'Apple', model:sample.device } } : {})} });
      });
      const canonicalDeletionMetric = metric === 'exercise_minutes' ? 'active_minutes'
        : metric === 'hrv_ms' ? 'hrv_sdnn_ms' : metric;
      result.deletedIds.forEach((id) => observations.push({metricType:canonicalDeletionMetric,value:0,unit:'deleted',measuredAtISO:new Date().toISOString(),
        sourceProvider:'apple_health',sourceRecordId:id,syncKey:`apple_health:${metric}:${id}`,deleted:true}));
      const statusKey = APPLE_HEALTH_STATUS_KEYS[metric] ?? metric;
      const acceptedSampleCount = observations.length - observationCountBefore - result.deletedIds.length;
      const nextStatus = acceptedSampleCount > 0 ? 'synced' : 'no_recent_data';
      statuses[statusKey] = statuses[statusKey] === 'synced' ? 'synced' : nextStatus;
    } else {
      const statusKey = APPLE_HEALTH_STATUS_KEYS[metric] ?? metric;
      if (statuses[statusKey] !== 'synced') statuses[statusKey] = 'unavailable';
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
        normalizedRecordCount:observations.length},
      normalizedDomains:{Activity:steps > 0 || workoutMinutes > 0 ? Math.max(steps / 100, workoutMinutes) : null,
        Sleep:sleepMinutes > 0 ? sleepMinutes / 60 : null,Recovery:hrvMs,Calm:null,Cycle:null,Nutrition:null}},observations,anchors:nextAnchors};
};
