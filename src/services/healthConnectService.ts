import { Platform } from 'react-native';
import {
  SdkAvailabilityStatus,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  type Permission
} from 'react-native-health-connect';
import { HealthObservationDraft, WearableSyncPayload } from '../types';

type HealthConnectMetricStatus = 'synced' | 'no_permission' | 'no_recent_data' | 'unsupported' | 'unavailable';

const DAY = 24 * 60 * 60 * 1000;
export const HEALTH_CONNECT_OPERATION_TIMEOUT_MS = 30_000;
const now = () => Date.now();

export const withHealthConnectTimeout = <T>(operation: Promise<T>, timeoutMs = HEALTH_CONNECT_OPERATION_TIMEOUT_MS): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('health_connect_operation_timed_out')), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });

const toIso = (ms: number) => new Date(ms).toISOString();

const permissionList: Permission[] = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'Distance' }
];

const metricPermissionMap = {
  sleep: 'SleepSession',
  heart_rate: 'RestingHeartRate',
  hrv: 'HeartRateVariabilityRmssd',
  workouts: 'ExerciseSession',
  calories: 'ActiveCaloriesBurned',
  stress: null,
  cycle: null,
  spo2: null,
  respiratory_rate: null
} as const;

const toPermissionKey = (permission: Permission) => `${permission.accessType}:${permission.recordType}`;

const hasPermission = (granted: Set<string>, recordType: string | null) => {
  if (!recordType) return false;
  return granted.has(`read:${recordType}`);
};

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const avg = (values: number[]) => (values.length ? sum(values) / values.length : null);

const within = (timestamp: string, maxAgeMs: number) => {
  const t = +new Date(timestamp);
  return Number.isFinite(t) && now() - t <= maxAgeMs;
};

const safeReadRecords = async <TRecord>(
  recordType: Parameters<typeof readRecords>[0],
  options: Parameters<typeof readRecords>[1]
): Promise<Array<TRecord>> => {
  try {
    const response = await withHealthConnectTimeout(readRecords(recordType, options));
    return (response?.records ?? []) as Array<TRecord>;
  } catch (error) {
    console.warn('[HealthConnect] readRecords_failed', recordType, error instanceof Error ? error.message : 'unknown_error');
    throw new Error(`health_connect_read_failed_${recordType}`);
  }
};

export type HealthConnectRuntimeDiagnostics = {
  platform: string;
  sdkStatus: string;
  initialized: boolean;
  permissionStates: Record<string, boolean>;
  grantedPermissions: string[];
  lastCheckedISO: string;
  metricDebug: {
    steps: { recordCount: number; lastRecordISO: string | null; stale: boolean };
    sleep: { recordCount: number; lastRecordISO: string | null; stale: boolean };
    restingHeartRate: { recordCount: number; lastRecordISO: string | null; stale: boolean };
    hrv: { recordCount: number; lastRecordISO: string | null; stale: boolean };
    workouts: { recordCount: number; lastRecordISO: string | null; stale: boolean };
  };
};

export type HealthConnectPermissionPreparation = {
  grantedCount: number;
  requestedCount: number;
  permissionStates: HealthConnectRuntimeDiagnostics['permissionStates'];
};

const summarizePermissions = (granted: Array<Permission>): HealthConnectPermissionPreparation => {
  const grantedSet = new Set(granted.map((permission) => toPermissionKey(permission)));
  const permissionStates = {
    Steps: hasPermission(grantedSet, 'Steps'),
    SleepSession: hasPermission(grantedSet, 'SleepSession'),
    RestingHeartRate: hasPermission(grantedSet, 'RestingHeartRate'),
    HeartRateVariabilityRmssd: hasPermission(grantedSet, 'HeartRateVariabilityRmssd'),
    ExerciseSession: hasPermission(grantedSet, 'ExerciseSession'),
    ActiveCaloriesBurned: hasPermission(grantedSet, 'ActiveCaloriesBurned'),
    Weight: hasPermission(grantedSet, 'Weight'),
    Distance: hasPermission(grantedSet, 'Distance')
  };

  return {
    grantedCount: Object.values(permissionStates).filter(Boolean).length,
    requestedCount: permissionList.length,
    permissionStates
  };
};

/**
 * Re-checks connection permission without opening a prompt, reading records or
 * starting a sync. This is safe to call when the app returns from Android's
 * canonical Health Connect settings screen.
 */
export const inspectHealthConnectPermissions = async (): Promise<HealthConnectPermissionPreparation> => {
  if (Platform.OS !== 'android') {
    throw new Error('health_connect_unsupported_platform');
  }

  const sdkStatus = await withHealthConnectTimeout(getSdkStatus()).catch(() => {
    throw new Error('health_connect_status_failed');
  });
  if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    throw new Error(`health_connect_unavailable_${sdkStatus}`);
  }

  const initialized = await withHealthConnectTimeout(initialize()).catch(() => {
    throw new Error('health_connect_initialize_failed');
  });
  if (!initialized) {
    throw new Error('health_connect_initialize_failed');
  }

  const granted = (await withHealthConnectTimeout(getGrantedPermissions())) as Array<Permission>;
  return summarizePermissions(granted);
};

export const requestHealthConnectPermissionsOnly = async (): Promise<HealthConnectPermissionPreparation> => {
  if (Platform.OS !== 'android') {
    throw new Error('health_connect_unsupported_platform');
  }

  let sdkStatus: number;
  try {
    sdkStatus = await withHealthConnectTimeout(getSdkStatus());
  } catch {
    throw new Error('health_connect_status_failed');
  }
  if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    throw new Error(`health_connect_unavailable_${sdkStatus}`);
  }

  let initialized = false;
  try {
    initialized = await withHealthConnectTimeout(initialize());
  } catch {
    throw new Error('health_connect_initialize_failed');
  }
  if (!initialized) {
    throw new Error('health_connect_initialize_failed');
  }

  try {
    await withHealthConnectTimeout(requestPermission(permissionList));
  } catch {
    throw new Error('health_connect_permission_flow_failed');
  }

  const granted = (await withHealthConnectTimeout(getGrantedPermissions())) as Array<Permission>;
  return summarizePermissions(granted);
};

export const getHealthConnectRuntimeDiagnostics = async (): Promise<HealthConnectRuntimeDiagnostics> => {
  const base: HealthConnectRuntimeDiagnostics = {
    platform: Platform.OS,
    sdkStatus: 'unknown',
    initialized: false,
    permissionStates: {},
    grantedPermissions: [],
    lastCheckedISO: new Date().toISOString(),
    metricDebug: {
      steps: { recordCount: 0, lastRecordISO: null, stale: true },
      sleep: { recordCount: 0, lastRecordISO: null, stale: true },
      restingHeartRate: { recordCount: 0, lastRecordISO: null, stale: true },
      hrv: { recordCount: 0, lastRecordISO: null, stale: true },
      workouts: { recordCount: 0, lastRecordISO: null, stale: true }
    }
  };

  if (Platform.OS !== 'android') {
    return { ...base, sdkStatus: 'not_android' };
  }

  let sdkStatus: number;
  try {
    sdkStatus = await withHealthConnectTimeout(getSdkStatus());
  } catch {
    return { ...base, sdkStatus: 'status_check_failed' };
  }
  if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    return { ...base, sdkStatus: String(sdkStatus) };
  }

  let initialized = false;
  let granted: Array<Permission> = [];
  try {
    initialized = await withHealthConnectTimeout(initialize());
    granted = (await withHealthConnectTimeout(getGrantedPermissions())) as Array<Permission>;
  } catch {
    return { ...base, sdkStatus: String(sdkStatus), initialized: false, permissionStates: {}, grantedPermissions: [] };
  }
  const grantedSet = new Set(granted.map((permission) => toPermissionKey(permission as Permission)));
  const toGranted = (recordType: string) => grantedSet.has(`read:${recordType}`);

  const permissionStates = {
    Steps: toGranted('Steps'),
    SleepSession: toGranted('SleepSession'),
    RestingHeartRate: toGranted('RestingHeartRate'),
    HeartRateVariabilityRmssd: toGranted('HeartRateVariabilityRmssd'),
    ExerciseSession: toGranted('ExerciseSession'),
    ActiveCaloriesBurned: toGranted('ActiveCaloriesBurned'),
    Weight: toGranted('Weight'),
    Distance: toGranted('Distance')
  };

  const end = toIso(now());
  const diagnostics: HealthConnectRuntimeDiagnostics = {
    ...base,
    sdkStatus: String(sdkStatus),
    initialized,
    permissionStates,
    grantedPermissions: Array.from(grantedSet),
    lastCheckedISO: new Date().toISOString()
  };

  if (permissionStates.Steps) {
    const records = await safeReadRecords<{ endTime: string } & { count?: number }>('Steps', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY), endTime: end }
    });
    const freshRecords = records.filter((record) => within(record.endTime, DAY));
    const last = freshRecords.at(-1)?.endTime ?? null;
    diagnostics.metricDebug.steps = {
      recordCount: freshRecords.length,
      lastRecordISO: last,
      stale: !last || !within(last, DAY)
    };
  }

  if (permissionStates.SleepSession) {
    const records = await safeReadRecords<{ endTime: string }>('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 2), endTime: end }
    });
    const freshRecords = records.filter((record) => within(record.endTime, DAY * 2));
    const last = freshRecords.at(-1)?.endTime ?? null;
    diagnostics.metricDebug.sleep = {
      recordCount: freshRecords.length,
      lastRecordISO: last,
      stale: !last || !within(last, DAY * 2)
    };
  }

  if (permissionStates.RestingHeartRate) {
    const records = await safeReadRecords<{ time: string }>('RestingHeartRate', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
    });
    const freshRecords = records.filter((record) => within(record.time, DAY * 7));
    const last = freshRecords.at(-1)?.time ?? null;
    diagnostics.metricDebug.restingHeartRate = {
      recordCount: freshRecords.length,
      lastRecordISO: last,
      stale: !last || !within(last, DAY * 7)
    };
  }

  if (permissionStates.HeartRateVariabilityRmssd) {
    const records = await safeReadRecords<{ time: string }>('HeartRateVariabilityRmssd', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
    });
    const freshRecords = records.filter((record) => within(record.time, DAY * 7));
    const last = freshRecords.at(-1)?.time ?? null;
    diagnostics.metricDebug.hrv = {
      recordCount: freshRecords.length,
      lastRecordISO: last,
      stale: !last || !within(last, DAY * 7)
    };
  }

  if (permissionStates.ExerciseSession) {
    const records = await safeReadRecords<{ endTime: string }>('ExerciseSession', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
    });
    const freshRecords = records.filter((record) => within(record.endTime, DAY * 7));
    const last = freshRecords.at(-1)?.endTime ?? null;
    diagnostics.metricDebug.workouts = {
      recordCount: freshRecords.length,
      lastRecordISO: last,
      stale: !last || !within(last, DAY * 7)
    };
  }

  return diagnostics;
};

export const syncFromHealthConnect = async (): Promise<WearableSyncPayload> => {
  if (Platform.OS !== 'android') {
    console.warn('[HealthConnect] Unsupported platform:', Platform.OS);
    throw new Error('health_connect_unsupported_platform');
  }

  let sdkStatus: number;
  try {
    sdkStatus = await withHealthConnectTimeout(getSdkStatus());
  } catch {
    throw new Error('health_connect_status_failed');
  }
  console.info('[HealthConnect] SDK status:', sdkStatus);
  if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    throw new Error(`health_connect_unavailable_${sdkStatus}`);
  }

  let initialized = false;
  try {
    initialized = await withHealthConnectTimeout(initialize());
  } catch {
    throw new Error('health_connect_initialize_failed');
  }
  console.info('[HealthConnect] initialize:', initialized);
  if (!initialized) {
    throw new Error('health_connect_initialize_failed');
  }

  let granted: Array<Permission> = [];
  try {
    granted = (await withHealthConnectTimeout(getGrantedPermissions())) as Array<Permission>;
  } catch {
    throw new Error('health_connect_permission_flow_failed');
  }
  const grantedSet = new Set(granted.map((permission) => toPermissionKey(permission as Permission)));
  if (grantedSet.size === 0) {
    throw new Error('health_connect_permission_required');
  }

  const connectedMetrics: NonNullable<WearableSyncPayload['dataQuality']['connectedMetrics']> = {
    sleep: hasPermission(grantedSet, metricPermissionMap.sleep) ? 'no_recent_data' : 'no_permission',
    steps: hasPermission(grantedSet, 'Steps') ? 'no_recent_data' : 'no_permission',
    heart_rate: hasPermission(grantedSet, metricPermissionMap.heart_rate) ? 'no_recent_data' : 'no_permission',
    hrv: hasPermission(grantedSet, metricPermissionMap.hrv) ? 'no_recent_data' : 'no_permission',
    calories: hasPermission(grantedSet, metricPermissionMap.calories) ? 'no_recent_data' : 'no_permission',
    workouts: hasPermission(grantedSet, metricPermissionMap.workouts) ? 'no_recent_data' : 'no_permission',
    stress: 'unsupported',
    cycle: 'unsupported',
    spo2: 'unsupported',
    respiratory_rate: 'unsupported'
  };

  const end = toIso(now());
  const observations: HealthObservationDraft[] = [];
  const addObservation = (
    metricType: string,
    value: number | null,
    unit: string,
    measuredAtISO: string,
    recordType: string,
    record?: {
      startTime?: string;
      endTime?: string;
      metadata?: {
        id?: string;
        dataOrigin?: string;
        clientRecordId?: string;
        device?: { manufacturer?: string; model?: string; type?: number };
        recordingMethod?: number;
      };
    }
  ) => {
    if (value == null || !Number.isFinite(value) || value <= 0) return;
    if (!Number.isFinite(Date.parse(measuredAtISO)) || Date.parse(measuredAtISO) > now() + 5 * 60_000) return;
    if (record?.startTime && record?.endTime && Date.parse(record.endTime) < Date.parse(record.startTime)) return;
    const rounded = Number(value.toFixed(metricType === 'sleep_minutes' ? 0 : 2));
    const sourceRecordId = record?.metadata?.id?.trim() || record?.metadata?.clientRecordId?.trim() ||
      [recordType, record?.metadata?.dataOrigin || 'unknown_origin', measuredAtISO, rounded, unit].join(':');
    observations.push({
      metricType,
      value: rounded,
      unit,
      measuredAtISO,
      sourceProvider: 'health_connect',
      sourceRecordId,
      syncKey: `health_connect:${recordType}:${record?.metadata?.dataOrigin || 'unknown_origin'}:${sourceRecordId}`,
      qualityStatus: 'accepted',
      sourceMetadata: {
        recordType,
        sourceApplication: record?.metadata?.dataOrigin,
        startAtISO: record?.startTime,
        endAtISO: record?.endTime,
        originalValue: value,
        originalUnit: unit,
        device: record?.metadata?.device,
        recordingMethod: record?.metadata?.recordingMethod
      }
    });
  };

  let stepCount = 0;
  if (connectedMetrics.sleep !== 'no_permission') {
    console.info('[HealthConnect] Sleep permission granted');
  } else {
    console.warn('[HealthConnect] Sleep permission denied');
  }

  if (connectedMetrics.heart_rate !== 'no_permission') {
    console.info('[HealthConnect] Resting HR permission granted');
  } else {
    console.warn('[HealthConnect] Resting HR permission denied');
  }

  if (connectedMetrics.hrv !== 'no_permission') {
    console.info('[HealthConnect] HRV permission granted');
  } else {
    console.warn('[HealthConnect] HRV permission denied');
  }

  if (connectedMetrics.workouts !== 'no_permission') {
    console.info('[HealthConnect] Workout permission granted');
  } else {
    console.warn('[HealthConnect] Workout permission denied');
  }

  if (hasPermission(grantedSet, 'Steps')) {
    const stepRecords = await safeReadRecords<{ startTime: string; endTime: string; count?: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('Steps', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY), endTime: end }
    });
    const valid = stepRecords.filter((record) => within(record.endTime, DAY));
    stepCount = sum(valid.map((record) => record.count ?? 0));
    if (stepCount > 0) {
      connectedMetrics.steps = 'synced';
      valid.forEach((record) => addObservation('steps', record.count ?? null, 'count', record.endTime, 'Steps', record));
      console.info('[HealthConnect] Steps read success:', stepCount);
    } else {
      connectedMetrics.steps = 'no_recent_data';
      console.warn('[HealthConnect] Steps no recent data');
    }
  }

  const sleepRecords = hasPermission(grantedSet, 'SleepSession')
    ? await safeReadRecords<{ startTime: string; endTime: string; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('SleepSession', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 2), endTime: end }
      })
    : ([] as Array<{ startTime: string; endTime: string; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>);

  const sleepMinutes = sum(
    sleepRecords
      .filter((record) => within(record.endTime, DAY * 2))
      .map((record) => Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000))
  );
  if (hasPermission(grantedSet, 'SleepSession')) {
    connectedMetrics.sleep = sleepMinutes > 0 ? 'synced' : 'no_recent_data';
    sleepRecords.filter((record) => within(record.endTime, DAY * 2)).forEach((record) => {
      const minutes = Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000);
      addObservation('sleep_minutes', minutes, 'min', record.endTime, 'SleepSession', record);
    });
    console.info('[HealthConnect] Sleep read', connectedMetrics.sleep, sleepMinutes);
  }

  const hrRecords = hasPermission(grantedSet, 'RestingHeartRate')
    ? await safeReadRecords<{ time: string; beatsPerMinute: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('RestingHeartRate', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
      })
    : ([] as Array<{ time: string; beatsPerMinute: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>);
  const hrValues = hrRecords.filter((record) => within(record.time, DAY * 7)).map((record) => record.beatsPerMinute ?? 0).filter((v) => v > 0);
  const heartRateAvg = avg(hrValues);
  if (hasPermission(grantedSet, 'RestingHeartRate')) {
    connectedMetrics.heart_rate = heartRateAvg ? 'synced' : 'no_recent_data';
    hrRecords.filter((record) => within(record.time, DAY * 7)).forEach((record) =>
      addObservation('resting_heart_rate', record.beatsPerMinute, 'bpm', record.time, 'RestingHeartRate', record)
    );
    console.info('[HealthConnect] RestingHeartRate read', connectedMetrics.heart_rate, heartRateAvg ?? null);
  }

  const hrvRecords = hasPermission(grantedSet, 'HeartRateVariabilityRmssd')
    ? await safeReadRecords<{ time: string; heartRateVariabilityMillis: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('HeartRateVariabilityRmssd', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
      })
    : ([] as Array<{ time: string; heartRateVariabilityMillis: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>);
  const hrvValues = hrvRecords.filter((record) => within(record.time, DAY * 7)).map((record) => record.heartRateVariabilityMillis ?? 0).filter((v) => v > 0);
  const hrvAvg = avg(hrvValues);
  if (hasPermission(grantedSet, 'HeartRateVariabilityRmssd')) {
    connectedMetrics.hrv = hrvAvg ? 'synced' : 'no_recent_data';
    hrvRecords.filter((record) => within(record.time, DAY * 7)).forEach((record) =>
      addObservation('hrv_ms', record.heartRateVariabilityMillis, 'ms', record.time, 'HeartRateVariabilityRmssd', record)
    );
    console.info('[HealthConnect] HRV read', connectedMetrics.hrv, hrvAvg ?? null);
  }

  const workoutRecords = hasPermission(grantedSet, 'ExerciseSession')
    ? await safeReadRecords<{ startTime: string; endTime: string; title?: string; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('ExerciseSession', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
      })
    : ([] as Array<{ startTime: string; endTime: string; title?: string; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>);

  const workoutMinutes = sum(
    workoutRecords
      .filter((record) => within(record.endTime, DAY * 7))
      .map((record) => Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000))
  );

  if (hasPermission(grantedSet, 'ExerciseSession')) {
    connectedMetrics.workouts = workoutMinutes > 0 ? 'synced' : 'no_recent_data';
    workoutRecords.filter((record) => within(record.endTime, DAY * 7)).forEach((record) => {
      const minutes = Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000);
      addObservation('workout_minutes', minutes, 'min', record.endTime, 'ExerciseSession', record);
    });
    console.info('[HealthConnect] ExerciseSession read', connectedMetrics.workouts, workoutMinutes);
  }

  let caloriesKcal: number | null = null;
  if (hasPermission(grantedSet, 'ActiveCaloriesBurned')) {
    const records = await safeReadRecords<{ startTime: string; endTime: string; energy: { inKilocalories: number }; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('ActiveCaloriesBurned', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
    });
    const valid = records.filter((record) => within(record.endTime, DAY * 7));
    const values = valid.map((record) => record.energy.inKilocalories).filter((value) => value > 0);
    caloriesKcal = values.length ? sum(values) : null;
    valid.forEach((record) => addObservation('active_energy', record.energy.inKilocalories, 'kcal', record.endTime, 'ActiveCaloriesBurned', record));
    connectedMetrics.calories = caloriesKcal == null ? 'no_recent_data' : 'synced';
  }

  if (hasPermission(grantedSet, 'Weight')) {
    const records = await safeReadRecords<{ time: string; weight: { inKilograms: number }; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('Weight', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
    });
    records.filter((record) => within(record.time, DAY * 7)).forEach((record) =>
      addObservation('weight', record.weight.inKilograms, 'kg', record.time, 'Weight', record)
    );
  }

  if (hasPermission(grantedSet, 'Distance')) {
    const records = await safeReadRecords<{ startTime: string; endTime: string; distance: { inMeters: number }; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('Distance', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
    });
    records.filter((record) => within(record.endTime, DAY * 7)).forEach((record) =>
      addObservation('distance', record.distance.inMeters, 'm', record.endTime, 'Distance', record)
    );
  }

  const realSyncedCount = observations.length;
  if (realSyncedCount === 0) {
    console.warn('[HealthConnect] No real metric synced.');
  }

  const payload: WearableSyncPayload = {
    deviceId: 'hc-local-device',
    brand: 'Other',
    model: 'Health Connect',
    provider: 'Health Connect',
    syncedAtISO: new Date().toISOString(),
    source: 'api',
    metrics: {
      heartRateAvg: heartRateAvg == null ? null : Math.round(heartRateAvg),
      sleepHours: sleepMinutes > 0 ? Number((sleepMinutes / 60).toFixed(1)) : null,
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
      warnings: realSyncedCount > 0 ? [] : ['No recent Health Connect records were found for the selected metrics.'],
      connectedMetrics,
      normalizedDomains: {
        Activity: stepCount > 0 || workoutMinutes > 0 ? Math.round(Math.max(stepCount / 100, workoutMinutes)) : null,
        Sleep: sleepMinutes > 0 ? Number((sleepMinutes / 60).toFixed(1)) : null,
        Recovery: hrvAvg == null ? null : Number(hrvAvg.toFixed(1)),
        Calm: null,
        Cycle: null,
        Nutrition: null
      }
    },
    observations
  };

  return payload;
};
