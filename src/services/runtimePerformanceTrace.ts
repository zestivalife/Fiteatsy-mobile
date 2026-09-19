export type RuntimePerformanceEvent =
  | 'APP_JS_START'
  | 'SESSION_RESTORE_START'
  | 'SESSION_RESTORE_END'
  | 'NAVIGATION_READY'
  | 'HOME_MOUNT_START'
  | 'HOME_MOUNT_END'
  | 'HEALTH_COORDINATOR_MOUNT'
  | 'HEALTH_SYNC_START'
  | 'HEALTH_SYNC_END'
  | 'HEALTH_CTA_TAP'
  | 'HEALTH_NATIVE_READ_START'
  | 'HEALTH_NATIVE_READ_END'
  | 'HEALTH_PERSISTENCE_START'
  | 'HEALTH_PERSISTENCE_END'
  | 'HEALTH_UPLOAD_START'
  | 'HEALTH_UPLOAD_END'
  | 'HEALTH_UI_REFRESH_START'
  | 'HEALTH_UI_REFRESH_END'
  | 'APP_BACKGROUND'
  | 'APP_FOREGROUND'
  | 'AGGREGATION_START'
  | 'AGGREGATION_END'
  | 'FIRST_INTERACTIVE';

const startedAt = Date.now();

export const traceRuntimePerformance = (
  event: RuntimePerformanceEvent,
  metadata: Record<string, string | number | boolean | null> = {}
) => {
  // Diagnostic metadata is deliberately limited to timings, counts and states.
  // Never pass identity, tokens, contact information or health values here.
  // Release markers are deliberately safe: they allow physical acceptance on
  // iOS versions where Instruments cannot attach, without emitting PII or
  // health values.
  console.info('[RuntimePerformance]', {
    event,
    elapsedMs: Date.now() - startedAt,
    ...metadata
  });
};
