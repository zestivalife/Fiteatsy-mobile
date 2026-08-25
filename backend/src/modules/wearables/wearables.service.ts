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
    heartRateAvg: number | null;
    sleepHours: number | null;
    hydrationLiters: number | null;
    focusMinutes: number | null;
    breathingMinutes: number | null;
    movementMinutes: number | null;
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

  const connection: HealthConnection = {
        id: `canonical-${params.userId}-${params.platform}-${params.appId}`,
        userId: params.userId,
        appId: app.id,
        appName: app.label,
        platform: params.platform,
        provider: providerLabel[app.brand],
        connectedAtISO: new Date().toISOString(),
        status: 'connected'
      };

  return connection;
};

const aggregateLiveMetrics = (records: HealthMetricRecord[]): WearableSyncPayload['metrics'] => {
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
    heartRateAvg: resting == null ? null : Math.round(clamp(resting, 48, 115)),
    sleepHours: sleepMinutes > 0 ? Number(clamp(sleepMinutes / 60, 0, 10).toFixed(1)) : null,
    hydrationLiters: hydrationMl > 0 ? Number(clamp(hydrationMl / 1000, 0, 5.5).toFixed(1)) : null,
    focusMinutes: focusMinutes == null ? null : Math.round(clamp(focusMinutes, 0, 120)),
    breathingMinutes: breathingMinutes > 0 ? Math.round(clamp(breathingMinutes, 0, 60)) : null,
    movementMinutes: activeMinutes > 0 ? Math.round(clamp(activeMinutes, 0, 180)) : null,
    hrvMs: hrv == null ? null : Math.round(clamp(hrv, 10, 180)),
    caloriesKcal: calories > 0 ? Math.round(clamp(calories, 20, 7000)) : null,
    workoutMinutes: workoutMinutes > 0 ? Math.round(clamp(workoutMinutes, 1, 360)) : null,
    stressScore: stress == null ? null : Math.round(clamp(stress, 0, 100)),
    cyclePhase,
    spo2Pct: spo2 == null ? null : Number(clamp(spo2, 80, 100).toFixed(1)),
    respiratoryRateBrpm: respiratoryRate == null ? null : Number(clamp(respiratoryRate, 6, 40).toFixed(1))
  };
};

export const buildLiveSyncPayload = (params: {
  userId: string;
  appId: HealthAppId;
  platform: HealthPlatform;
  records: HealthMetricRecord[];
}) => {
  const connection = connectHealthApp(params);

  const brand = getBrandForApp(connection.platform, connection.appId);
  const records = params.records;
  if (records.length === 0) {
    throw new Error('insufficient_data');
  }

  const metrics = aggregateLiveMetrics(records);
  const supported = supportedMetricsByApp[connection.appId];
  const recent = records.filter((item) => Date.now() - +new Date(item.recordedAtISO) <= 24 * 60 * 60 * 1000);
  const has = (type: HealthMetricRecord['type']) => recent.some((item) => item.type === type && item.value > 0);

  const connectedMetrics: WearableSyncPayload['dataQuality']['connectedMetrics'] = {
    sleep: !supported.has('sleep') ? 'unsupported' : has('sleep_minutes') ? 'synced' : 'missing',
    steps: !supported.has('workouts') ? (supported.has('calories') ? 'missing' : 'unsupported') : has('steps') ? 'synced' : 'missing',
    heart_rate: !supported.has('heart_rate') ? 'unsupported' : has('resting_heart_rate') ? 'synced' : 'missing',
    hrv: !supported.has('hrv') ? 'unsupported' : has('hrv_ms') ? 'synced' : 'missing',
    calories: !supported.has('calories') ? 'unsupported' : has('calories_kcal') ? 'synced' : 'missing',
    workouts: !supported.has('workouts') ? 'unsupported' : has('workout_minutes') ? 'synced' : 'missing',
    stress: !supported.has('stress') ? 'unsupported' : has('stress_score') ? 'synced' : 'missing',
    cycle: !supported.has('cycle') ? 'unsupported' : has('cycle_day') ? 'synced' : 'missing',
    spo2: !supported.has('spo2') ? 'unsupported' : has('spo2_pct') ? 'synced' : 'missing',
    respiratory_rate: !supported.has('respiratory_rate') ? 'unsupported' : has('respiratory_rate_brpm') ? 'synced' : 'missing'
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
      confidence: 0.95,
      isEstimated: false,
      warnings: [],
      connectedMetrics,
      normalizedDomains
    }
  };

  return { connection, payload };
};

export const resetWearablesStateForTests = () => {
  // Legacy process-memory state was removed. Canonical test cleanup is database-backed.
};
