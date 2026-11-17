export type HealthSyncDiagnosticEvent = {
  event: 'LOCAL_READ'|'QUEUE_STATE'|'UPLOAD_BATCH'|'SYNC_COMPLETE'|'SYNC_FAILED';
  correlationId: string;
  provider: 'APPLE_HEALTH'|'HEALTH_CONNECT';
  durationMs?: number;
  recordsRead?: number;
  recordsAccepted?: number;
  recordsUpdated?: number;
  recordsDeleted?: number;
  recordsRejected?: number;
  pendingCount?: number;
  oldestPendingAgeMs?: number|null;
  retryable?: boolean;
  errorCode?: string;
};

let sink: ((event: HealthSyncDiagnosticEvent) => void) | null = null;

export const setHealthSyncDiagnosticSink = (next: typeof sink) => { sink = next; };

/** Emits operational counters only. Raw measurements and user identity are excluded by type. */
export const emitHealthSyncDiagnostic = (event: HealthSyncDiagnosticEvent) => {
  sink?.(event);
  if (__DEV__) console.info('[HealthSyncDiagnostic]', event);
};

export const newHealthSyncCorrelationId = () =>
  `hs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
