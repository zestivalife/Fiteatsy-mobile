import type { HealthSyncStatus } from './healthSyncManager';
import type { HealthProviderState } from './healthPlatformAdapter';
import type { GovernedProvider } from './wearablePlatformService';

export type HealthMetricLifecycleState =
  | 'IDLE'
  | 'QUEUED'
  | 'REQUESTING_PERMISSION'
  | 'READING'
  | 'NORMALIZING'
  | 'PERSISTING'
  | 'AGGREGATING'
  | 'UPLOAD_PENDING'
  | 'COMPLETED'
  | 'NO_DATA'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED'
  | 'FAILED';

export type HealthMetricQueryState = HealthMetricLifecycleState;

export const HEALTH_METRIC_TERMINAL_STATES: readonly HealthMetricLifecycleState[] = [
  'COMPLETED', 'NO_DATA', 'PERMISSION_DENIED', 'UNSUPPORTED', 'FAILED'
] as const;

export const isHealthMetricTerminal = (state: HealthMetricLifecycleState) =>
  HEALTH_METRIC_TERMINAL_STATES.includes(state);

export const nativeMetricStatusToLifecycle = (
  supported: boolean,
  status: string | null | undefined,
  hasCanonicalRecords: boolean
): HealthMetricLifecycleState => {
  if (!supported) return 'UNSUPPORTED';
  if (hasCanonicalRecords || status === 'synced') return 'COMPLETED';
  if (status === 'no_permission') return 'PERMISSION_DENIED';
  if (status === 'unsupported') return 'UNSUPPORTED';
  if (status === 'no_recent_data' || status === 'missing') return 'NO_DATA';
  if (status === 'read_failed' || status === 'timeout' || status === 'unavailable') return 'FAILED';
  return 'NO_DATA';
};
export type HealthUploadState = 'IDLE'|'UPLOADING'|'SYNCED'|'PENDING'|'ERROR';

export const deriveHealthProviderState = (
  status: HealthSyncStatus | null,
  provider: GovernedProvider,
  locallyAvailable = true
): HealthProviderState => {
  if (!locallyAvailable) return 'UNAVAILABLE';
  const value = provider === 'APPLE_HEALTH' ? status?.appleHealth : status?.healthConnect;
  if (!value || value.consentStatus === 'WITHDRAWN' || value.status === 'REVOKED') return 'AVAILABLE';
  return value.connectionId || value.connectionAuthority === 'DURABLE_CONNECTION' || value.connectionAuthority === 'OBSERVATION_INFERRED'
    ? 'CONNECTED' : 'AVAILABLE';
};

export const providerStatusCopy = (providerState: HealthProviderState) => {
  switch (providerState) {
    case 'CONNECTED': return 'Connected';
    case 'ACTION_REQUIRED': return 'Action needed';
    case 'UNAVAILABLE': return 'Unavailable';
    case 'ERROR': return 'Connection error';
    default: return 'Available';
  }
};
