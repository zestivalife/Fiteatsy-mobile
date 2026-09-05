export const HEALTH_OBSERVATION_FRESHNESS_MS = {
    steps: 24 * 60 * 60 * 1000,
    active_minutes: 24 * 60 * 60 * 1000,
    hydration_ml: 24 * 60 * 60 * 1000,
    mindfulness_minutes: 24 * 60 * 60 * 1000,
    stress_score: 24 * 60 * 60 * 1000,
    sleep_minutes: 48 * 60 * 60 * 1000,
    resting_heart_rate: 7 * 24 * 60 * 60 * 1000,
    hrv_ms: 7 * 24 * 60 * 60 * 1000,
    workout_minutes: 7 * 24 * 60 * 60 * 1000
};
export const isCurrentHealthObservation = (observation, nowMs = Date.now()) => {
    const windowMs = HEALTH_OBSERVATION_FRESHNESS_MS[observation.metricType];
    const measuredAtMs = Date.parse(observation.measuredAtISO);
    return windowMs != null && Number.isFinite(measuredAtMs) && measuredAtMs <= nowMs && nowMs - measuredAtMs <= windowMs;
};
