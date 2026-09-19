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
  | 'AGGREGATION_START'
  | 'AGGREGATION_END'
  | 'FIRST_INTERACTIVE';

const startedAt = Date.now();

export const traceRuntimePerformance = (
  event: RuntimePerformanceEvent,
  metadata: Record<string, string | number | boolean | null> = {}
) => {
  if (!__DEV__) return;
  // Diagnostic metadata is deliberately limited to timings, counts and states.
  // Never pass identity, tokens, contact information or health values here.
  console.info('[RuntimePerformance]', {
    event,
    elapsedMs: Date.now() - startedAt,
    ...metadata
  });
};

