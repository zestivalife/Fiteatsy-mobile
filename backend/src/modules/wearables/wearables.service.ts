import { randomUUID } from 'crypto';

export type WearableBrand = 'Apple' | 'Samsung' | 'Xiaomi' | 'Amazfit' | 'GoBOLT' | 'Other';
export type HealthAppId = 'apple-health' | 'health-connect' | 'google-fit' | 'samsung-health' | 'fitbit';
export type HealthPlatform = 'ios' | 'android';

export type HealthMetricRecord = {
  type:
    | 'steps'
    | 'sleep_minutes'
    | 'resting_heart_rate'
    | 'hydration_ml'
    | 'active_minutes'
    | 'mindfulness_minutes'
    | 'hrv_ms'
    | 'calories_kcal'
    | 'workout_minutes'
    | 'stress_score'
    | 'cycle_day'
    | 'spo2_pct'
    | 'respiratory_rate_brpm';
  value: number;
  recordedAtISO: string;
};

type HealthAppOption = {
  id: HealthAppId;
  label: string;
  subtitle: string;
  brand: WearableBrand;
};

type HealthConnection = {
  id: string;
  userId: string;
  appId: HealthAppId;
  appName: string;
  platform: HealthPlatform;
  provider: string;
  connectedAtISO: string;
  status: 'connected' | 'paused';
};

type WearableSyncPayload = {
  deviceId: string;
  brand: WearableBrand;
  model: string;
  provider: string;
  syncedAtISO: string;
  source: 'api';
  metrics: {
    heartRateAvg: number;
    sleepHours: number;
    hydrationLiters: number;
    focusMinutes: number;
    breathingMinutes: number;
    movementMinutes: number;
    hrvMs: number | null;
    caloriesKcal: number | null;
    workoutMinutes: number | null;
    stressScore: number | null;
    cyclePhase: string | null;
    spo2Pct: number | null;
    respiratoryRateBrpm: number | null;
  };
  dataQuality: {
    confidence: number;
    isEstimated: boolean;
    warnings: string[];
    connectedMetrics: Record<
      'sleep' | 'steps' | 'heart_rate' | 'hrv' | 'calories' | 'workouts' | 'stress' | 'cycle' | 'spo2' | 'respiratory_rate',
      'synced' | 'missing' | 'unsupported' | 'estimated'
    >;
    normalizedDomains: {
      Activity: number | null;
      Sleep: number | null;
      Recovery: number | null;
      Calm: number | null;
      Cycle: number | null;
      Nutrition: number | null;
    };
  };
};

const healthAppsByPlatform: Record<HealthPlatform, HealthAppOption[]> = {
  ios: [
    { id: 'apple-health', label: 'Apple Health', subtitle: 'iPhone wellness and activity data', brand: 'Apple' },
    { id: 'fitbit', label: 'Fitbit', subtitle: 'Sleep and movement summaries', brand: 'Other' }
  ],
  android: [
    { id: 'health-connect', label: 'Health Connect', subtitle: 'Android unified health data', brand: 'Other' },
    { id: 'google-fit', label: 'Google Fit', subtitle: 'Activity, steps, and heart trends', brand: 'Other' },
    { id: 'samsung-health', label: 'Samsung Health', subtitle: 'Samsung device health insights', brand: 'Samsung' },
    { id: 'fitbit', label: 'Fitbit', subtitle: 'Sleep and movement summaries', brand: 'Other' }
  ]
};

const providerLabel: Record<WearableBrand, string> = {
  Apple: 'HealthKit',
  Samsung: 'Samsung Health',
  Xiaomi: 'Mi Fitness',
  Amazfit: 'Zepp',
  GoBOLT: 'GoBOLT Health',
  Other: 'Nuetra Universal Adapter'
};

const supportedMetricsByApp: Record<
  HealthAppId,
  Set<
    | 'sleep'
    | 'heart_rate'
    | 'hrv'
    | 'calories'
    | 'workouts'
    | 'stress'
    | 'cycle'
    | 'spo2'
    | 'respiratory_rate'
  >
> = {
  'apple-health': new Set(['sleep', 'heart_rate', 'hrv', 'calories', 'workouts', 'cycle', 'spo2', 'respiratory_rate']),
  'health-connect': new Set(['sleep', 'heart_rate', 'hrv', 'calories', 'workouts', 'cycle', 'spo2', 'respiratory_rate']),
  'google-fit': new Set(['sleep', 'heart_rate', 'calories', 'workouts']),
  'samsung-health': new Set(['sleep', 'heart_rate', 'hrv', 'calories', 'workouts', 'stress', 'spo2']),
  fitbit: new Set(['sleep', 'heart_rate', 'hrv', 'calories', 'workouts', 'stress', 'respiratory_rate'])
};

const baselineByBrand: Record<WearableBrand, WearableSyncPayload['metrics']> = {
  Apple: { heartRateAvg: 69, sleepHours: 7.6, hydrationLiters: 2.7, focusMinutes: 26, breathingMinutes: 12, movementMinutes: 20, hrvMs: 41, caloriesKcal: 620, workoutMinutes: 34, stressScore: null, cyclePhase: null, spo2Pct: 97, respiratoryRateBrpm: 14 },
  Samsung: { heartRateAvg: 71, sleepHours: 7.2, hydrationLiters: 2.5, focusMinutes: 22, breathingMinutes: 10, movementMinutes: 18, hrvMs: 38, caloriesKcal: 570, workoutMinutes: 30, stressScore: 48, cyclePhase: null, spo2Pct: 96, respiratoryRateBrpm: null },
  Xiaomi: { heartRateAvg: 73, sleepHours: 6.9, hydrationLiters: 2.3, focusMinutes: 19, breathingMinutes: 8, movementMinutes: 16, hrvMs: null, caloriesKcal: 520, workoutMinutes: 25, stressScore: null, cyclePhase: null, spo2Pct: null, respiratoryRateBrpm: null },
  Amazfit: { heartRateAvg: 72, sleepHours: 7.1, hydrationLiters: 2.4, focusMinutes: 20, breathingMinutes: 9, movementMinutes: 17, hrvMs: null, caloriesKcal: 540, workoutMinutes: 28, stressScore: null, cyclePhase: null, spo2Pct: null, respiratoryRateBrpm: null },
  GoBOLT: { heartRateAvg: 72, sleepHours: 7.1, hydrationLiters: 2.4, focusMinutes: 20, breathingMinutes: 9, movementMinutes: 17, hrvMs: null, caloriesKcal: 540, workoutMinutes: 28, stressScore: null, cyclePhase: null, spo2Pct: null, respiratoryRateBrpm: null },
  Other: { heartRateAvg: 72, sleepHours: 7, hydrationLiters: 2.4, focusMinutes: 20, breathingMinutes: 9, movementMinutes: 16, hrvMs: null, caloriesKcal: 520, workoutMinutes: 24, stressScore: null, cyclePhase: null, spo2Pct: null, respiratoryRateBrpm: null }
};

const connections = new Map<string, HealthConnection>();
const recordsByConnectionId = new Map<string, HealthMetricRecord[]>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const jitter = (seed: number, variance: number) => (Math.random() - 0.5) * variance + seed;

const getBrandForApp = (platform: HealthPlatform, appId: HealthAppId): WearableBrand => {
  const app = healthAppsByPlatform[platform].find((item) => item.id === appId);
  return app?.brand ?? 'Other';
};

export const getHealthApps = (platform: HealthPlatform) => healthAppsByPlatform[platform];

export const connectHealthApp = (params: {
  userId: string;
  platform: HealthPlatform;
  appId: HealthAppId;
}) => {
  const app = healthAppsByPlatform[params.platform].find((item) => item.id === params.appId);
  if (!app) {
    throw new Error('app_not_supported');
  }

  const existing = Array.from(connections.values()).find(
    (item) => item.userId === params.userId && item.appId === params.appId && item.platform === params.platform
  );

  const connection: HealthConnection = existing
    ? { ...existing, status: 'connected' }
    : {
        id: `conn-${randomUUID()}`,
        userId: params.userId,
        appId: app.id,
        appName: app.label,
        platform: params.platform,
        provider: providerLabel[app.brand],
        connectedAtISO: new Date().toISOString(),
        status: 'connected'
      };

  connections.set(connection.id, connection);
  if (!recordsByConnectionId.has(connection.id)) {
    recordsByConnectionId.set(connection.id, []);
  }

  return connection;
};

export const getConnections = (userId: string) =>
  Array.from(connections.values())
    .filter((item) => item.userId === userId)
    .sort((a, b) => +new Date(b.connectedAtISO) - +new Date(a.connectedAtISO));

export const ingestHealthRecords = (params: {
  userId: string;
  appId: HealthAppId;
  platform: HealthPlatform;
  records: HealthMetricRecord[];
}) => {
  const connection = connectHealthApp({ userId: params.userId, appId: params.appId, platform: params.platform });
  const current = recordsByConnectionId.get(connection.id) ?? [];
  const merged = [...params.records, ...current]
    .filter((item) => Number.isFinite(item.value) && !Number.isNaN(+new Date(item.recordedAtISO)))
    .slice(0, 5000);
  recordsByConnectionId.set(connection.id, merged);

  return {
    connectionId: connection.id,
    ingestedCount: params.records.length,
    totalStored: merged.length,
    latestRecordedAtISO: merged[0]?.recordedAtISO ?? null
  };
};

const aggregateLiveMetrics = (records: HealthMetricRecord[], base: WearableSyncPayload['metrics']): WearableSyncPayload['metrics'] => {
  if (records.length === 0) {
    return {
      heartRateAvg: Math.round(clamp(jitter(base.heartRateAvg, 6), 52, 110)),
      sleepHours: Number(clamp(jitter(base.sleepHours, 1.2), 4.5, 9.5).toFixed(1)),
      hydrationLiters: Number(clamp(jitter(base.hydrationLiters, 0.8), 0.8, 5).toFixed(1)),
      focusMinutes: Math.round(clamp(jitter(base.focusMinutes, 12), 5, 90)),
      breathingMinutes: Math.round(clamp(jitter(base.breathingMinutes, 8), 2, 40)),
      movementMinutes: Math.round(clamp(jitter(base.movementMinutes, 18), 5, 120)),
      hrvMs: base.hrvMs,
      caloriesKcal: base.caloriesKcal,
      workoutMinutes: base.workoutMinutes,
      stressScore: base.stressScore,
      cyclePhase: base.cyclePhase,
      spo2Pct: base.spo2Pct,
      respiratoryRateBrpm: base.respiratoryRateBrpm
    };
  }

  const now = Date.now();
  const lookbackMs = 24 * 60 * 60 * 1000;
  const recent = records.filter((item) => now - +new Date(item.recordedAtISO) <= lookbackMs);

  const values = (type: HealthMetricRecord['type']) => recent.filter((item) => item.type === type).map((item) => item.value);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const resting = avg(values('resting_heart_rate'));
  const sleepMinutes = sum(values('sleep_minutes'));
  const hydrationMl = sum(values('hydration_ml'));
  const activeMinutes = sum(values('active_minutes'));
  const focusMinutes = sum(values('steps')) > 0 ? Math.round(sum(values('steps')) / 120) : null;
  const breathingMinutes = sum(values('mindfulness_minutes'));
  const hrv = avg(values('hrv_ms'));
  const calories = sum(values('calories_kcal'));
  const workoutMinutes = sum(values('workout_minutes'));
  const stress = avg(values('stress_score'));
  const cycleDay = avg(values('cycle_day'));
  const spo2 = avg(values('spo2_pct'));
  const respiratoryRate = avg(values('respiratory_rate_brpm'));

  const cyclePhase =
    cycleDay == null
      ? null
      : cycleDay <= 5
        ? 'menstrual'
        : cycleDay <= 13
          ? 'follicular'
          : cycleDay <= 16
            ? 'ovulation_window'
            : 'luteal';

  return {
    heartRateAvg: Math.round(clamp(resting ?? jitter(base.heartRateAvg, 5), 48, 115)),
    sleepHours: Number(clamp((sleepMinutes > 0 ? sleepMinutes / 60 : base.sleepHours), 3.5, 10).toFixed(1)),
    hydrationLiters: Number(clamp((hydrationMl > 0 ? hydrationMl / 1000 : base.hydrationLiters), 0.7, 5.5).toFixed(1)),
    focusMinutes: Math.round(clamp(focusMinutes ?? base.focusMinutes, 5, 120)),
    breathingMinutes: Math.round(clamp(breathingMinutes > 0 ? breathingMinutes : base.breathingMinutes, 2, 60)),
    movementMinutes: Math.round(clamp(activeMinutes > 0 ? activeMinutes : base.movementMinutes, 5, 180)),
    hrvMs: hrv == null ? null : Math.round(clamp(hrv, 10, 180)),
    caloriesKcal: calories > 0 ? Math.round(clamp(calories, 20, 7000)) : null,
    workoutMinutes: workoutMinutes > 0 ? Math.round(clamp(workoutMinutes, 1, 360)) : null,
    stressScore: stress == null ? null : Math.round(clamp(stress, 0, 100)),
    cyclePhase,
    spo2Pct: spo2 == null ? null : Number(clamp(spo2, 80, 100).toFixed(1)),
    respiratoryRateBrpm: respiratoryRate == null ? null : Number(clamp(respiratoryRate, 6, 40).toFixed(1))
  };
};

export const buildLiveSyncPayload = (params: { userId: string; appId?: HealthAppId; platform?: HealthPlatform }) => {
  const pool = getConnections(params.userId).filter((item) => item.status === 'connected');
  const connection = params.appId
    ? pool.find((item) => item.appId === params.appId && (!params.platform || item.platform === params.platform))
    : pool[0];

  if (!connection) {
    throw new Error('connection_not_found');
  }

  const brand = getBrandForApp(connection.platform, connection.appId);
  const records = recordsByConnectionId.get(connection.id) ?? [];
  const metrics = aggregateLiveMetrics(records, baselineByBrand[brand]);
  const supported = supportedMetricsByApp[connection.appId];
  const recent = records.filter((item) => Date.now() - +new Date(item.recordedAtISO) <= 24 * 60 * 60 * 1000);
  const has = (type: HealthMetricRecord['type']) => recent.some((item) => item.type === type && item.value > 0);

  const connectedMetrics: WearableSyncPayload['dataQuality']['connectedMetrics'] = {
    sleep: !supported.has('sleep') ? 'unsupported' : has('sleep_minutes') ? 'synced' : records.length === 0 ? 'estimated' : 'missing',
    steps: !supported.has('workouts') ? (supported.has('calories') ? 'missing' : 'unsupported') : has('steps') ? 'synced' : records.length === 0 ? 'estimated' : 'missing',
    heart_rate: !supported.has('heart_rate') ? 'unsupported' : has('resting_heart_rate') ? 'synced' : records.length === 0 ? 'estimated' : 'missing',
    hrv: !supported.has('hrv') ? 'unsupported' : has('hrv_ms') ? 'synced' : records.length === 0 ? 'estimated' : 'missing',
    calories: !supported.has('calories') ? 'unsupported' : has('calories_kcal') ? 'synced' : records.length === 0 ? 'estimated' : 'missing',
    workouts: !supported.has('workouts') ? 'unsupported' : has('workout_minutes') ? 'synced' : records.length === 0 ? 'estimated' : 'missing',
    stress: !supported.has('stress') ? 'unsupported' : has('stress_score') ? 'synced' : records.length === 0 ? 'estimated' : 'missing',
    cycle: !supported.has('cycle') ? 'unsupported' : has('cycle_day') ? 'synced' : records.length === 0 ? 'estimated' : 'missing',
    spo2: !supported.has('spo2') ? 'unsupported' : has('spo2_pct') ? 'synced' : records.length === 0 ? 'estimated' : 'missing',
    respiratory_rate: !supported.has('respiratory_rate') ? 'unsupported' : has('respiratory_rate_brpm') ? 'synced' : records.length === 0 ? 'estimated' : 'missing'
  };

  const normalizedDomains: WearableSyncPayload['dataQuality']['normalizedDomains'] = {
    Activity: metrics.movementMinutes,
    Sleep: metrics.sleepHours,
    Recovery: metrics.hrvMs ?? metrics.sleepHours,
    Calm: metrics.stressScore == null ? metrics.breathingMinutes : Math.max(0, 100 - metrics.stressScore),
    Cycle: metrics.cyclePhase ? 1 : null,
    Nutrition: metrics.caloriesKcal
  };

  const payload: WearableSyncPayload = {
    deviceId: connection.id,
    brand,
    model: connection.appName,
    provider: connection.provider,
    syncedAtISO: new Date().toISOString(),
    source: 'api',
    metrics,
    dataQuality: {
      confidence: records.length > 0 ? 0.95 : 0.86,
      isEstimated: records.length === 0,
      warnings: records.length === 0 ? ['No live records yet. Using provider baseline until records are ingested.'] : [],
      connectedMetrics,
      normalizedDomains
    }
  };

  return { connection, payload };
};
