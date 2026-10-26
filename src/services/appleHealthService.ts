import { Platform } from 'react-native';
import { HealthObservationDraft, WearableSyncPayload } from '../types';
import { runHealthConnectOperation } from './healthConnectOperationCoordinator';

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');
type AppleMetricStatus = 'synced' | 'no_recent_data' | 'read_failed' | 'unsupported';
type ConnectedMetrics = NonNullable<WearableSyncPayload['dataQuality']['connectedMetrics']>;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const APPLE_HEALTH_OPERATION_TIMEOUT_MS = 30_000;

export type AppleHealthReadOptions = {
  includeCurrentHour?: boolean;
  liveDisplay?: boolean;
};

export const getLiveHealthWindows = (nowMs = Date.now()) => {
  const endDate = new Date(nowMs);
  const dayStart = new Date(nowMs);
  dayStart.setHours(0, 0, 0, 0);
  const sleepStart = new Date(nowMs);
  sleepStart.setHours(18, 0, 0, 0);
  // A sleep day starts at 6 PM on the previous calendar day. Always using the
  // previous day keeps last night's sleep visible after 6 PM the following day.
  sleepStart.setDate(sleepStart.getDate() - 1);
  return { dayStart, sleepStart, endDate };
};

const STEPS = 'HKQuantityTypeIdentifierStepCount';
const RESTING_HEART_RATE = 'HKQuantityTypeIdentifierRestingHeartRate';
const HRV_SDNN = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const DISTANCE = 'HKQuantityTypeIdentifierDistanceWalkingRunning';
const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';
const WORKOUT = 'HKWorkoutTypeIdentifier';

export const APPLE_HEALTH_READ_TYPES = [
  STEPS,
  SLEEP,
  RESTING_HEART_RATE,
  HRV_SDNN,
  WORKOUT,
  ACTIVE_ENERGY,
  BODY_MASS,
  DISTANCE
] as const;

// HKCategoryValueSleepAnalysis: 0 inBed, 1 asleepUnspecified, 2 awake, 3 core, 4 deep, 5 REM.
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);

type SourceInfo = { name?: string; bundleIdentifier?: string };
type DeviceInfo = { manufacturer?: string; model?: string; name?: string };
type SampleBase = {
  uuid: string;
  startDate: Date;
  endDate: Date;
  sourceRevision?: { source?: SourceInfo };
  device?: DeviceInfo;
};
type QuantityLike = { unit: string; quantity: number };

export const withAppleHealthTimeout = <T>(operation: Promise<T>, timeoutMs = APPLE_HEALTH_OPERATION_TIMEOUT_MS): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('apple_health_operation_timed_out')), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });

const loadHealthKit = (): HealthKitModule => {
  if (Platform.OS !== 'ios') throw new Error('apple_health_unsupported_platform');
  // Loaded lazily so Android and tests never touch the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@kingstinct/react-native-healthkit') as HealthKitModule;
};

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const avg = (values: number[]) => (values.length ? sum(values) / values.length : null);

/** Converts a HealthKit duration quantity into minutes, whatever unit HealthKit reports it in. */
export const durationToMinutes = (duration: QuantityLike | undefined): number => {
  if (!duration || !Number.isFinite(duration.quantity)) return 0;
  switch (duration.unit) {
    case 's': return duration.quantity / 60;
    case 'min': return duration.quantity;
    case 'hr':
    case 'h': return duration.quantity * 60;
    case 'ms': return duration.quantity / 60_000;
    default: return 0;
  }
};

const minutesBetween = (start: Date, end: Date) => Math.max(0, (end.getTime() - start.getTime()) / 60_000);

/**
 * Apple Watch and iPhone both write sleep samples for the same night. Summing every source double counts,
 * so only the source with the most asleep time in the window is used. The choice is deterministic, so
 * re-syncing the same data yields the same sample ids.
 */
export const selectPrimarySleepSamples = <T extends SampleBase & { value: number }>(samples: readonly T[]): T[] => {
  const asleep = samples.filter((sample) => ASLEEP_VALUES.has(sample.value));
  const totals = new Map<string, number>();
  asleep.forEach((sample) => {
    const key = sample.sourceRevision?.source?.bundleIdentifier ?? 'unknown_source';
    totals.set(key, (totals.get(key) ?? 0) + minutesBetween(sample.startDate, sample.endDate));
  });
  let best: string | null = null;
  totals.forEach((minutes, key) => {
    if (best == null || minutes > (totals.get(best) ?? 0)) best = key;
  });
  return asleep.filter((sample) => (sample.sourceRevision?.source?.bundleIdentifier ?? 'unknown_source') === best);
};

type ObservationInput = {
  metricType: string;
  value: number | null | undefined;
  unit: string;
  measuredAt: Date;
  recordType: string;
  sourceRecordId: string;
  start?: Date;
  end?: Date;
  source?: SourceInfo;
  device?: DeviceInfo;
};

export const buildAppleObservation = (input: ObservationInput, nowMs = Date.now()): HealthObservationDraft | null => {
  const { value, measuredAt, start, end } = input;
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const measuredMs = measuredAt.getTime();
  if (!Number.isFinite(measuredMs) || measuredMs > nowMs + 5 * 60_000) return null;
  if (start && end && end.getTime() < start.getTime()) return null;
  const rounded = Number(value.toFixed(input.metricType === 'sleep_minutes' ? 0 : 2));
  const origin = input.source?.bundleIdentifier || 'unknown_origin';
  return {
    metricType: input.metricType,
    value: rounded,
    unit: input.unit,
    measuredAtISO: measuredAt.toISOString(),
    sourceProvider: 'apple_health',
    sourceRecordId: input.sourceRecordId,
    syncKey: `apple_health:${input.recordType}:${origin}:${input.sourceRecordId}`,
    qualityStatus: 'accepted',
    sourceMetadata: {
      recordType: input.recordType,
      sourceApplication: input.source?.bundleIdentifier,
      startAtISO: start?.toISOString(),
      endAtISO: end?.toISOString(),
      originalValue: value,
      originalUnit: input.unit,
      device: input.device
        ? { manufacturer: input.device.manufacturer, model: input.device.model ?? input.device.name }
        : undefined
    }
  };
};

export type AppleHealthPermissionPreparation = {
  requestedCount: number;
  /** HealthKit hides read-permission outcomes from apps, so only "the prompt was processed" is knowable. */
  promptProcessed: boolean;
};

const ensureAvailable = async (healthKit: HealthKitModule) => {
  const available = await withAppleHealthTimeout(healthKit.isHealthDataAvailableAsync()).catch(() => {
    throw new Error('apple_health_status_failed');
  });
  if (!available) throw new Error('apple_health_unavailable');
};

const requestAppleHealthPermissionsInternal = async (): Promise<AppleHealthPermissionPreparation> => {
  const healthKit = loadHealthKit();
  await ensureAvailable(healthKit);
  const promptProcessed = await withAppleHealthTimeout(
    healthKit.requestAuthorization({ toRead: [...APPLE_HEALTH_READ_TYPES] })
  ).catch(() => {
    throw new Error('apple_health_permission_flow_failed');
  });
  return { requestedCount: APPLE_HEALTH_READ_TYPES.length, promptProcessed };
};

export const requestAppleHealthPermissions = () =>
  runHealthConnectOperation('REQUESTING_PERMISSION', requestAppleHealthPermissionsInternal);

const syncFromAppleHealthInternal = async (options: AppleHealthReadOptions = {}): Promise<WearableSyncPayload> => {
  const healthKit = loadHealthKit();
  await ensureAvailable(healthKit);

  const prepared = await requestAppleHealthPermissionsInternal();
  if (!prepared.promptProcessed) throw new Error('apple_health_permission_required');

  const connectedMetrics: ConnectedMetrics = {
    sleep: 'no_recent_data',
    steps: 'no_recent_data',
    heart_rate: 'no_recent_data',
    hrv: 'no_recent_data',
    calories: 'no_recent_data',
    workouts: 'no_recent_data',
    weight: 'no_recent_data',
    distance: 'no_recent_data',
    stress: 'unsupported',
    cycle: 'unsupported',
    spo2: 'unsupported',
    respiratory_rate: 'unsupported'
  };
  const failedMetrics: string[] = [];
  const observations: HealthObservationDraft[] = [];
  const nowMs = Date.now();
  const liveWindows = getLiveHealthWindows(nowMs);
  const addObservation = (input: ObservationInput) => {
    const observation = buildAppleObservation(input, nowMs);
    if (observation) observations.push(observation);
    return observation != null;
  };
  const markStatus = (metric: keyof ConnectedMetrics, status: AppleMetricStatus) => {
    if (connectedMetrics[metric] !== 'read_failed') connectedMetrics[metric] = status;
  };
  const guarded = async <T>(metric: keyof ConnectedMetrics, read: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await withAppleHealthTimeout(read());
    } catch (error) {
      console.warn('[AppleHealth] read_failed', metric, error instanceof Error ? error.message : 'unknown_error');
      connectedMetrics[metric] = 'read_failed';
      failedMetrics.push(metric);
      return fallback;
    }
  };

  const dateFilter = (windowMs: number) => ({ date: { startDate: new Date(nowMs - windowMs), endDate: new Date(nowMs) } });
  const dateFilterFrom = (startDate: Date) => ({ date: { startDate, endDate: new Date(nowMs) } });
  const currentHourStart = Math.floor(nowMs / HOUR) * HOUR;

  /**
   * Cumulative metrics (steps, energy, distance) are read as completed hourly statistics buckets.
   * HealthKit already de-duplicates overlapping iPhone/Watch samples inside statistics, and a completed
   * hour never changes, so the sourceRecordId stays stable across repeated syncs.
   */
  const readHourlySums = async (
    metric: keyof ConnectedMetrics,
    identifier: Parameters<HealthKitModule['queryStatisticsCollectionForQuantity']>[0],
    unit: string,
    windowMs: number,
    liveStartDate?: Date
  ) => {
    const filter = liveStartDate ? dateFilterFrom(liveStartDate) : dateFilter(windowMs);
    const anchorMs = liveStartDate?.getTime() ?? nowMs - windowMs;
    const anchor = new Date(Math.floor(anchorMs / HOUR) * HOUR);
    const buckets = await guarded(
      metric,
      () => healthKit.queryStatisticsCollectionForQuantity(
        identifier,
        ['cumulativeSum'],
        anchor,
        { hour: 1 },
        { filter, unit: unit as never }
      ),
      []
    );
    return buckets
      .filter((bucket) => bucket.startDate && bucket.endDate && (options.includeCurrentHour || bucket.endDate.getTime() <= currentHourStart))
      .map((bucket) => ({
        start: bucket.startDate as Date,
        end: bucket.endDate as Date,
        total: bucket.sumQuantity?.quantity ?? 0,
        sources: bucket.sources ?? []
      }))
      .filter((bucket) => bucket.total > 0);
  };

  // Steps — live display uses local midnight through now; backend sync keeps its existing 24h window.
  const stepBuckets = await readHourlySums('steps', STEPS, 'count', DAY, options.liveDisplay ? liveWindows.dayStart : undefined);
  const stepCount = sum(stepBuckets.map((bucket) => bucket.total));
  stepBuckets.forEach((bucket) => addObservation({
    metricType: 'steps',
    value: bucket.total,
    unit: 'count',
    measuredAt: options.includeCurrentHour ? new Date(Math.min(bucket.end.getTime(), nowMs)) : bucket.end,
    recordType: 'StepCount',
    sourceRecordId: `steps:${bucket.start.toISOString()}`,
    start: bucket.start,
    end: bucket.end,
    source: { bundleIdentifier: 'com.apple.health' }
  }));
  if (stepCount > 0) markStatus('steps', 'synced');

  // Sleep — live display uses the most recent local 6 PM through now.
  const sleepSamples = await guarded(
    'sleep',
    () => healthKit.queryCategorySamples(SLEEP, { limit: 0, ascending: true, filter: options.liveDisplay ? dateFilterFrom(liveWindows.sleepStart) : dateFilter(2 * DAY) }),
    []
  );
  const primarySleep = selectPrimarySleepSamples(sleepSamples.map((sample) => ({ ...sample, value: Number(sample.value) })));
  const sleepMinutes = sum(primarySleep.map((sample) => minutesBetween(sample.startDate, sample.endDate)));
  primarySleep.forEach((sample) => addObservation({
    metricType: 'sleep_minutes',
    value: minutesBetween(sample.startDate, sample.endDate),
    unit: 'min',
    measuredAt: sample.endDate,
    recordType: 'SleepAnalysis',
    sourceRecordId: sample.uuid,
    start: sample.startDate,
    end: sample.endDate,
    source: sample.sourceRevision?.source,
    device: sample.device
  }));
  if (sleepMinutes > 0) markStatus('sleep', 'synced');

  // Resting heart rate — live display uses local midnight through now.
  const restingSamples = await guarded(
    'heart_rate',
    () => healthKit.queryQuantitySamples(RESTING_HEART_RATE, { limit: 0, ascending: true, unit: 'count/min', filter: options.liveDisplay ? dateFilterFrom(liveWindows.dayStart) : dateFilter(7 * DAY) }),
    []
  );
  const hrValues = restingSamples.map((sample) => sample.quantity).filter((value) => value > 0);
  restingSamples.forEach((sample) => addObservation({
    metricType: 'resting_heart_rate',
    value: sample.quantity,
    unit: 'bpm',
    measuredAt: sample.endDate,
    recordType: 'RestingHeartRate',
    sourceRecordId: sample.uuid,
    start: sample.startDate,
    end: sample.endDate,
    source: sample.sourceRevision?.source,
    device: sample.device
  }));
  const heartRateAvg = avg(hrValues);
  if (heartRateAvg != null) markStatus('heart_rate', 'synced');

  // HRV — live display uses local midnight through now. Apple reports SDNN.
  const hrvSamples = await guarded(
    'hrv',
    () => healthKit.queryQuantitySamples(HRV_SDNN, { limit: 0, ascending: true, unit: 'ms', filter: options.liveDisplay ? dateFilterFrom(liveWindows.dayStart) : dateFilter(7 * DAY) }),
    []
  );
  const hrvValues = hrvSamples.map((sample) => sample.quantity).filter((value) => value > 0);
  hrvSamples.forEach((sample) => addObservation({
    metricType: 'hrv_ms',
    value: sample.quantity,
    unit: 'ms',
    measuredAt: sample.endDate,
    recordType: 'HeartRateVariabilitySDNN',
    sourceRecordId: sample.uuid,
    start: sample.startDate,
    end: sample.endDate,
    source: sample.sourceRevision?.source,
    device: sample.device
  }));
  const hrvAvg = avg(hrvValues);
  if (hrvAvg != null) markStatus('hrv', 'synced');

  // Workouts — last 7d
  const workouts = await guarded(
    'workouts',
    () => healthKit.queryWorkoutSamples({ limit: 0, ascending: true, filter: dateFilter(7 * DAY) }),
    []
  );
  const workoutMinutes = sum(workouts.map((workout) => durationToMinutes(workout.duration)));
  workouts.forEach((workout) => addObservation({
    metricType: 'workout_minutes',
    value: durationToMinutes(workout.duration),
    unit: 'min',
    measuredAt: workout.endDate,
    recordType: 'Workout',
    sourceRecordId: workout.uuid,
    start: workout.startDate,
    end: workout.endDate,
    source: workout.sourceRevision?.source,
    device: workout.device
  }));
  if (workoutMinutes > 0) markStatus('workouts', 'synced');

  // Active energy — live display uses local midnight through now.
  const energyBuckets = await readHourlySums('calories', ACTIVE_ENERGY, 'kcal', 7 * DAY, options.liveDisplay ? liveWindows.dayStart : undefined);
  const caloriesKcal = energyBuckets.length ? sum(energyBuckets.map((bucket) => bucket.total)) : null;
  energyBuckets.forEach((bucket) => addObservation({
    metricType: 'active_energy',
    value: bucket.total,
    unit: 'kcal',
    measuredAt: options.includeCurrentHour ? new Date(Math.min(bucket.end.getTime(), nowMs)) : bucket.end,
    recordType: 'ActiveEnergyBurned',
    sourceRecordId: `active_energy:${bucket.start.toISOString()}`,
    start: bucket.start,
    end: bucket.end,
    source: { bundleIdentifier: 'com.apple.health' }
  }));
  if (caloriesKcal != null) markStatus('calories', 'synced');

  // Weight — last 7d
  const weightSamples = await guarded(
    'weight',
    () => healthKit.queryQuantitySamples(BODY_MASS, { limit: 0, ascending: true, unit: 'kg', filter: dateFilter(7 * DAY) }),
    []
  );
  weightSamples.forEach((sample) => addObservation({
    metricType: 'weight',
    value: sample.quantity,
    unit: 'kg',
    measuredAt: sample.endDate,
    recordType: 'BodyMass',
    sourceRecordId: sample.uuid,
    start: sample.startDate,
    end: sample.endDate,
    source: sample.sourceRevision?.source,
    device: sample.device
  }));
  if (weightSamples.length) markStatus('weight', 'synced');

  // Walking/running distance — live display uses local midnight through now.
  const distanceBuckets = await readHourlySums('distance', DISTANCE, 'm', 7 * DAY, options.liveDisplay ? liveWindows.dayStart : undefined);
  distanceBuckets.forEach((bucket) => addObservation({
    metricType: 'distance',
    value: bucket.total,
    unit: 'm',
    measuredAt: options.includeCurrentHour ? new Date(Math.min(bucket.end.getTime(), nowMs)) : bucket.end,
    recordType: 'DistanceWalkingRunning',
    sourceRecordId: `distance:${bucket.start.toISOString()}`,
    start: bucket.start,
    end: bucket.end,
    source: { bundleIdentifier: 'com.apple.health' }
  }));
  if (distanceBuckets.length) markStatus('distance', 'synced');

  const realSyncedCount = observations.length;
  const roundedSleepHours = sleepMinutes > 0 ? Number((sleepMinutes / 60).toFixed(1)) : null;

  return {
    deviceId: 'ah-local-device',
    brand: 'Apple',
    model: 'Apple Health',
    provider: 'Apple Health',
    syncedAtISO: new Date(nowMs).toISOString(),
    source: 'api',
    metrics: {
      heartRateAvg: heartRateAvg == null ? null : Math.round(heartRateAvg),
      sleepHours: roundedSleepHours,
      hydrationLiters: null,
      focusMinutes: null,
      breathingMinutes: null,
      movementMinutes: workoutMinutes > 0 ? Math.round(workoutMinutes) : null,
      hrvMs: hrvAvg == null ? null : Number(hrvAvg.toFixed(1)),
      caloriesKcal: caloriesKcal == null ? null : Math.round(caloriesKcal),
      workoutMinutes: workoutMinutes > 0 ? Math.round(workoutMinutes) : null,
      stressScore: null,
      cyclePhase: null,
      spo2Pct: null,
      respiratoryRateBrpm: null
    },
    dataQuality: {
      confidence: realSyncedCount > 0 ? 0.96 : 0,
      isEstimated: false,
      warnings: [
        ...(realSyncedCount > 0 ? [] : ['No recent Apple Health records were found. If you declined access, enable it in Settings > Health > Data Access.']),
        ...(failedMetrics.length ? [`Some Apple Health metrics could not be read: ${failedMetrics.join(', ')}.`] : [])
      ],
      connectedMetrics,
      normalizedDomains: {
        Activity: stepCount > 0 || workoutMinutes > 0 ? Math.round(Math.max(stepCount / 100, workoutMinutes)) : null,
        Sleep: roundedSleepHours,
        Recovery: hrvAvg == null ? null : Number(hrvAvg.toFixed(1)),
        Calm: null,
        Cycle: null,
        Nutrition: null
      }
    },
    observations
  };
};

export const syncFromAppleHealth = (options: AppleHealthReadOptions = {}) =>
  runHealthConnectOperation(
    'SYNCING',
    () => syncFromAppleHealthInternal(options),
    (payload) => Object.values(payload.dataQuality.connectedMetrics ?? {}).includes('read_failed') ? 'PARTIAL_SUCCESS' : 'SUCCESS'
  );
