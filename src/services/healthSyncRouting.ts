import type { HealthSyncStatus } from './healthSyncManager';

export type HealthConnectionState = 'UNKNOWN' | 'NEVER_CONNECTED' | 'CONNECTED';
export type HealthSyncDestination = 'HealthDataSync' | null;

export type HealthSyncRouteResolution = {
  connectionState: HealthConnectionState;
  destination: HealthSyncDestination;
  ctaLabel: 'Connect' | 'Sync' | 'Checking…';
};

const hasPersistedProviderIdentity = (provider: HealthSyncStatus['appleHealth'] | HealthSyncStatus['healthConnect']) =>
  provider.consentStatus !== 'WITHDRAWN' && provider.status !== 'REVOKED' && (
    Boolean(provider.connectionId) ||
    provider.connectionAuthority === 'DURABLE_CONNECTION' ||
    provider.connectionAuthority === 'OBSERVATION_INFERRED'
  );

/** Connection identity determines navigation; sync outcome is presentation state. */
export const resolveHealthSyncRoute = (status: HealthSyncStatus | null | undefined): HealthSyncRouteResolution => {
  if (!status) return { connectionState:'UNKNOWN',destination:null,ctaLabel:'Checking…' };
  if (hasPersistedProviderIdentity(status.appleHealth) || hasPersistedProviderIdentity(status.healthConnect)) {
    return { connectionState:'CONNECTED',destination:'HealthDataSync',ctaLabel:'Sync' };
  }
  return { connectionState:'NEVER_CONNECTED',destination:'HealthDataSync',ctaLabel:'Connect' };
};
