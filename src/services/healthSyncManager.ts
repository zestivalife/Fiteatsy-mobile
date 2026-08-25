import { HealthObservationDraft, WearableSyncPayload, WellnessSnapshot } from '../types';
import { recalculateWellness } from '../utils/wellness';
import { apiFetch, postJson } from './apiClient';
import { HealthAppId, syncConnectedHealthApp } from './healthAppService';
import { getHealthScoreSummary, HealthScoreSummary } from './healthIntelligenceService';

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
  recordsSynced: number;
  appleHealth: {
    status: HealthSyncConnectionState;
    lastSyncISO: string | null;
    recordsSynced: number;
  };
  healthConnect: {
    status: HealthSyncConnectionState;
    lastSyncISO: string | null;
    recordsSynced: number;
  };
  sources: Record<string, { recordsSynced: number; lastSyncISO: string | null }>;
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

export const runHealthSync = async (
  appId: HealthAppId,
  previousWellness: WellnessSnapshot
): Promise<HealthSyncResult> => {
  const payload = await syncConnectedHealthApp(appId);
  const observations = deriveObservations(payload);

  if (observations.length === 0) {
    throw new Error('INSUFFICIENT_DATA');
  }

  const ingest = await postJson<{
    accepted: number;
    duplicate: number;
    rejected: number;
  }>('/v1/health/observations:batch', {
    observations
  });

  const [scores, status] = await Promise.all([
    getHealthScoreSummary(),
    getHealthSyncStatus()
  ]);

  return {
    payload,
    observations,
    accepted: ingest.accepted,
    duplicate: ingest.duplicate,
    rejected: ingest.rejected,
    scores,
    status,
    wellness: wellnessFromHealthScores(previousWellness, payload, scores)
  };
};
