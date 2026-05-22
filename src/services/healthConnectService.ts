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
import { WearableSyncPayload } from '../types';

type HealthConnectMetricStatus = 'synced' | 'no_permission' | 'no_recent_data' | 'unsupported' | 'unavailable';

const USER_ID = 'emp-demo-1';

const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();

const toIso = (ms: number) => new Date(ms).toISOString();

const permissionList: Permission[] = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'ExerciseSession' }
];

const metricPermissionMap = {
  sleep: 'SleepSession',
  heart_rate: 'RestingHeartRate',
  hrv: 'HeartRateVariabilityRmssd',
  workouts: 'ExerciseSession',
  calories: 'ExerciseSession',
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
    const response = await readRecords(recordType, options);
    return (response?.records ?? []) as Array<TRecord>;
  } catch (error) {
    console.warn('[HealthConnect] readRecords_failed', recordType, error instanceof Error ? error.message : 'unknown_error');
    return [];
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
    sdkStatus = await getSdkStatus();
  } catch {
    return { ...base, sdkStatus: 'status_check_failed' };
  }
  if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    return { ...base, sdkStatus: String(sdkStatus) };
  }

  let initialized = false;
  let granted: Array<Permission> = [];
  try {
    initialized = await initialize();
    granted = (await getGrantedPermissions()) as Array<Permission>;
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
    ExerciseSession: toGranted('ExerciseSession')
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
    sdkStatus = await getSdkStatus();
  } catch {
    throw new Error('health_connect_status_failed');
  }
  console.info('[HealthConnect] SDK status:', sdkStatus);
  if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    throw new Error(`health_connect_unavailable_${sdkStatus}`);
  }

  let initialized = false;
  try {
    initialized = await initialize();
  } catch {
    throw new Error('health_connect_initialize_failed');
  }
  console.info('[HealthConnect] initialize:', initialized);
  if (!initialized) {
    throw new Error('health_connect_initialize_failed');
  }

  let grantedPermissions: Array<Permission> = [];
  let granted: Array<Permission> = [];
  try {
    grantedPermissions = (await requestPermission(permissionList)) as Array<Permission>;
    console.info('[HealthConnect] permission request returned:', grantedPermissions.length);
    granted = (await getGrantedPermissions()) as Array<Permission>;
  } catch {
    throw new Error('health_connect_permission_flow_failed');
  }
  const grantedSet = new Set(granted.map((permission) => toPermissionKey(permission as Permission)));

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
    const stepRecords = await safeReadRecords<{ endTime: string; count?: number }>('Steps', {
      timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY), endTime: end }
    });
    const valid = stepRecords.filter((record) => within(record.endTime, DAY));
    stepCount = sum(valid.map((record) => record.count ?? 0));
    if (stepCount > 0) {
      connectedMetrics.steps = 'synced';
      console.info('[HealthConnect] Steps read success:', stepCount);
    } else {
      connectedMetrics.steps = 'no_recent_data';
      console.warn('[HealthConnect] Steps no recent data');
    }
  }

  const sleepRecords = hasPermission(grantedSet, 'SleepSession')
    ? await safeReadRecords<{ startTime: string; endTime: string }>('SleepSession', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 2), endTime: end }
      })
    : ([] as Array<{ startTime: string; endTime: string }>);

  const sleepMinutes = sum(
    sleepRecords
      .filter((record) => within(record.endTime, DAY * 2))
      .map((record) => Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000))
  );
  if (hasPermission(grantedSet, 'SleepSession')) {
    connectedMetrics.sleep = sleepMinutes > 0 ? 'synced' : 'no_recent_data';
    console.info('[HealthConnect] Sleep read', connectedMetrics.sleep, sleepMinutes);
  }

  const hrRecords = hasPermission(grantedSet, 'RestingHeartRate')
    ? await safeReadRecords<{ time: string; beatsPerMinute: number }>('RestingHeartRate', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
      })
    : ([] as Array<{ time: string; beatsPerMinute: number }>);
  const hrValues = hrRecords.filter((record) => within(record.time, DAY * 7)).map((record) => record.beatsPerMinute ?? 0).filter((v) => v > 0);
  const heartRateAvg = avg(hrValues);
  if (hasPermission(grantedSet, 'RestingHeartRate')) {
    connectedMetrics.heart_rate = heartRateAvg ? 'synced' : 'no_recent_data';
    console.info('[HealthConnect] RestingHeartRate read', connectedMetrics.heart_rate, heartRateAvg ?? null);
  }

  const hrvRecords = hasPermission(grantedSet, 'HeartRateVariabilityRmssd')
    ? await safeReadRecords<{ time: string; heartRateVariabilityMillis: number }>('HeartRateVariabilityRmssd', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
      })
    : ([] as Array<{ time: string; heartRateVariabilityMillis: number }>);
  const hrvValues = hrvRecords.filter((record) => within(record.time, DAY * 7)).map((record) => record.heartRateVariabilityMillis ?? 0).filter((v) => v > 0);
  const hrvAvg = avg(hrvValues);
  if (hasPermission(grantedSet, 'HeartRateVariabilityRmssd')) {
    connectedMetrics.hrv = hrvAvg ? 'synced' : 'no_recent_data';
    console.info('[HealthConnect] HRV read', connectedMetrics.hrv, hrvAvg ?? null);
  }

  const workoutRecords = hasPermission(grantedSet, 'ExerciseSession')
    ? await safeReadRecords<{ startTime: string; endTime: string; title?: string }>('ExerciseSession', {
        timeRangeFilter: { operator: 'between', startTime: toIso(now() - DAY * 7), endTime: end }
      })
    : ([] as Array<{ startTime: string; endTime: string; title?: string }>);

  const workoutMinutes = sum(
    workoutRecords
      .filter((record) => within(record.endTime, DAY * 7))
      .map((record) => Math.max(0, (+new Date(record.endTime) - +new Date(record.startTime)) / 60000))
  );

  if (hasPermission(grantedSet, 'ExerciseSession')) {
    connectedMetrics.workouts = workoutMinutes > 0 ? 'synced' : 'no_recent_data';
    console.info('[HealthConnect] ExerciseSession read', connectedMetrics.workouts, workoutMinutes);
  }

  // Calories are derived from exercise sessions in this scoped implementation only.
  connectedMetrics.calories = connectedMetrics.workouts === 'synced' ? 'synced' : connectedMetrics.workouts;

  const realSyncedCount = Object.values(connectedMetrics).filter((status) => status === 'synced').length;
  if (realSyncedCount === 0) {
    console.warn('[HealthConnect] No real metric synced.');
  }

  const payload: WearableSyncPayload = {
    deviceId: `hc-${USER_ID}`,
    brand: 'Other',
    model: 'Health Connect',
    provider: 'Health Connect',
    syncedAtISO: new Date().toISOString(),
    source: 'api',
    metrics: {
      heartRateAvg: Math.round(heartRateAvg ?? 0),
      sleepHours: Number((sleepMinutes / 60).toFixed(1)),
      hydrationLiters: 0,
      focusMinutes: Math.round(stepCount > 0 ? stepCount / 120 : 0),
      breathingMinutes: 0,
      movementMinutes: Math.round(workoutMinutes),
      hrvMs: hrvAvg == null ? null : Number(hrvAvg.toFixed(1)),
      caloriesKcal: workoutMinutes > 0 ? Math.round(workoutMinutes * 6) : null,
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
    }
  };

  return payload;
};
