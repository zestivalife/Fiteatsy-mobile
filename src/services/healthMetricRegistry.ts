export type HealthMetricAggregation = 'SUM' | 'LATEST' | 'AVERAGE' | 'INTERVAL' | 'SAMPLE_SERIES';

export type HealthMetricDefinition = {
  metricKey: string;
  displayName: string;
  appleHealthType: string | null;
  healthConnectRecord: string | null;
  unit: string;
  aggregation: HealthMetricAggregation;
  permissionRequired: boolean;
  syncWindowDays: number;
  backendCanonicalType: string;
  downstreamUsage: readonly string[];
};

/**
 * Authoritative mobile capability contract. Entries exist only when the
 * corresponding native adapter, normalizer and backend validator are present.
 * Adding an SDK identifier here alone is intentionally insufficient.
 */
export const HEALTH_METRIC_REGISTRY: readonly HealthMetricDefinition[] = [
  {metricKey:'steps',displayName:'Steps',appleHealthType:'steps',healthConnectRecord:'Steps',unit:'count',aggregation:'SUM',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'steps',downstreamUsage:['activity','star_orb']},
  {metricKey:'distance',displayName:'Distance',appleHealthType:'distance',healthConnectRecord:'Distance',unit:'m',aggregation:'SUM',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'distance',downstreamUsage:['activity']},
  {metricKey:'sleep',displayName:'Sleep',appleHealthType:'sleep_minutes',healthConnectRecord:'SleepSession',unit:'min',aggregation:'INTERVAL',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'sleep_minutes',downstreamUsage:['sleep','recovery','star_orb']},
  {metricKey:'heart_rate',displayName:'Heart Rate',appleHealthType:'heart_rate',healthConnectRecord:null,unit:'bpm',aggregation:'SAMPLE_SERIES',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'heart_rate',downstreamUsage:['heart']},
  {metricKey:'resting_heart_rate',displayName:'Resting Heart Rate',appleHealthType:'resting_heart_rate',healthConnectRecord:'RestingHeartRate',unit:'bpm',aggregation:'LATEST',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'resting_heart_rate',downstreamUsage:['heart','recovery']},
  {metricKey:'hrv_sdnn',displayName:'HRV (SDNN)',appleHealthType:'hrv_ms',healthConnectRecord:null,unit:'ms',aggregation:'SAMPLE_SERIES',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'hrv_sdnn_ms',downstreamUsage:['recovery']},
  {metricKey:'hrv_rmssd',displayName:'HRV (RMSSD)',appleHealthType:null,healthConnectRecord:'HeartRateVariabilityRmssd',unit:'ms',aggregation:'SAMPLE_SERIES',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'hrv_rmssd_ms',downstreamUsage:['recovery']},
  {metricKey:'active_energy',displayName:'Active Energy',appleHealthType:'active_energy',healthConnectRecord:'ActiveCaloriesBurned',unit:'kcal',aggregation:'SUM',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'active_energy',downstreamUsage:['activity','energy']},
  {metricKey:'exercise',displayName:'Exercise',appleHealthType:'exercise_minutes',healthConnectRecord:null,unit:'min',aggregation:'SUM',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'active_minutes',downstreamUsage:['activity']},
  {metricKey:'workout',displayName:'Workouts',appleHealthType:'workout_minutes',healthConnectRecord:'ExerciseSession',unit:'min',aggregation:'INTERVAL',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'workout_minutes',downstreamUsage:['activity','recovery']},
  {metricKey:'weight',displayName:'Weight',appleHealthType:'weight',healthConnectRecord:'Weight',unit:'kg',aggregation:'LATEST',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'weight',downstreamUsage:['body']},
  {metricKey:'hydration',displayName:'Hydration',appleHealthType:'hydration_ml',healthConnectRecord:null,unit:'ml',aggregation:'SUM',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'hydration_ml',downstreamUsage:['hydration']},
  {metricKey:'spo2',displayName:'Blood Oxygen',appleHealthType:'spo2',healthConnectRecord:null,unit:'pct',aggregation:'AVERAGE',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'spo2',downstreamUsage:['respiratory']},
  {metricKey:'respiratory_rate',displayName:'Respiratory Rate',appleHealthType:'respiratory_rate',healthConnectRecord:null,unit:'brpm',aggregation:'AVERAGE',permissionRequired:true,syncWindowDays:90,backendCanonicalType:'respiratory_rate',downstreamUsage:['respiratory']}
] as const;

export const APPLE_HEALTH_QUERYABLE_METRICS = HEALTH_METRIC_REGISTRY.filter((metric) => metric.appleHealthType != null);
export const HEALTH_CONNECT_QUERYABLE_METRICS = HEALTH_METRIC_REGISTRY.filter((metric) => metric.healthConnectRecord != null);
export const APPLE_HEALTH_READ_TYPES = APPLE_HEALTH_QUERYABLE_METRICS.map((metric) => metric.appleHealthType!);
export const HEALTH_CONNECT_READ_RECORDS = HEALTH_CONNECT_QUERYABLE_METRICS.map((metric) => metric.healthConnectRecord!);

