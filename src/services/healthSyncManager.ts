import { HealthObservationDraft, WearableSyncPayload, WellnessSnapshot } from '../types';
import { recalculateWellness } from '../utils/wellness';
import { apiFetch, postJson } from './apiClient';
import { HealthAppId, syncConnectedHealthApp } from './healthAppService';
import { getHealthScoreSummary, HealthScoreSummary } from './healthIntelligenceService';
import { beginWearableSyncRun, commitWearableCheckpoint, finishWearableSyncRun, getWearableCheckpoints, type GovernedProvider } from './wearablePlatformService';

export type HealthSyncConnectionState =
  | 'NOT_CONNECTED'
  | 'REQUESTING_PERMISSION'
  | 'CONNECTED'
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
    status: HealthSyncConnectionState;
    freshness?: string;
    lastSuccessISO?: string | null;
    lastSyncISO: string | null;
    latestMeasurementISO: string | null;
    recordsSynced: number;
  };
  healthConnect: {
    connectionId?: string;
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
};

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
  const next = recalculateWellness({
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
  governed?: { connectionId: string; provider: GovernedProvider; trigger: 'INITIAL_CONNECT' | 'MANUAL' | 'FOREGROUND_RESUME' | 'BACKGROUND' | 'RETRY' }
): Promise<HealthSyncResult> => {
  const run = governed ? await beginWearableSyncRun(governed.connectionId, governed.provider, governed.trigger) : null;
  try {
    const checkpoints = governed ? await getWearableCheckpoints(governed.connectionId) : { items: [] };
    const providerCursors = Object.fromEntries(checkpoints.items.map((item) => [item.metricScope, item.anchorValue ?? item.cursorValue ?? '']));
    const payload = await syncConnectedHealthApp(appId, providerCursors);
    const observations = deriveObservations(payload);

    let accepted = 0, duplicate = 0, rejected = 0, updated = 0, deleted = 0;
    for (let offset = 0; offset < observations.length; offset += 500) {
      const ingest = await postJson<{ accepted: number; duplicate: number; rejected: number; updated: number; deleted: number }>(
        '/v1/health/observations:batch', { observations: observations.slice(offset, offset + 500) });
      accepted += ingest.accepted; duplicate += ingest.duplicate; rejected += ingest.rejected;
      updated += ingest.updated ?? 0; deleted += ingest.deleted ?? 0;
    }
    if (run) await finishWearableSyncRun(run.id, { status: rejected ? 'PARTIAL' : 'SUCCESS', recordsRead: observations.length,
      recordsUploaded: observations.length, recordsInserted: accepted, recordsDuplicates: duplicate, recordsUpdated: updated, recordsDeleted: deleted });
    const anchors = (payload as WearableSyncPayload & { anchors?: Record<string,string> }).anchors;
    if (governed && anchors) await Promise.all(Object.entries(anchors).map(([metricScope, checkpoint]) =>
      commitWearableCheckpoint({ connectionId:governed.connectionId,provider:governed.provider,metricScope,
        ...(governed.provider === 'HEALTH_CONNECT' ? { cursorValue: checkpoint } : { anchorValue: checkpoint }),
        backfillComplete:true })));

    const [scores, status] = await Promise.all([getHealthScoreSummary(), getHealthSyncStatus()]);
    return { payload, observations, accepted, duplicate, rejected, scores, status,
      wellness: wellnessFromHealthScores(previousWellness, payload, scores) };
  } catch (error) {
    if (run) await finishWearableSyncRun(run.id, { status:'FAILED',recordsRead:0,recordsUploaded:0,recordsInserted:0,
      recordsDuplicates:0,recordsUpdated:0,recordsDeleted:0,errorStage:'SYNC',errorCode:error instanceof Error ? error.message.slice(0,100) : 'UNKNOWN',
      safeErrorSummary:'Wearable synchronization could not complete.' }).catch(() => undefined);
    throw error;
  }
};
