import { apiFetch, postJson } from './apiClient';

export type GovernedProvider = 'APPLE_HEALTH' | 'HEALTH_CONNECT';
export type ConnectionStatus = 'CONNECTED' | 'PARTIAL' | 'PERMISSION_REQUIRED' | 'REVOKED' | 'UNAVAILABLE' | 'ERROR';
export const WEARABLE_CONSENT_VERSION = 'wearable-health-v1';
export const WEARABLE_PURPOSE_VERSION = 'personalised-health-insights-v1';
export const WEARABLE_PURPOSES = ['personalised_health_insights','activity_recovery_tracking','sleep_heart_trends','consultant_context'];

export const acceptWearableConsent = (provider: GovernedProvider, requestedScopes: string[]) =>
  postJson<{ id: string; provider: GovernedProvider; status: 'ACTIVE'; acceptedAt: string }>('/v1/health/wearable-consents', {
    provider, consentVersion: WEARABLE_CONSENT_VERSION, purposeVersion: WEARABLE_PURPOSE_VERSION,
    requestedScopes, acknowledgedPurposes: WEARABLE_PURPOSES
  });

export const reconcileWearableConnection = (input: {
  provider: GovernedProvider; platform: 'IOS' | 'ANDROID'; installationId: string;
  status: ConnectionStatus; grantedScopes: string[]; backgroundSyncEnabled?: boolean;
}) => apiFetch<{ id: string; provider: GovernedProvider; status: ConnectionStatus; grantedScopes: string[] }>('/v1/health/wearable-connection', {
  method: 'PUT', body: JSON.stringify(input)
});

export const beginWearableSyncRun = (connectionId: string, provider: GovernedProvider,
  trigger: 'INITIAL_CONNECT' | 'MANUAL' | 'FOREGROUND_RESUME' | 'BACKGROUND' | 'RETRY') =>
  postJson<{ id: string; status: 'RUNNING'; startedAt: string }>('/v1/health/sync-runs', { connectionId, provider, trigger });

export const finishWearableSyncRun = (runId: string, result: Record<string, unknown>) =>
  apiFetch(`/v1/health/sync-runs/${encodeURIComponent(runId)}`, { method: 'PATCH', body: JSON.stringify(result) });

export const commitWearableCheckpoint = (checkpoint: Record<string, unknown>) =>
  apiFetch('/v1/health/sync-checkpoints', { method: 'PUT', body: JSON.stringify(checkpoint) });

export const getWearableCheckpoints = (connectionId: string) => apiFetch<{ items: Array<{ metricScope:string;cursorValue?:string;anchorValue?:string }> }>(
  `/v1/health/sync-checkpoints/${encodeURIComponent(connectionId)}`);

export const withdrawWearableConsent = (provider: GovernedProvider) =>
  apiFetch(`/v1/health/wearable-consents/${provider}`, { method: 'DELETE' });
