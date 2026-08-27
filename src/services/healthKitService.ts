import { Platform } from 'react-native';
import { HealthObservationDraft, WearableSyncPayload } from '../types';

const DAY = 86_400_000;
const READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierDistanceWalkingRunning'
] as const;

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

const loadHealthKit = async (): Promise<HealthKitModule> => import('@kingstinct/react-native-healthkit');

export const requestHealthKitPermissionsOnly = async () => {
  if (Platform.OS !== 'ios') throw new Error('healthkit_unsupported_platform');
  const healthKit = await loadHealthKit();
  if (!(await healthKit.isHealthDataAvailableAsync())) throw new Error('healthkit_unavailable');
  const requested = await healthKit.requestAuthorization({ toRead: READ_TYPES });
  if (!requested) throw new Error('healthkit_permission_required');
  // Apple intentionally does not reveal read-authorization status. Treat this
  // only as completion of the system request; subsequent reads establish which
  // metrics are available without fabricating a granted count.
  return { requestedCount: READ_TYPES.length, grantedCount: 0, authorizationRequestCompleted: true };
};

const average = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
const validDate = (value: Date) => Number.isFinite(value.getTime()) && value.getTime() <= Date.now() + 300_000;

export const syncFromHealthKit = async (): Promise<WearableSyncPayload> => {
  if (Platform.OS !== 'ios') throw new Error('healthkit_unsupported_platform');
  const healthKit = await loadHealthKit();
  if (!(await healthKit.isHealthDataAvailableAsync())) throw new Error('healthkit_unavailable');

  const endDate = new Date();
  const observations: HealthObservationDraft[] = [];
  const connectedMetrics: NonNullable<WearableSyncPayload['dataQuality']['connectedMetrics']> = {
    sleep: 'no_recent_data', steps: 'no_recent_data', heart_rate: 'no_recent_data', hrv: 'no_recent_data',
    calories: 'no_recent_data', workouts: 'no_recent_data', stress: 'unsupported', cycle: 'unsupported',
    spo2: 'unsupported', respiratory_rate: 'unsupported'
  };

  const addObservation = (metricType: string, value: number, unit: string, sample: {
    uuid: string; startDate: Date; endDate: Date; sourceRevision: { source: { bundleIdentifier: string; name: string } };
  }, recordType: string) => {
    if (!Number.isFinite(value) || value <= 0 || !validDate(sample.endDate) || sample.endDate < sample.startDate) return;
    const rounded = Number(value.toFixed(metricType === 'sleep_minutes' ? 0 : 2));
    const source = sample.sourceRevision.source;
    observations.push({
      metricType, value: rounded, unit, measuredAtISO: sample.endDate.toISOString(), sourceProvider: 'apple_health',
      sourceRecordId: sample.uuid,
      syncKey: `apple_health:${recordType}:${source.bundleIdentifier}:${sample.uuid}`,
      qualityStatus: 'accepted',
      sourceMetadata: {
        recordType, sourceApplication: source.bundleIdentifier,
        startAtISO: sample.startDate.toISOString(), endAtISO: sample.endDate.toISOString(),
        originalValue: value, originalUnit: unit
      }
    });
  };

  const queryQuantity = async <T extends Parameters<HealthKitModule['queryQuantitySamples']>[0]>(
    identifier: T, days: number, unit: string, metricType: string
  ) => {
    try {
      const samples = await healthKit.queryQuantitySamples(identifier, {
        filter: { date: { startDate: new Date(endDate.getTime() - DAY * days), endDate } },
        limit: 0, ascending: true, unit: unit as never
      });
      samples.forEach((sample) => addObservation(metricType, sample.quantity, unit, sample, identifier));
      return samples.map((sample) => sample.quantity).filter((value) => Number.isFinite(value) && value > 0);
    } catch {
      return [] as number[];
    }
  };

  const steps = await queryQuantity('HKQuantityTypeIdentifierStepCount', 1, 'count', 'steps');
  connectedMetrics.steps = steps.length ? 'synced' : 'no_recent_data';

  let sleepMinutes = 0;
  try {
    const sleep = await healthKit.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate: new Date(endDate.getTime() - DAY * 2), endDate } }, limit: 0, ascending: true
    });
    const asleepValues = new Set([1, 3, 4, 5]);
    sleep.filter((sample) => asleepValues.has(sample.value)).forEach((sample) => {
      const minutes = Math.max(0, (sample.endDate.getTime() - sample.startDate.getTime()) / 60_000);
      sleepMinutes += minutes;
      addObservation('sleep_minutes', minutes, 'min', sample, 'HKCategoryTypeIdentifierSleepAnalysis');
    });
  } catch { /* HealthKit intentionally does not disclose read denial. */ }
  connectedMetrics.sleep = sleepMinutes > 0 ? 'synced' : 'no_recent_data';

  const heartRates = await queryQuantity('HKQuantityTypeIdentifierRestingHeartRate', 7, 'count/min', 'resting_heart_rate');
  connectedMetrics.heart_rate = heartRates.length ? 'synced' : 'no_recent_data';

  const hrv = await queryQuantity('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 7, 'ms', 'hrv_ms');
  connectedMetrics.hrv = hrv.length ? 'synced' : 'no_recent_data';

  let workoutMinutes = 0;
  try {
    const workouts = await healthKit.queryWorkoutSamples({
      filter: { date: { startDate: new Date(endDate.getTime() - DAY * 7), endDate } }, limit: 0, ascending: true
    });
    workouts.forEach((sample) => {
      const minutes = sample.duration.quantity / 60;
      workoutMinutes += minutes;
      addObservation('workout_minutes', minutes, 'min', sample, 'HKWorkoutTypeIdentifier');
    });
  } catch { /* Preserve other metrics when one permission/data source is unavailable. */ }
  connectedMetrics.workouts = workoutMinutes > 0 ? 'synced' : 'no_recent_data';

  const calories = await queryQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', 7, 'kcal', 'active_energy');
  connectedMetrics.calories = calories.length ? 'synced' : 'no_recent_data';
  await queryQuantity('HKQuantityTypeIdentifierBodyMass', 7, 'kg', 'weight');
  await queryQuantity('HKQuantityTypeIdentifierDistanceWalkingRunning', 7, 'm', 'distance');

  const heartRateAvg = average(heartRates);
  const hrvAvg = average(hrv);
  const stepCount = total(steps);
  const caloriesKcal = total(calories);
  return {
    deviceId: 'apple-health-local-device', brand: 'Apple', model: 'Apple Health', provider: 'Apple Health',
    syncedAtISO: new Date().toISOString(), source: 'api',
    metrics: {
      heartRateAvg: heartRateAvg == null ? null : Math.round(heartRateAvg),
      sleepHours: sleepMinutes > 0 ? Number((sleepMinutes / 60).toFixed(1)) : null,
      hydrationLiters: null, focusMinutes: null, breathingMinutes: null,
      movementMinutes: workoutMinutes > 0 ? Math.round(workoutMinutes) : null,
      hrvMs: hrvAvg == null ? null : Number(hrvAvg.toFixed(1)),
      caloriesKcal: caloriesKcal > 0 ? Math.round(caloriesKcal) : null,
      workoutMinutes: workoutMinutes > 0 ? Math.round(workoutMinutes) : null,
      stressScore: null, cyclePhase: null, spo2Pct: null, respiratoryRateBrpm: null
    },
    dataQuality: {
      confidence: observations.length ? 0.96 : 0, isEstimated: false,
      warnings: observations.length ? [] : ['No recent Apple Health records were found for the permitted metrics.'],
      connectedMetrics,
      normalizedDomains: {
        Activity: stepCount > 0 || workoutMinutes > 0 ? Math.round(Math.max(stepCount / 100, workoutMinutes)) : null,
        Sleep: sleepMinutes > 0 ? Number((sleepMinutes / 60).toFixed(1)) : null,
        Recovery: hrvAvg == null ? null : Number(hrvAvg.toFixed(1)), Calm: null, Cycle: null, Nutrition: null
      }
    },
    observations
  };
};
