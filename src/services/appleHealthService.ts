import { Platform } from 'react-native';
import { enableHealthKitBackgroundDelivery, isHealthKitAvailable, readHealthKitChanges,
  requestHealthKitAuthorization } from '../../modules/fiteatsy-healthkit';
import type { HealthObservationDraft, WearableSyncPayload } from '../types';

export const APPLE_HEALTH_SCOPES = ['steps','sleep_minutes','resting_heart_rate','heart_rate','hrv_ms',
  'workout_minutes','exercise_minutes','active_energy','distance','weight','hydration_ml','spo2','respiratory_rate'];
const APPLE_HEALTH_STATUS_KEYS: Record<string, string> = {
  steps: 'steps', sleep_minutes: 'sleep', resting_heart_rate: 'heart_rate', heart_rate: 'heart_rate',
  hrv_ms: 'hrv', workout_minutes: 'workouts', exercise_minutes: 'workouts', active_energy: 'calories', distance: 'distance',
  weight: 'weight', hydration_ml: 'hydration', spo2: 'spo2', respiratory_rate: 'respiratory_rate'
};
export const inspectAppleHealthAvailability = async () => Platform.OS === 'ios' && isHealthKitAvailable();
export const requestAppleHealthPermissions = async () => requestHealthKitAuthorization(APPLE_HEALTH_SCOPES);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const average = (values: number[]) => values.length ? sum(values) / values.length : null;
const validValues = (values: number[]) => values.filter((value) => Number.isFinite(value) && value > 0);

export const syncFromAppleHealth = async (anchors: Record<string,string> = {}): Promise<WearableSyncPayload & { anchors: Record<string,string> }> => {
  if (Platform.OS !== 'ios' || !(await isHealthKitAvailable())) throw new Error('apple_health_unavailable');
  const start = new Date(Date.now() - 90 * 86400000).toISOString();
  const observations: HealthObservationDraft[] = []; const nextAnchors: Record<string,string> = {};
  const statuses: Record<string,string> = {};
  const metricValues: Record<string, number[]> = {};
  console.info('[AppleHealth] bounded read started', { metricCount: APPLE_HEALTH_SCOPES.length });
  for (const metric of APPLE_HEALTH_SCOPES) {
    try {
      const result = await readHealthKitChanges(metric, anchors[metric], anchors[metric] ? undefined : start);
      nextAnchors[metric] = result.anchor;
      const observationCountBefore = observations.length;
      result.samples.forEach((sample) => {
        if (sample.metric === 'sleep_minutes' && ['AWAKE', 'IN_BED'].includes(sample.sleepStage ?? '')) return;
        const canonicalMetric = sample.metric === 'exercise_minutes' ? 'active_minutes' : sample.metric;
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
      const canonicalDeletionMetric = metric === 'exercise_minutes' ? 'active_minutes' : metric;
      result.deletedIds.forEach((id) => observations.push({metricType:canonicalDeletionMetric,value:0,unit:'deleted',measuredAtISO:new Date().toISOString(),
        sourceProvider:'apple_health',sourceRecordId:id,syncKey:`apple_health:${metric}:${id}`,deleted:true}));
      const statusKey = APPLE_HEALTH_STATUS_KEYS[metric] ?? metric;
      const acceptedSampleCount = observations.length - observationCountBefore - result.deletedIds.length;
      const nextStatus = acceptedSampleCount > 0 ? 'synced' : 'no_recent_data';
      statuses[statusKey] = statuses[statusKey] === 'synced' ? 'synced' : nextStatus;
      console.info('[AppleHealth] metric read completed', { metric, status: nextStatus, recordCount: result.samples.length });
    } catch {
      const statusKey = APPLE_HEALTH_STATUS_KEYS[metric] ?? metric;
      if (statuses[statusKey] !== 'synced') statuses[statusKey] = 'unavailable';
      console.info('[AppleHealth] metric read unavailable', { metric });
    }
  }
  void enableHealthKitBackgroundDelivery(APPLE_HEALTH_SCOPES);
  const steps = sum(validValues(metricValues.steps ?? []));
  const sleepMinutes = sum(validValues(metricValues.sleep_minutes ?? []));
  const restingHeartRate = average(validValues(metricValues.resting_heart_rate ?? []))
    ?? average(validValues(metricValues.heart_rate ?? []));
  const hrvMs = average(validValues(metricValues.hrv_ms ?? []));
  const workoutMinutes = Math.max(sum(validValues(metricValues.workout_minutes ?? [])), sum(validValues(metricValues.active_minutes ?? [])));
  const activeEnergy = sum(validValues(metricValues.active_energy ?? []));
  return {deviceId:'ios-healthkit',brand:'Apple',model:'Apple Health',provider:'Apple Health',syncedAtISO:new Date().toISOString(),source:'api',
    metrics:{heartRateAvg:restingHeartRate,sleepHours:sleepMinutes > 0 ? sleepMinutes / 60 : null,
      hydrationLiters:sum(validValues(metricValues.hydration_ml ?? [])) / 1000 || null,focusMinutes:null,breathingMinutes:null,
      movementMinutes:workoutMinutes || null,hrvMs,caloriesKcal:activeEnergy || null,workoutMinutes:workoutMinutes || null,
      spo2Pct:average(validValues(metricValues.spo2 ?? [])),respiratoryRateBrpm:average(validValues(metricValues.respiratory_rate ?? []))},
    dataQuality:{confidence:observations.length ? 0.96 : 0,isEstimated:false,
      warnings:observations.length ? [] : ['No recent Apple Health records were found for the requested metrics.'],
      connectedMetrics:statuses as never,
      normalizedDomains:{Activity:steps > 0 || workoutMinutes > 0 ? Math.max(steps / 100, workoutMinutes) : null,
        Sleep:sleepMinutes > 0 ? sleepMinutes / 60 : null,Recovery:hrvMs,Calm:null,Cycle:null,Nutrition:null}},observations,anchors:nextAnchors};
};
