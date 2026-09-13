import { HealthObservationDraft, WearableSyncPayload, WellnessSnapshot } from '../types';
import { mergeWellnessInputs } from '../utils/wellness';
import { apiFetch, postJson } from './apiClient';
import { getHealthPlatformAdapter, type HealthAppId } from './healthPlatformAdapter';
import { getHealthScoreSummary, HealthScoreSummary } from './healthIntelligenceService';
import { beginWearableSyncRun, commitWearableCheckpoint, finishWearableSyncRun, type GovernedProvider } from './wearablePlatformService';
import { buildHealthSourceDiagnostics, type HealthSourceMetricDiagnostic } from './healthSourceDiagnostics';
import { acknowledgeLocalObservations, persistLocalHealthPresentationObservations, persistLocalSyncBatch, readLocalSyncCursors,
  readPendingLocalObservations } from './healthSyncLocalStore';

export type HealthSyncConnectionState =
  | 'NOT_CONNECTED'
  | 'REQUESTING_PERMISSION'
  | 'CONNECTED'
  | 'PARTIAL'
  | 'NO_DATA'
  | 'ACTION_REQUIRED'
  | 'STALE'
  | 'REVOKED'
  | 'DENIED'
  | 'ERROR'
  | 'NOT_SUPPORTED'
  | 'INSUFFICIENT_DATA';

export type HealthSyncStatus = {
  fiteatsyClientId: string;
  overallStatus: HealthSyncConnectionState;
  lastSyncISO: string | null;
  latestMeasurementISO: string | null;
  recordsSynced: number;
  appleHealth: {
    connectionId?: string;
    connectionAuthority?: string;
    consentStatus?: string | null;
    status: HealthSyncConnectionState;
    freshness?: string;
    lastSuccessISO?: string | null;
    lastSyncISO: string | null;
    latestMeasurementISO: string | null;
    recordsSynced: number;
  };
  healthConnect: {
    connectionId?: string;
    connectionAuthority?: string;
    consentStatus?: string | null;
    status: HealthSyncConnectionState;
    freshness?: string;
    lastSuccessISO?: string | null;
    lastSyncISO: string | null;
    latestMeasurementISO: string | null;
    recordsSynced: number;
  };
  sources: Record<string, {
    recordsSynced: number;
    lastSyncISO: string | null;
    latestMeasurementISO: string | null;
  }>;
};

export type HealthSyncResult = {
  payload: WearableSyncPayload;
  observations: HealthObservationDraft[];
  accepted: number;
  duplicate: number;
  rejected: number;
  scores: HealthScoreSummary;
  status: HealthSyncStatus;
  wellness: WellnessSnapshot;
  diagnostics: HealthSourceMetricDiagnostic[];
};

export class HealthSyncUploadPendingError extends Error {
  payload: WearableSyncPayload;
  observations: HealthObservationDraft[];
  diagnostics: HealthSourceMetricDiagnostic[];

  constructor(payload: WearableSyncPayload, observations: HealthObservationDraft[]) {
    super('health_sync_upload_pending');
    this.payload = payload;
    this.observations = observations;
    this.diagnostics = buildHealthSourceDiagnostics(payload.provider === 'Apple Health' ? 'APPLE_HEALTH' : 'HEALTH_CONNECT', payload, { state: 'PENDING', errorClass: 'NETWORK_ERROR' });
  }
}

export class HealthSyncPostUploadRefreshError extends Error {
  payload: WearableSyncPayload;
  observations: HealthObservationDraft[];
  diagnostics: HealthSourceMetricDiagnostic[];

  constructor(payload: WearableSyncPayload, observations: HealthObservationDraft[]) {
    super('health_sync_post_upload_refresh_pending');
    this.payload = payload;
    this.observations = observations;
    this.diagnostics = buildHealthSourceDiagnostics(payload.provider === 'Apple Health' ? 'APPLE_HEALTH' : 'HEALTH_CONNECT', payload, { state: 'SUCCESS' });
  }
}

export const HEALTH_SYNC_PIPELINE_TIMEOUT_MS = 45_000;
// Keep rich observation payloads comfortably below Express' default 100 KB
// JSON body limit. First-sync heart-rate samples carry source metadata and can
// exceed that boundary when the previous 250-record chunk is used.
export const HEALTH_SYNC_UPLOAD_BATCH_SIZE = 50;
export const withHealthSyncPipelineTimeout = <T>(operation: Promise<T>, code: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(code)), HEALTH_SYNC_PIPELINE_TIMEOUT_MS);
    operation.then((value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); });
  });

export type HealthObservationDto = HealthObservationDraft & {
  id: string;
  fiteatsyClientId: string;
  createdAtISO: string;
};

const deriveObservations = (payload: WearableSyncPayload): HealthObservationDraft[] => payload.observations ?? [];
const scoreOrExisting = (value: number | null | undefined, existing: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : existing;

const positiveOrExisting = (value: number | null | undefined, existing: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : existing;

export const wellnessFromHealthScores = (
  previous: WellnessSnapshot,
  payload: Pick<WearableSyncPayload, 'metrics'> | null,
  scores: HealthScoreSummary
): WellnessSnapshot => {
  const metrics = payload?.metrics;
  const next = mergeWellnessInputs({
    ...previous,
    heartRateAvg: positiveOrExisting(metrics?.heartRateAvg, previous.heartRateAvg),
    sleepHours: positiveOrExisting(metrics?.sleepHours, previous.sleepHours),
    movementMinutes: positiveOrExisting(metrics?.movementMinutes, previous.movementMinutes),
    focusMinutes: positiveOrExisting(metrics?.focusMinutes, previous.focusMinutes),
    breathingMinutes: positiveOrExisting(metrics?.breathingMinutes, previous.breathingMinutes),
    hydrationLiters: positiveOrExisting(metrics?.hydrationLiters, previous.hydrationLiters),
    recoveryScore: scoreOrExisting(scores.recoveryScore, previous.recoveryScore),
    nourishmentScore: scoreOrExisting(scores.nourishmentScore ?? scores.nutritionScore, previous.nourishmentScore),
    wellnessScore: scoreOrExisting(scores.physicalWellnessIndex ?? scores.overallScore, previous.wellnessScore),
    stressScore: scores.stressResilienceScore == null
      ? (scores.calmScore == null ? previous.stressScore : Math.max(0, 100 - scores.calmScore))
      : Math.max(0, 100 - scores.stressResilienceScore)
  });

  return {
    ...next,
    recoveryScore: scoreOrExisting(scores.recoveryScore, next.recoveryScore),
    nourishmentScore: scoreOrExisting(scores.nourishmentScore ?? scores.nutritionScore, next.nourishmentScore),
    wellnessScore: scoreOrExisting(scores.physicalWellnessIndex ?? scores.overallScore, next.wellnessScore),
    stressScore: scores.stressResilienceScore == null
      ? (scores.calmScore == null ? next.stressScore : Math.max(0, 100 - scores.calmScore))
      : Math.max(0, 100 - scores.stressResilienceScore)
  };
};

export const getHealthSyncStatus = () => apiFetch<HealthSyncStatus>('/v1/health/sync/status');

export const getLatestHealthObservations = (limit = 10) =>
  apiFetch<{ total: number; limit: number; offset: number; items: HealthObservationDto[] }>(
    `/v1/health/observations?limit=${encodeURIComponent(String(limit))}`
  );

export type HealthSyncActivity = {
  id:string;
  provider:'APPLE_HEALTH'|'HEALTH_CONNECT';
  trigger:string;
  status:'RUNNING'|'SUCCESS'|'PARTIAL'|'FAILED';
  startedAtISO:string;
  completedAtISO:string|null;
  metricsUpdated:number;
  duplicatesSkipped:number;
  recordsDeleted:number;
  message:string|null;
};

export const getHealthSyncActivity = (limit = 10) =>
  apiFetch<{items:HealthSyncActivity[]}>(`/v1/health/sync-runs?limit=${encodeURIComponent(String(limit))}`);

export const runHealthSync = async (
  appId: HealthAppId,
  previousWellness: WellnessSnapshot,
  governed?: { connectionId: string; provider: GovernedProvider; trigger: 'INITIAL_CONNECT' | 'MANUAL' | 'FOREGROUND_RESUME' | 'BACKGROUND' | 'RETRY'; localScope?: string },
  options: { forceSourceBackfill?: boolean; localScope?: string } = {}
): Promise<HealthSyncResult> => {
  let run: Awaited<ReturnType<typeof beginWearableSyncRun>> | null = null;
  let payload: WearableSyncPayload | null = null;
  let observations: HealthObservationDraft[] = [];
  let uploadCompleted = false;
  try {
    // Local source access is the first I/O boundary. A backend checkpoint lookup
    // must never delay or prevent HealthKit / Health Connect from returning data.
    const localScope = options.localScope ?? governed?.localScope ?? governed?.connectionId ?? `ungoverned:${appId}`;
    const localCursors = await readLocalSyncCursors(localScope);
    const adapter = getHealthPlatformAdapter();
    if (adapter.appId !== appId) throw new Error('health_provider_not_available');
    payload = await withHealthSyncPipelineTimeout(
      adapter.queryAllSupportedMetrics(localCursors, { forceBackfill: options.forceSourceBackfill }),
      'health_sync_native_read_timeout'
    );
    observations = deriveObservations(payload);
    const anchors = (payload as WearableSyncPayload & { anchors?: Record<string,string> }).anchors ?? {};
    // Cursor advancement and normalized/tombstone persistence are one durable
    // local transaction and always precede every backend operation.
    await persistLocalSyncBatch(localScope, observations, anchors);
    await persistLocalHealthPresentationObservations(localScope, payload.presentationObservations ?? []);
    // Sync-run telemetry must not become a prerequisite for ingestion. The
    // observation endpoint independently enforces authenticated ownership and
    // active provider consent.
    run = governed ? await beginWearableSyncRun(governed.connectionId, governed.provider, governed.trigger).catch(() => null) : null;

    let accepted = 0, duplicate = 0, rejected = 0, updated = 0, deleted = 0;
    let pending = await readPendingLocalObservations(localScope, HEALTH_SYNC_UPLOAD_BATCH_SIZE);
    while (pending.length) {
      const ingest = await withHealthSyncPipelineTimeout(postJson<{ accepted: number; duplicate: number; rejected: number; updated: number; deleted: number }>(
        '/v1/health/observations:batch', {
          observations: pending.map((item) => item.observation),
          recalculateIntelligence: false
        }), 'health_sync_upload_timeout');
      accepted += ingest.accepted; duplicate += ingest.duplicate; rejected += ingest.rejected;
      updated += ingest.updated ?? 0; deleted += ingest.deleted ?? 0;
      if (ingest.rejected > 0) break;
      await acknowledgeLocalObservations(localScope, pending.map((item) => item.recordKey));
      pending = await readPendingLocalObservations(localScope, HEALTH_SYNC_UPLOAD_BATCH_SIZE);
    }
    uploadCompleted = rejected === 0 && pending.length === 0;
    if (governed && Object.keys(anchors).length && rejected === 0) {
      await withHealthSyncPipelineTimeout(Promise.all(Object.entries(anchors).map(([metricScope, checkpoint]) =>
        commitWearableCheckpoint({ connectionId:governed.connectionId,provider:governed.provider,metricScope,
          ...(governed.provider === 'HEALTH_CONNECT' ? { cursorValue: checkpoint } : { anchorValue: checkpoint }),
          backfillComplete:true }))), 'health_sync_checkpoint_commit_timeout').catch(() => undefined);
    }
    if (run) await finishWearableSyncRun(run.id, { status: rejected ? 'PARTIAL' : 'SUCCESS', recordsRead: observations.length,
      recordsUploaded: observations.length, recordsInserted: accepted, recordsDuplicates: duplicate, recordsUpdated: updated, recordsDeleted: deleted,
      checkpointAfter: rejected === 0 ? anchors : undefined }).catch(() => undefined);

    if (payload.dataQuality.syncCounts) {
      payload.dataQuality.syncCounts.uploadRecordCount = observations.length;
      payload.dataQuality.syncCounts.persistedRecordCount = accepted + duplicate + updated;
    }

    const [scores, status] = await Promise.all([getHealthScoreSummary(), getHealthSyncStatus()]);
    return { payload, observations, accepted, duplicate, rejected, scores, status,
      diagnostics: buildHealthSourceDiagnostics(appId === 'apple-health' ? 'APPLE_HEALTH' : 'HEALTH_CONNECT', payload, { state: 'SUCCESS' }),
      wellness: wellnessFromHealthScores(previousWellness, payload, scores) };
  } catch (error) {
    if (run) await finishWearableSyncRun(run.id, { status:'FAILED',recordsRead:0,recordsUploaded:0,recordsInserted:0,
      recordsDuplicates:0,recordsUpdated:0,recordsDeleted:0,errorStage:'SYNC',errorCode:error instanceof Error ? error.message.slice(0,100) : 'UNKNOWN',
      safeErrorSummary:'Wearable synchronization could not complete.' }).catch(() => undefined);
    // The native read and durable local write have already succeeded. Any later
    // failure belongs to the upload/backend plane and must not erase readable
    // device data or turn the provider into a disconnected state.
    if (payload && uploadCompleted) throw new HealthSyncPostUploadRefreshError(payload, observations);
    if (payload) throw new HealthSyncUploadPendingError(payload, observations);
    throw error;
  }
};
