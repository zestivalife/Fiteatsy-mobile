export const HEALTH_OBSERVATION_FRESHNESS_MS: Record<string, number> = {
  steps: 24 * 60 * 60 * 1000,
  active_minutes: 24 * 60 * 60 * 1000,
  hydration_ml: 24 * 60 * 60 * 1000,
  mindfulness_minutes: 24 * 60 * 60 * 1000,
  stress_score: 24 * 60 * 60 * 1000,
  sleep_minutes: 48 * 60 * 60 * 1000,
  sleep_asleep_minutes: 48 * 60 * 60 * 1000,
  sleep_core_minutes: 48 * 60 * 60 * 1000,
  sleep_deep_minutes: 48 * 60 * 60 * 1000,
  sleep_rem_minutes: 48 * 60 * 60 * 1000,
  resting_heart_rate: 7 * 24 * 60 * 60 * 1000,
  heart_rate: 24 * 60 * 60 * 1000,
  hrv_ms: 7 * 24 * 60 * 60 * 1000,
  workout_minutes: 7 * 24 * 60 * 60 * 1000,
  spo2_pct: 7 * 24 * 60 * 60 * 1000,
  respiratory_rate_brpm: 7 * 24 * 60 * 60 * 1000
};

export const isCurrentHealthObservation = (
  observation: { metricType: string; measuredAtISO: string },
  nowMs = Date.now()
) => {
  const windowMs = HEALTH_OBSERVATION_FRESHNESS_MS[observation.metricType];
  const measuredAtMs = Date.parse(observation.measuredAtISO);
  return windowMs != null && Number.isFinite(measuredAtMs) && measuredAtMs <= nowMs && nowMs - measuredAtMs <= windowMs;
};
