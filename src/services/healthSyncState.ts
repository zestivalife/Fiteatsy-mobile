import type { HealthSyncStatus } from './healthSyncManager';
import type { HealthProviderState } from './healthPlatformAdapter';
import type { GovernedProvider } from './wearablePlatformService';

export type HealthMetricQueryState = 'IDLE'|'QUERYING'|'DATA_AVAILABLE'|'NO_VISIBLE_DATA'|'ERROR'|'TIMEOUT'|'UPLOAD_PENDING';
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
