export type SessionLifecycleEvent =
  | 'APP_START'
  | 'LOCAL_SESSION_READ_START'
  | 'LOCAL_SESSION_READ_SUCCESS'
  | 'LOCAL_SESSION_READ_EMPTY'
  | 'NAVIGATION_HOME'
  | 'NAVIGATION_LOGIN'
  | 'AUTH_REQUEST_START'
  | 'AUTH_REQUEST_SUCCESS'
  | 'AUTH_REQUEST_TIMEOUT'
  | 'REMOTE_PROFILE_START'
  | 'REMOTE_PROFILE_END'
  | 'HEALTH_SYNC_START';

export const traceSessionLifecycle = (
  event: SessionLifecycleEvent,
  metadata: Record<string, string | number | boolean | null> = {}
) => {
  // Deliberately excludes tokens, contact details and health payloads.
  console.info('[SessionLifecycle]', { event, atISO: new Date().toISOString(), ...metadata });
};
