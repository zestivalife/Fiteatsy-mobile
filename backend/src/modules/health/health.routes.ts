import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import {
  HealthObservationRecord,
  countHealthObservations,
  ingestHealthObservations,
  listHealthObservations
} from './health-observations.repository.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';
import { calculateHealthScores } from '../intelligence/health-calculation-engine.js';
import {
  acceptWearableConsent, commitWearableCheckpoint, completeWearableSyncRun,
  getActiveWearableConsent, listWearableConnections, listWearableCheckpoints, listWearableSyncRuns, startWearableSyncRun,
  resolveWearableProviderAuthority, upsertWearableConnection, withdrawWearableConsent, type WearableProvider
} from './wearable-platform.repository.js';

const observationSchema = z.object({
  metricType: z.string().trim().min(1).max(80),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(40),
  measuredAtISO: z.string().datetime(),
  sourceProvider: z.string().trim().min(1).max(80),
  sourceRecordId: z.string().trim().max(180).optional(),
  syncKey: z.string().trim().max(220).optional(),
  qualityStatus: z.enum(['accepted', 'estimated']).optional(),
  sourceMetadata: z.object({
    recordType: z.string().trim().max(80).optional(),
    sourceApplication: z.string().trim().max(180).optional(),
    startAtISO: z.string().datetime().optional(),
    endAtISO: z.string().datetime().optional(),
    originalValue: z.number().finite().optional(),
    originalUnit: z.string().trim().max(40).optional(),
    device: z.object({
      manufacturer: z.string().trim().max(120).optional(),
      model: z.string().trim().max(120).optional(),
      type: z.number().int().optional()
    }).optional(),
    recordingMethod: z.number().int().optional(),
    sleepStage: z.string().trim().max(40).optional(),
    measurementMethod: z.string().trim().max(40).optional()
  }).strict().optional()
  ,startAtISO: z.string().datetime().nullable().optional()
  ,endAtISO: z.string().datetime().nullable().optional()
  ,timezoneOffsetMinutes: z.number().int().min(-840).max(840).nullable().optional()
  ,providerUpdatedAtISO: z.string().datetime().nullable().optional()
  ,providerVersion: z.string().trim().max(120).nullable().optional()
  ,deleted: z.boolean().optional()
});

const metricUnits: Record<string, ReadonlySet<string>> = {
  steps: new Set(['count']),
  sleep_minutes: new Set(['min']),
  resting_heart_rate: new Set(['bpm']),
  hrv_ms: new Set(['ms']),
  hrv_sdnn_ms: new Set(['ms']),
  hrv_rmssd_ms: new Set(['ms']),
  workout_minutes: new Set(['min']),
  active_minutes: new Set(['min']),
  active_energy: new Set(['kcal']),
  weight: new Set(['kg']),
  distance: new Set(['m']),
  hydration_ml: new Set(['ml']),
  stress_score: new Set(['score']),
  mindfulness_minutes: new Set(['min'])
  ,sleep_stage: new Set(['min'])
  ,heart_rate: new Set(['bpm'])
  ,spo2: new Set(['pct'])
  ,respiratory_rate: new Set(['brpm'])
  ,provider_record_deletion: new Set(['deleted'])
};

const validateObservation = (observation: z.infer<typeof observationSchema>) => {
  const allowedUnits = metricUnits[observation.metricType];
  if (!allowedUnits) return 'UNSUPPORTED_METRIC';
  if (observation.deleted) return observation.sourceRecordId ? null : 'DELETION_REQUIRES_SOURCE_RECORD_ID';
  if (!allowedUnits.has(observation.unit)) return 'INVALID_UNIT';
  if (observation.value <= 0) return 'INVALID_VALUE';
  const measuredAt = Date.parse(observation.measuredAtISO);
  if (measuredAt > Date.now() + 5 * 60_000) return 'FUTURE_TIMESTAMP';
  const startAt = observation.sourceMetadata?.startAtISO ? Date.parse(observation.sourceMetadata.startAtISO) : null;
  const endAt = observation.sourceMetadata?.endAtISO ? Date.parse(observation.sourceMetadata.endAtISO) : null;
  if (startAt != null && endAt != null && endAt < startAt) return 'INVALID_INTERVAL';
  return null;
};

const batchSchema = z.object({
  observations: z.array(observationSchema).min(1).max(1000)
});

export const healthRouter = Router();

const currentOwner = (account: ReturnType<typeof getAuthenticatedAccount>): ClientOwnershipContext => ({
  accountId: account.accountId,
  clientId: account.client.id
});

const toObservationDto = (observation: HealthObservationRecord, fiteatsyClientId: string) => ({
  id: observation.id,
  fiteatsyClientId,
  metricType: observation.metricType,
  value: observation.value,
  unit: observation.unit,
  measuredAtISO: observation.measuredAtISO,
  sourceProvider: observation.sourceProvider,
  sourceRecordId: observation.sourceRecordId,
  syncKey: observation.syncKey,
  qualityStatus: observation.qualityStatus,
  createdAtISO: observation.createdAtISO,
  sourceMetadata: observation.sourceMetadata
  ,startAtISO: observation.startAtISO
  ,endAtISO: observation.endAtISO
  ,timezoneOffsetMinutes: observation.timezoneOffsetMinutes
  ,providerUpdatedAtISO: observation.providerUpdatedAtISO
  ,providerVersion: observation.providerVersion
});

const freshness = (iso: string | null) => {
  if (!iso) return 'NO_DATA';
  const age = Date.now() - Date.parse(iso);
  return age <= 36 * 60 * 60_000 ? 'FRESH' : age <= 7 * 86_400_000 ? 'STALE' : 'VERY_STALE';
};

healthRouter.use(requireAuthenticatedAccount);

const providerSchema = z.enum(['APPLE_HEALTH', 'HEALTH_CONNECT']);
const connectionSchema = z.object({
  provider: providerSchema,
  platform: z.enum(['IOS', 'ANDROID']),
  installationId: z.string().trim().min(8).max(180),
  status: z.enum(['CONNECTED','PARTIAL','PERMISSION_REQUIRED','REVOKED','UNAVAILABLE','ERROR']),
  grantedScopes: z.array(z.string().trim().min(1).max(100)).max(40),
  backgroundSyncEnabled: z.boolean().optional()
});

healthRouter.post('/wearable-consents', async (req, res) => {
  const parsed = z.object({ provider: providerSchema, consentVersion: z.string().min(1).max(40),
    purposeVersion: z.string().min(1).max(40), requestedScopes: z.array(z.string()).max(40),
    acknowledgedPurposes: z.array(z.string()).min(1).max(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_WEARABLE_CONSENT', details: parsed.error.flatten() });
  const owner = currentOwner(getAuthenticatedAccount(req));
  const consent = await acceptWearableConsent(owner, { ...parsed.data, purposes: parsed.data.acknowledgedPurposes });
  return res.status(201).json({ id: consent.id, provider: consent.provider, status: consent.status, acceptedAt: consent.accepted_at });
});

healthRouter.put('/wearable-connection', async (req, res) => {
  const parsed = connectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_WEARABLE_CONNECTION', details: parsed.error.flatten() });
  const owner = currentOwner(getAuthenticatedAccount(req));
  const consent = await getActiveWearableConsent(owner, parsed.data.provider);
  if (!consent) return res.status(403).json({ error: 'ACTIVE_WEARABLE_CONSENT_REQUIRED' });
  const connection = await upsertWearableConnection(owner, { consentId: consent.id, ...parsed.data });
  return res.status(200).json({ id: connection.id, provider: connection.provider, status: connection.status,
    grantedScopes: connection.granted_scopes, lastPermissionCheckAt: connection.last_permission_check_at });
});

healthRouter.post('/sync-runs', async (req, res) => {
  const parsed = z.object({ connectionId: z.string().min(1), provider: providerSchema,
    trigger: z.enum(['INITIAL_CONNECT','MANUAL','FOREGROUND_RESUME','BACKGROUND','RETRY']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_SYNC_RUN', details: parsed.error.flatten() });
  const run = await startWearableSyncRun(currentOwner(getAuthenticatedAccount(req)), parsed.data.connectionId,
    parsed.data.provider, parsed.data.trigger);
  return run ? res.status(201).json({ id: run.id, status: run.status, startedAt: run.started_at })
    : res.status(403).json({ error: 'ACTIVE_CONSENT_AND_CONNECTION_REQUIRED' });
});

healthRouter.patch('/sync-runs/:runId', async (req, res) => {
  const parsed = z.object({ status: z.enum(['SUCCESS','PARTIAL','FAILED']), recordsRead: z.number().int().nonnegative(),
    recordsUploaded: z.number().int().nonnegative(), recordsInserted: z.number().int().nonnegative(),
    recordsDuplicates: z.number().int().nonnegative(), recordsUpdated: z.number().int().nonnegative(),
    recordsDeleted: z.number().int().nonnegative(), errorStage: z.string().max(80).optional(),
    errorCode: z.string().max(100).optional(), safeErrorSummary: z.string().max(300).optional(), checkpointAfter: z.unknown().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_SYNC_RUN_RESULT', details: parsed.error.flatten() });
  const run = await completeWearableSyncRun(currentOwner(getAuthenticatedAccount(req)), req.params.runId, parsed.data);
  return run ? res.status(200).json({ id: run.id, status: run.status, completedAt: run.completed_at })
    : res.status(404).json({ error: 'SYNC_RUN_NOT_FOUND' });
});

healthRouter.put('/sync-checkpoints', async (req, res) => {
  const parsed = z.object({ connectionId: z.string().min(1), provider: providerSchema, metricScope: z.string().min(1).max(100),
    cursorValue: z.string().max(8000).optional(), anchorValue: z.string().max(8000).optional(), backfillComplete: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_SYNC_CHECKPOINT', details: parsed.error.flatten() });
  const checkpoint = await commitWearableCheckpoint(currentOwner(getAuthenticatedAccount(req)), parsed.data);
  return checkpoint ? res.status(200).json({ metricScope: checkpoint.metric_scope, committedAt: checkpoint.committed_at })
    : res.status(404).json({ error: 'CONNECTION_NOT_FOUND' });
});

healthRouter.get('/sync-checkpoints/:connectionId', async (req, res) => {
  const items = await listWearableCheckpoints(currentOwner(getAuthenticatedAccount(req)), req.params.connectionId);
  return res.status(200).json({ items: items.map((item) => ({ metricScope:item.metric_scope,cursorValue:item.cursor_value,
    anchorValue:item.anchor_value,backfillCompletedAt:item.backfill_completed_at,committedAt:item.committed_at })) });
});

healthRouter.get('/sync-runs', async (req, res) => {
  const limit = Math.max(1, Math.min(25, Number(req.query.limit || 10)));
  const items = await listWearableSyncRuns(currentOwner(getAuthenticatedAccount(req)), limit);
  return res.status(200).json({ items: items.map((item) => ({
    id:item.id,provider:item.provider,trigger:item.trigger,status:item.status,
    startedAtISO:new Date(item.started_at).toISOString(),
    completedAtISO:item.completed_at ? new Date(item.completed_at).toISOString() : null,
    metricsUpdated:Number(item.records_inserted ?? 0)+Number(item.records_updated ?? 0),
    duplicatesSkipped:Number(item.records_duplicates ?? 0),recordsDeleted:Number(item.records_deleted ?? 0),
    message:item.safe_error_summary ?? null
  })) });
});

healthRouter.delete('/wearable-consents/:provider', async (req, res) => {
  const provider = providerSchema.safeParse(req.params.provider);
  if (!provider.success) return res.status(400).json({ error: 'INVALID_PROVIDER' });
  await withdrawWearableConsent(currentOwner(getAuthenticatedAccount(req)), provider.data);
  return res.status(204).end();
});

healthRouter.post('/observations:batch', async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_OBSERVATION_BATCH',
      details: parsed.error.flatten()
    });
  }

  const account = getAuthenticatedAccount(req);
  const owner = currentOwner(account);
  const invalid = parsed.data.observations
    .map((observation, index) => ({ index, reason: validateObservation(observation) }))
    .filter((item) => item.reason != null);
  if (invalid.length) {
    return res.status(400).json({ error: 'INVALID_HEALTH_OBSERVATION', details: invalid });
  }
  const providers = [...new Set(parsed.data.observations.map((item) => item.sourceProvider))];
  for (const provider of providers) {
    const governed = ['apple_health','apple-health'].includes(provider) ? 'APPLE_HEALTH'
      : ['health_connect','health-connect','google_health_connect'].includes(provider) ? 'HEALTH_CONNECT' : null;
    if (governed && !(await getActiveWearableConsent(owner, governed))) {
      return res.status(403).json({ error: 'ACTIVE_WEARABLE_CONSENT_REQUIRED', provider: governed });
    }
  }
  const result = await ingestHealthObservations(owner, parsed.data.observations);
  const scores = await calculateHealthScores(owner);
  return res.status(200).json({
    accepted: result.accepted.length,
    duplicate: result.duplicate.length,
    rejected: result.rejected.length,
    updated: result.updated,
    deleted: result.deleted,
    items: result.accepted.map((item) => toObservationDto(item, account.client.fiteatsyClientId)),
    duplicates: result.duplicate,
    rejections: result.rejected,
    intelligence: {
      recalculated: true,
      scores: scores.map((score) => ({
        scoreType: score.scoreType,
        scoreValue: score.scoreValue,
        scoreStatus: score.scoreStatus,
        confidence: score.confidence,
        calculatedAtISO: score.calculatedAtISO
      }))
    }
  });
});

healthRouter.get('/sync/status', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const owner = currentOwner(account);
  const observations = await listHealthObservations(owner, { limit: 1000, offset: 0 });
  const bySource = observations.reduce<Record<string, {
    recordsSynced: number;
    lastSyncISO: string | null;
    latestMeasurementISO: string | null;
  }>>((acc, observation) => {
    const current = acc[observation.sourceProvider] ?? {
      recordsSynced: 0,
      lastSyncISO: null,
      latestMeasurementISO: null
    };
    current.recordsSynced += 1;
    if (!current.lastSyncISO || observation.createdAtISO > current.lastSyncISO) {
      current.lastSyncISO = observation.createdAtISO;
    }
    if (!current.latestMeasurementISO || observation.measuredAtISO > current.latestMeasurementISO) {
      current.latestMeasurementISO = observation.measuredAtISO;
    }
    acc[observation.sourceProvider] = current;
    return acc;
  }, {});

  const connections = await listWearableConnections(owner);
  const authorities = Object.fromEntries(await Promise.all((['APPLE_HEALTH','HEALTH_CONNECT'] as WearableProvider[])
    .map(async (provider) => [provider, await resolveWearableProviderAuthority(owner, provider)])));
  const statusFor = (provider: WearableProvider, ...sources: string[]) => {
    const connection = connections.find((item) => item.provider === provider);
    const authority = authorities[provider];
    const sourceStatus = sources
      .map((source) => bySource[source])
      .find((candidate) => candidate != null);
    if (!connection) {
      if (authority.decision !== 'WITHDRAWN' && sourceStatus) {
        return { status:'CONNECTED', connectionAuthority:'OBSERVATION_INFERRED', consentStatus:authority.consentStatus,
          currentOsPermissionVerified:false, freshness:freshness(sourceStatus.latestMeasurementISO), ...sourceStatus };
      }
      return {
        status: authority.decision === 'WITHDRAWN' ? 'REVOKED' : 'NOT_CONNECTED',
        connectionAuthority: authority.decision,
        consentStatus: authority.consentStatus,
        currentOsPermissionVerified: false,
        lastSyncISO: null,
        latestMeasurementISO: null,
        recordsSynced: 0
      };
    }
    return {
      connectionId: connection.id,
      status: connection.consent_status === 'ACTIVE' ? connection.status : 'REVOKED',
      connectionAuthority: 'DURABLE_CONNECTION',
      currentOsPermissionVerified: connection.status === 'CONNECTED' || connection.status === 'PARTIAL',
      consentStatus: connection.consent_status,
      grantedScopes: connection.granted_scopes,
      lastAttemptISO: connection.last_sync_attempt_at,
      lastSuccessISO: connection.last_successful_sync_at,
      backgroundSyncEnabled: connection.background_sync_enabled,
      lastErrorCode: connection.last_error_code,
      freshness: freshness(sourceStatus?.latestMeasurementISO ?? null),
      ...(sourceStatus ?? { lastSyncISO: null, latestMeasurementISO: null, recordsSynced: 0 })
    };
  };

  const appleHealth = statusFor('APPLE_HEALTH','apple_health', 'apple-health');
  const healthConnect = statusFor('HEALTH_CONNECT','health_connect', 'health-connect', 'google_health_connect');

  return res.status(200).json({
    fiteatsyClientId: account.client.fiteatsyClientId,
    overallStatus: [appleHealth.status, healthConnect.status].some((status) => status === 'CONNECTED' || status === 'PARTIAL')
      ? 'CONNECTED' : 'NOT_CONNECTED',
    lastSyncISO: observations.reduce<string | null>((latest, observation) => (
      latest == null || observation.createdAtISO > latest ? observation.createdAtISO : latest
    ), null),
    latestMeasurementISO: observations[0]?.measuredAtISO ?? null,
    recordsSynced: observations.length,
    appleHealth,
    healthConnect,
    sources: bySource
  });
});

healthRouter.get('/observations', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const owner = currentOwner(account);
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const metricType = typeof req.query.metricType === 'string' && req.query.metricType.trim() ? req.query.metricType.trim() : undefined;
  const [items, total] = await Promise.all([
    listHealthObservations(owner, { metricType, limit, offset }),
    countHealthObservations(owner, metricType)
  ]);
  return res.status(200).json({
    total,
    limit,
    offset,
    items: items.map((item) => toObservationDto(item, account.client.fiteatsyClientId))
  });
});

healthRouter.get('/aggregates', async (req, res) => {
  const account = getAuthenticatedAccount(req); const owner = currentOwner(account);
  const days = Math.max(1, Math.min(90, Number(req.query.days || 30)));
  const result = await (await import('../../db/pool.js')).pool.query(
    `select metric_type,
      date(measured_at + make_interval(mins => coalesce(timezone_offset_minutes,0))) as local_day,
      case when metric_type in ('steps','sleep_minutes','workout_minutes','active_minutes','active_energy','distance','hydration_ml')
        then sum(value) else avg(value) end as value,
      min(unit) as unit,max(measured_at) as latest_measurement,array_agg(distinct source_provider) as sources
     from health_observations where user_id=$1 and client_id=$2 and deleted_at is null
       and quality_status in ('accepted','estimated') and measured_at >= now() - make_interval(days => $3)
     group by metric_type,local_day order by local_day desc,metric_type`, [owner.accountId,owner.clientId,days]);
  return res.status(200).json({ days, items: result.rows.map((row) => ({ metricType:row.metric_type,
    localDay:String(row.local_day).slice(0,10),value:Number(row.value),unit:row.unit,
    latestMeasurementISO:new Date(row.latest_measurement).toISOString(),sources:row.sources })) });
});
