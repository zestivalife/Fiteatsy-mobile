import { Platform } from 'react-native';
import {
  SdkAvailabilityStatus,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  getChanges,
  readRecords,
  requestPermission,
  type Permission
} from 'react-native-health-connect';
import { HealthObservationDraft, WearableSyncPayload } from '../types';
import { runHealthConnectOperation } from './healthConnectOperationCoordinator';

type HealthConnectMetricStatus = 'synced' | 'no_permission' | 'no_recent_data' | 'read_failed' | 'unsupported' | 'unavailable';

const DAY = 24 * 60 * 60 * 1000;
const INITIAL_BACKFILL_DAYS = 90;
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
    const records: TRecord[] = [];
    let pageToken: string | undefined;
    do {
      const response = await withHealthConnectTimeout(readRecords(recordType, { ...options, pageSize: 500, pageToken }));
      records.push(...((response?.records ?? []) as Array<TRecord>));
      pageToken = response?.pageToken || undefined;
    } while (pageToken);
    return records;
  } catch (error) {
    console.warn('[HealthConnect] readRecords_failed', recordType, error instanceof Error ? error.message : 'unknown_error');
    throw new Error(`health_connect_read_failed_${recordType}`);
  }
};

export const readHealthConnectChanges = async (recordTypes: string[], changesToken?: string) => {
  if (typeof getChanges !== 'function') throw new Error('health_connect_change_tracking_unavailable');
  const result = await withHealthConnectTimeout(getChanges({ recordTypes: recordTypes as Parameters<typeof getChanges>[0]['recordTypes'], changesToken }));
  return result;
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
const inspectHealthConnectPermissionsInternal = async (): Promise<HealthConnectPermissionPreparation> => {
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

export const inspectHealthConnectPermissions = () =>
  runHealthConnectOperation('RECONCILING_PERMISSION', inspectHealthConnectPermissionsInternal);

const requestHealthConnectPermissionsOnlyInternal = async (): Promise<HealthConnectPermissionPreparation> => {
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

export const requestHealthConnectPermissionsOnly = () =>
  runHealthConnectOperation('REQUESTING_PERMISSION', requestHealthConnectPermissionsOnlyInternal);

const getHealthConnectRuntimeDiagnosticsInternal = async (): Promise<HealthConnectRuntimeDiagnostics> => {
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
  const backfillWindow = DAY * INITIAL_BACKFILL_DAYS;
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
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - backfillWindow), endTime: end }
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

export const getHealthConnectRuntimeDiagnostics = () =>
  runHealthConnectOperation('CHECKING', getHealthConnectRuntimeDiagnosticsInternal);

const HEALTH_CONNECT_RECORD_TYPES = permissionList.map((permission) => permission.recordType);

const incrementalObservation = (record: Record<string, any>): HealthObservationDraft | null => {
  const recordType = String(record.recordType ?? '');
  const measuredAtISO = String(record.endTime ?? record.time ?? new Date().toISOString());
  const intervalMinutes = record.startTime && record.endTime
    ? Math.max(0, (Date.parse(record.endTime) - Date.parse(record.startTime)) / 60_000)
    : null;
  const values: Record<string, { metricType: string; value: number | null; unit: string }> = {
    Steps: { metricType: 'steps', value: record.count, unit: 'count' },
    SleepSession: { metricType: 'sleep_minutes', value: intervalMinutes, unit: 'min' },
    RestingHeartRate: { metricType: 'resting_heart_rate', value: record.beatsPerMinute, unit: 'bpm' },
    HeartRateVariabilityRmssd: { metricType: 'hrv_ms', value: record.heartRateVariabilityMillis, unit: 'ms' },
    ExerciseSession: { metricType: 'workout_minutes', value: intervalMinutes, unit: 'min' },
    ActiveCaloriesBurned: { metricType: 'active_energy', value: record.energy?.inKilocalories, unit: 'kcal' },
    Weight: { metricType: 'weight', value: record.weight?.inKilograms, unit: 'kg' },
    Distance: { metricType: 'distance', value: record.distance?.inMeters, unit: 'm' }
  };
  const mapped = values[recordType];
  const value = Number(mapped?.value);
  const sourceRecordId = String(record.metadata?.id ?? record.metadata?.clientRecordId ?? '').trim();
  if (!mapped || !sourceRecordId || !Number.isFinite(value) || value <= 0 || !Number.isFinite(Date.parse(measuredAtISO))) return null;
  return {
    metricType: mapped.metricType, value: Number(value.toFixed(mapped.metricType === 'sleep_minutes' ? 0 : 2)),
    unit: mapped.unit, measuredAtISO, startAtISO: record.startTime ?? null, endAtISO: record.endTime ?? record.time ?? null,
    timezoneOffsetMinutes: -new Date(measuredAtISO).getTimezoneOffset(),
    providerUpdatedAtISO: record.metadata?.lastModifiedTime ?? null,
    providerVersion: record.metadata?.clientRecordVersion == null ? null : String(record.metadata.clientRecordVersion),
    sourceProvider: 'health_connect', sourceRecordId, syncKey: `health_connect:${recordType}:${sourceRecordId}`,
    qualityStatus: 'accepted', sourceMetadata: { recordType, sourceApplication: record.metadata?.dataOrigin,
      device: record.metadata?.device, recordingMethod: record.metadata?.recordingMethod }
  };
};

const readIncrementalHealthConnectChanges = async (changesToken: string) => {
  const observations: HealthObservationDraft[] = [];
  let token = changesToken;
  let hasMore = true;
  while (hasMore) {
    const page = await readHealthConnectChanges(HEALTH_CONNECT_RECORD_TYPES, token);
    if (page.changesTokenExpired) throw new Error('health_connect_changes_token_expired');
    page.upsertionChanges.forEach(({ record }) => {
      const observation = incrementalObservation(record as Record<string, any>);
      if (observation) observations.push(observation);
    });
    page.deletionChanges.forEach(({ recordId }) => observations.push({ metricType: 'provider_record_deletion',
      value: 0, unit: 'deleted', measuredAtISO: new Date().toISOString(), sourceProvider: 'health_connect',
      sourceRecordId: recordId, syncKey: `health_connect:deleted:${recordId}`, deleted: true }));
    token = page.nextChangesToken;
    hasMore = page.hasMore;
  }
  return { observations, nextChangesToken: token };
};

const syncFromHealthConnectInternal = async (changesToken?: string): Promise<WearableSyncPayload & { anchors?: Record<string,string> }> => {
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

  if (changesToken) {
    const incremental = await readIncrementalHealthConnectChanges(changesToken);
    return { deviceId:'hc-local-device',brand:'Other',model:'Health Connect',provider:'Health Connect',
      syncedAtISO:new Date().toISOString(),source:'api',metrics:{heartRateAvg:null,sleepHours:null,hydrationLiters:null,
        focusMinutes:null,breathingMinutes:null,movementMinutes:null},dataQuality:{confidence:incremental.observations.length ? 0.96 : 1,
        isEstimated:false,warnings:[],connectedMetrics:{}},observations:incremental.observations,
      anchors:{__changes__:incremental.nextChangesToken} };
  }

  const connectedMetrics: NonNullable<WearableSyncPayload['dataQuality']['connectedMetrics']> = {
    sleep: hasPermission(grantedSet, metricPermissionMap.sleep) ? 'no_recent_data' : 'no_permission',
    steps: hasPermission(grantedSet, 'Steps') ? 'no_recent_data' : 'no_permission',
    heart_rate: hasPermission(grantedSet, metricPermissionMap.heart_rate) ? 'no_recent_data' : 'no_permission',
    hrv: hasPermission(grantedSet, metricPermissionMap.hrv) ? 'no_recent_data' : 'no_permission',
    calories: hasPermission(grantedSet, metricPermissionMap.calories) ? 'no_recent_data' : 'no_permission',
    workouts: hasPermission(grantedSet, metricPermissionMap.workouts) ? 'no_recent_data' : 'no_permission',
    weight: hasPermission(grantedSet, 'Weight') ? 'no_recent_data' : 'no_permission',
    distance: hasPermission(grantedSet, 'Distance') ? 'no_recent_data' : 'no_permission',
    stress: 'unsupported',
    cycle: 'unsupported',
    spo2: 'unsupported',
    respiratory_rate: 'unsupported'
  };

  const failedMetrics: string[] = [];
  const readMetric = async <TRecord>(
    metric: keyof typeof connectedMetrics,
    recordType: Parameters<typeof readRecords>[0],
    options: Parameters<typeof readRecords>[1]
  ): Promise<TRecord[]> => {
    try {
      return await safeReadRecords<TRecord>(recordType, options);
    } catch {
      connectedMetrics[metric] = 'read_failed';
      failedMetrics.push(metric);
      return [];
    }
  };

  const end = toIso(now());
  const observations: HealthObservationDraft[] = [];
  const backfillWindow = DAY * INITIAL_BACKFILL_DAYS;
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
    const stepRecords = await readMetric<{ startTime: string; endTime: string; count?: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('steps', 'Steps', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - backfillWindow), endTime: end }
    });
    const valid = stepRecords.filter((record) => within(record.endTime, backfillWindow));
    stepCount = sum(valid.map((record) => record.count ?? 0));
    if (stepCount > 0) {
      connectedMetrics.steps = 'synced';
      valid.forEach((record) => addObservation('steps', record.count ?? null, 'count', record.endTime, 'Steps', record));
      console.info('[HealthConnect] Steps read success:', stepCount);
    } else if (connectedMetrics.steps !== 'read_failed') {
      connectedMetrics.steps = 'no_recent_data';
      console.warn('[HealthConnect] Steps no recent data');
    }
  }

  const sleepRecords = hasPermission(grantedSet, 'SleepSession')
    ? await readMetric<{ startTime: string; endTime: string; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('sleep', 'SleepSession', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - backfillWindow), endTime: end }
      })
    : ([] as Array<{ startTime: string; endTime: string; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>);

  const sleepMinutes = sum(
    sleepRecords
      .filter((record) => within(record.endTime, backfillWindow))
      .map((record) => Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000))
  );
  if (hasPermission(grantedSet, 'SleepSession')) {
    if (connectedMetrics.sleep !== 'read_failed') connectedMetrics.sleep = sleepMinutes > 0 ? 'synced' : 'no_recent_data';
    sleepRecords.filter((record) => within(record.endTime, backfillWindow)).forEach((record) => {
      const minutes = Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000);
      addObservation('sleep_minutes', minutes, 'min', record.endTime, 'SleepSession', record);
    });
    console.info('[HealthConnect] Sleep read', connectedMetrics.sleep, sleepMinutes);
  }

  const hrRecords = hasPermission(grantedSet, 'RestingHeartRate')
    ? await readMetric<{ time: string; beatsPerMinute: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('heart_rate', 'RestingHeartRate', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - backfillWindow), endTime: end }
      })
    : ([] as Array<{ time: string; beatsPerMinute: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>);
  const hrValues = hrRecords.filter((record) => within(record.time, backfillWindow)).map((record) => record.beatsPerMinute ?? 0).filter((v) => v > 0);
  const heartRateAvg = avg(hrValues);
  if (hasPermission(grantedSet, 'RestingHeartRate')) {
    if (connectedMetrics.heart_rate !== 'read_failed') connectedMetrics.heart_rate = heartRateAvg ? 'synced' : 'no_recent_data';
    hrRecords.filter((record) => within(record.time, backfillWindow)).forEach((record) =>
      addObservation('resting_heart_rate', record.beatsPerMinute, 'bpm', record.time, 'RestingHeartRate', record)
    );
    console.info('[HealthConnect] RestingHeartRate read', connectedMetrics.heart_rate, heartRateAvg ?? null);
  }

  const hrvRecords = hasPermission(grantedSet, 'HeartRateVariabilityRmssd')
    ? await readMetric<{ time: string; heartRateVariabilityMillis: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('hrv', 'HeartRateVariabilityRmssd', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - backfillWindow), endTime: end }
      })
    : ([] as Array<{ time: string; heartRateVariabilityMillis: number; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>);
  const hrvValues = hrvRecords.filter((record) => within(record.time, backfillWindow)).map((record) => record.heartRateVariabilityMillis ?? 0).filter((v) => v > 0);
  const hrvAvg = avg(hrvValues);
  if (hasPermission(grantedSet, 'HeartRateVariabilityRmssd')) {
    if (connectedMetrics.hrv !== 'read_failed') connectedMetrics.hrv = hrvAvg ? 'synced' : 'no_recent_data';
    hrvRecords.filter((record) => within(record.time, backfillWindow)).forEach((record) =>
      addObservation('hrv_ms', record.heartRateVariabilityMillis, 'ms', record.time, 'HeartRateVariabilityRmssd', record)
    );
    console.info('[HealthConnect] HRV read', connectedMetrics.hrv, hrvAvg ?? null);
  }

  const workoutRecords = hasPermission(grantedSet, 'ExerciseSession')
    ? await readMetric<{ startTime: string; endTime: string; title?: string; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('workouts', 'ExerciseSession', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - backfillWindow), endTime: end }
      })
    : ([] as Array<{ startTime: string; endTime: string; title?: string; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>);

  const workoutMinutes = sum(
    workoutRecords
      .filter((record) => within(record.endTime, backfillWindow))
      .map((record) => Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000))
  );

  if (hasPermission(grantedSet, 'ExerciseSession')) {
    if (connectedMetrics.workouts !== 'read_failed') connectedMetrics.workouts = workoutMinutes > 0 ? 'synced' : 'no_recent_data';
    workoutRecords.filter((record) => within(record.endTime, backfillWindow)).forEach((record) => {
      const minutes = Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000);
      addObservation('workout_minutes', minutes, 'min', record.endTime, 'ExerciseSession', record);
    });
    console.info('[HealthConnect] ExerciseSession read', connectedMetrics.workouts, workoutMinutes);
  }

  let caloriesKcal: number | null = null;
  if (hasPermission(grantedSet, 'ActiveCaloriesBurned')) {
    const records = await readMetric<{ startTime: string; endTime: string; energy: { inKilocalories: number }; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('calories', 'ActiveCaloriesBurned', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - backfillWindow), endTime: end }
    });
    const valid = records.filter((record) => within(record.endTime, backfillWindow));
    const values = valid.map((record) => record.energy.inKilocalories).filter((value) => value > 0);
    caloriesKcal = values.length ? sum(values) : null;
    valid.forEach((record) => addObservation('active_energy', record.energy.inKilocalories, 'kcal', record.endTime, 'ActiveCaloriesBurned', record));
    if (connectedMetrics.calories !== 'read_failed') connectedMetrics.calories = caloriesKcal == null ? 'no_recent_data' : 'synced';
  }

  if (hasPermission(grantedSet, 'Weight')) {
    const records = await readMetric<{ time: string; weight: { inKilograms: number }; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('weight', 'Weight', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - backfillWindow), endTime: end }
    });
    records.filter((record) => within(record.time, backfillWindow)).forEach((record) =>
      addObservation('weight', record.weight.inKilograms, 'kg', record.time, 'Weight', record)
    );
    if (connectedMetrics.weight !== 'read_failed') connectedMetrics.weight = records.length ? 'synced' : 'no_recent_data';
  }

  if (hasPermission(grantedSet, 'Distance')) {
    const records = await readMetric<{ startTime: string; endTime: string; distance: { inMeters: number }; metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string; device?: { manufacturer?: string; model?: string; type?: number }; recordingMethod?: number } }>('distance', 'Distance', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - backfillWindow), endTime: end }
    });
    records.filter((record) => within(record.endTime, backfillWindow)).forEach((record) =>
      addObservation('distance', record.distance.inMeters, 'm', record.endTime, 'Distance', record)
    );
    if (connectedMetrics.distance !== 'read_failed') connectedMetrics.distance = records.length ? 'synced' : 'no_recent_data';
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
      warnings: [
        ...(realSyncedCount > 0 ? [] : ['No recent Health Connect records were found for the selected metrics.']),
        ...(failedMetrics.length ? [`Some Health Connect metrics could not be read: ${failedMetrics.join(', ')}.`] : [])
      ],
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

  const baselineToken = await readHealthConnectChanges(HEALTH_CONNECT_RECORD_TYPES)
    .then((result) => result.nextChangesToken).catch(() => null);
  return baselineToken ? { ...payload, anchors: { __changes__: baselineToken } } : payload;
};

export const syncFromHealthConnect = (changesToken?: string) =>
  runHealthConnectOperation(
    'SYNCING',
    () => syncFromHealthConnectInternal(changesToken),
    (payload) => Object.values(payload.dataQuality.connectedMetrics ?? {}).includes('read_failed') ? 'PARTIAL_SUCCESS' : 'SUCCESS'
  );
