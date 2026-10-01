import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { HealthKitActivitySummary } from '../../modules/fiteatsy-healthkit';
import { apiFetch, postJson } from './apiClient';
import type { CanonicalHealthMetricState } from './canonicalHealthSyncCoordinator';
import type { HealthSourceMetricDiagnostic } from './healthSourceDiagnostics';
import type { HealthSyncLifecycleTimestamps } from './healthSyncLocalStore';

export type DiagnosticSyncRequest = {
  id: string;
  requested_metrics: string[];
  status: 'PENDING' | 'ACKNOWLEDGED' | 'RUNNING';
};

export type DiagnosticWorkoutSummary = {
  count: number;
  latestAtISO: string | null;
  activityType: number | string | null;
  durationSeconds: number | null;
  energyKcal: number | null;
  distanceMeters: number | null;
  source: string | null;
};

const appVersion = Constants.expoConfig?.version;
const buildNumber = Constants.expoConfig?.ios?.buildNumber;
const mobileCommitSha = process.env.EXPO_PUBLIC_GIT_COMMIT_SHA?.trim() || undefined;

const permissionState = (metric: CanonicalHealthMetricState) => {
  if (!metric.supported) return 'UNSUPPORTED' as const;
  if (metric.queryState === 'PERMISSION_DENIED') return 'DENIED' as const;
  if (metric.queryState === 'IDLE' || metric.queryState === 'REQUESTING_PERMISSION') return 'NOT_DETERMINED' as const;
  return 'GRANTED' as const;
};

const terminalState = (metric: CanonicalHealthMetricState) => {
  if (metric.queryState === 'COMPLETED') return 'SUCCESS' as const;
  if (metric.queryState === 'READING' || metric.queryState === 'NORMALIZING' || metric.queryState === 'PERSISTING' || metric.queryState === 'AGGREGATING') return 'RUNNING' as const;
  if (metric.queryState === 'NO_DATA' || metric.queryState === 'PERMISSION_DENIED' || metric.queryState === 'UNSUPPORTED' || metric.queryState === 'FAILED') return metric.queryState;
  return 'IDLE' as const;
};

const uploadState = (metric: CanonicalHealthMetricState) => {
  if (metric.uploadState === 'SYNCED') return 'SUCCESS' as const;
  if (metric.uploadState === 'UPLOADING') return 'RUNNING' as const;
  if (metric.uploadState === 'PENDING') return 'PENDING' as const;
  if (metric.uploadState === 'ERROR') return 'FAILED' as const;
  return 'NOT_REQUIRED' as const;
};

export const reportHealthSyncDiagnosticSnapshot = async (input: {
  connectionId: string;
  metrics: CanonicalHealthMetricState[];
  diagnostics: HealthSourceMetricDiagnostic[];
  lifecycle: HealthSyncLifecycleTimestamps;
  pendingCount: number;
  healthKitAvailable: boolean;
  activitySummary: HealthKitActivitySummary | null;
  workoutSummary: DiagnosticWorkoutSummary | null;
}) => postJson('/internal/health-sync/mobile/heartbeat', {
  connectionId: input.connectionId,
  appVersion,
  buildNumber,
  mobileCommitSha,
  deviceLabel: Platform.OS === 'ios' ? 'iPhone' : 'Android device',
  osVersion: String(Platform.Version),
  healthKitAvailable: input.healthKitAvailable,
  pendingCount: input.pendingCount,
  failedCount: 0,
  quarantinedCount: 0,
  persistedDocumentBytes: 0,
  nativeHeartbeat: input.diagnostics.some((item) => item.queryExecuted),
  localPersisted: Boolean(input.lifecycle.lastSavedAtISO),
  uploaded: Boolean(input.lifecycle.lastUploadedAtISO),
  activitySummary: input.activitySummary,
  workoutSummary: input.workoutSummary,
  metrics: input.metrics.map((metric) => {
    const diagnostic = input.diagnostics.find((item) => item.metricKey === metric.definition.metricKey);
    return {
      metricType: metric.definition.metricKey,
      supported: metric.supported,
      permissionState: permissionState(metric),
      nativeRecordCount: diagnostic?.nativeRecordCount ?? 0,
      localRecordCount: diagnostic?.localRecordCount ?? metric.localRecordCount,
      terminalState: terminalState(metric),
      uploadState: uploadState(metric),
      latestNativeAt: diagnostic?.latestLocalTimestamp ?? undefined,
      latestLocalAt: metric.observation?.measuredAtISO,
      nativeReadAt: input.lifecycle.lastHealthReadAtISO ?? undefined,
      localPersistAt: input.lifecycle.lastSavedAtISO ?? undefined,
      backendPersistAt: input.lifecycle.lastUploadedAtISO ?? undefined,
      displayReadyAt: metric.observation ? input.lifecycle.lastSavedAtISO ?? undefined : undefined,
      sourceOrigin: diagnostic?.healthSourceIdentifier ?? undefined,
      safeErrorCode: metric.errorClass ?? undefined
    };
  })
});

export const getPendingDiagnosticSyncRequests = (connectionId: string) =>
  apiFetch<{ items: DiagnosticSyncRequest[] }>(`/internal/health-sync/mobile/requests?connectionId=${encodeURIComponent(connectionId)}`);

export const reportDiagnosticSyncProgress = (
  requestId: string,
  body: { connectionId: string; status: string; eventType: string; metric?: string; safeMetadata?: Record<string, string | number | boolean | null> }
) => postJson(`/internal/health-sync/mobile/requests/${encodeURIComponent(requestId)}/progress`, body);
