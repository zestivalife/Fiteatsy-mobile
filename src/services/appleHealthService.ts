import { Platform } from 'react-native';
import { enableHealthKitBackgroundDelivery, isHealthKitAvailable, readHealthKitChanges,
  requestHealthKitAuthorization } from '../../modules/fiteatsy-healthkit';
import type { HealthObservationDraft, WearableSyncPayload } from '../types';

export const APPLE_HEALTH_SCOPES = ['steps','sleep_minutes','resting_heart_rate','heart_rate','hrv_ms',
  'workout_minutes','active_energy','distance','weight','hydration_ml','spo2','respiratory_rate'];
const APPLE_HEALTH_STATUS_KEYS: Record<string, string> = {
  steps: 'steps', sleep_minutes: 'sleep', resting_heart_rate: 'heart_rate', heart_rate: 'heart_rate',
  hrv_ms: 'hrv', workout_minutes: 'workouts', active_energy: 'calories', distance: 'distance',
  weight: 'weight', hydration_ml: 'hydration', spo2: 'spo2', respiratory_rate: 'respiratory_rate'
};
export const inspectAppleHealthAvailability = async () => Platform.OS === 'ios' && isHealthKitAvailable();
export const requestAppleHealthPermissions = async () => requestHealthKitAuthorization(APPLE_HEALTH_SCOPES);

export const syncFromAppleHealth = async (anchors: Record<string,string> = {}): Promise<WearableSyncPayload & { anchors: Record<string,string> }> => {
  if (Platform.OS !== 'ios' || !(await isHealthKitAvailable())) throw new Error('apple_health_unavailable');
  const start = new Date(Date.now() - 90 * 86400000).toISOString();
  const observations: HealthObservationDraft[] = []; const nextAnchors: Record<string,string> = {};
  const statuses: Record<string,string> = {};
  console.info('[AppleHealth] bounded read started', { metricCount: APPLE_HEALTH_SCOPES.length });
  for (const metric of APPLE_HEALTH_SCOPES) {
    try {
      const result = await readHealthKitChanges(metric, anchors[metric], anchors[metric] ? undefined : start);
      nextAnchors[metric] = result.anchor;
      result.samples.forEach((sample) => observations.push({ metricType:sample.metric,value:sample.value,unit:sample.unit,
        measuredAtISO:sample.endAtISO,startAtISO:sample.startAtISO,endAtISO:sample.endAtISO,
        timezoneOffsetMinutes:-new Date(sample.endAtISO).getTimezoneOffset(),sourceProvider:'apple_health',sourceRecordId:sample.id,
        syncKey:`apple_health:${sample.metric}:${sample.id}`,qualityStatus:'accepted',
        providerVersion:sample.measurementMethod ? `APPLE_${sample.measurementMethod}` : null,
        sourceMetadata:{recordType:sample.metric,sourceApplication:sample.sourceApplication,sleepStage:sample.sleepStage,
          measurementMethod:sample.measurementMethod} }));
      result.deletedIds.forEach((id) => observations.push({metricType:metric,value:0,unit:'deleted',measuredAtISO:new Date().toISOString(),
        sourceProvider:'apple_health',sourceRecordId:id,syncKey:`apple_health:${metric}:${id}`,deleted:true}));
      const statusKey = APPLE_HEALTH_STATUS_KEYS[metric] ?? metric;
      const nextStatus = result.samples.length ? 'synced' : 'no_recent_data';
      statuses[statusKey] = statuses[statusKey] === 'synced' ? 'synced' : nextStatus;
      console.info('[AppleHealth] metric read completed', { metric, status: nextStatus, recordCount: result.samples.length });
    } catch {
      const statusKey = APPLE_HEALTH_STATUS_KEYS[metric] ?? metric;
      if (statuses[statusKey] !== 'synced') statuses[statusKey] = 'unavailable';
      console.info('[AppleHealth] metric read unavailable', { metric });
    }
  }
  void enableHealthKitBackgroundDelivery(APPLE_HEALTH_SCOPES);
  return {deviceId:'ios-healthkit',brand:'Apple',model:'Apple Health',provider:'Apple Health',syncedAtISO:new Date().toISOString(),source:'api',
    metrics:{heartRateAvg:null,sleepHours:null,hydrationLiters:null,focusMinutes:null,breathingMinutes:null,movementMinutes:null},
    dataQuality:{confidence:observations.length ? 0.96 : 0,isEstimated:false,warnings:[],connectedMetrics:statuses as never},observations,anchors:nextAnchors};
};
