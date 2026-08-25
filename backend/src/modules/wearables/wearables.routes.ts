import { Router } from 'express';
import { z } from 'zod';
import {
  buildLiveSyncPayload,
  connectHealthApp,
  getHealthApps,
} from './wearables.service.js';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { ingestHealthObservations, listHealthObservations } from '../health/health-observations.repository.js';

const wearableSyncSchema = z.object({
  deviceId: z.string().min(1),
  brand: z.enum(['Apple', 'Samsung', 'Xiaomi', 'Amazfit', 'GoBOLT', 'Other']),
  model: z.string().min(1)
});

const healthAppConnectSchema = z.object({
  appId: z.enum(['apple-health', 'health-connect', 'google-fit', 'samsung-health', 'fitbit']),
  platform: z.enum(['ios', 'android'])
});

const healthRecordSchema = z.object({
  type: z.enum([
    'steps',
    'sleep_minutes',
    'resting_heart_rate',
    'hydration_ml',
    'active_minutes',
    'mindfulness_minutes',
    'hrv_ms',
    'calories_kcal',
    'workout_minutes',
    'stress_score',
    'cycle_day',
    'spo2_pct',
    'respiratory_rate_brpm'
  ]),
  value: z.number().finite(),
  recordedAtISO: z.string().datetime()
});

const ingestSchema = z.object({
  appId: z.enum(['apple-health', 'health-connect', 'google-fit', 'samsung-health', 'fitbit']),
  platform: z.enum(['ios', 'android']),
  records: z.array(healthRecordSchema).min(1).max(1000)
});

const liveSyncSchema = z.object({
  appId: z.enum(['apple-health', 'health-connect', 'google-fit', 'samsung-health', 'fitbit']).optional(),
  platform: z.enum(['ios', 'android']).optional()
});

export const wearablesRouter = Router();

wearablesRouter.get('/health-apps', (req, res) => {
  const platform = req.query.platform === 'ios' ? 'ios' : 'android';
  return res.status(200).json({
    platform,
    apps: getHealthApps(platform)
  });
});

wearablesRouter.use(requireAuthenticatedAccount);

wearablesRouter.post('/connect-app', (req, res) => {
  const parse = healthAppConnectSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: 'invalid_payload',
      message: 'appId and platform are required.'
    });
  }

  try {
    const connection = connectHealthApp({
      ...parse.data,
      userId: getAuthenticatedAccount(req).accountId
    });
    return res.status(200).json({
      connected: true,
      connectionId: connection.id,
      appId: connection.appId,
      appName: connection.appName,
      provider: connection.provider,
      connectedAtISO: connection.connectedAtISO,
      status: connection.status
    });
  } catch {
    return res.status(404).json({
      error: 'app_not_supported',
      message: 'Selected health app is not available on this platform.'
    });
  }
});

wearablesRouter.get('/connections/:userId', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const observations = await listHealthObservations({ accountId: account.accountId, clientId: account.client.id }, { limit: 500, offset: 0 });
  const providers = [...new Set(observations.map((item) => item.sourceProvider))];
  return res.status(200).json({
    userId: account.accountId,
    connections: providers.map((provider) => ({ provider, status: 'connected', authority: 'health_observations' }))
  });
});

const unitByMetric: Record<string, string> = {
  steps: 'count',
  sleep_minutes: 'min',
  resting_heart_rate: 'bpm',
  hydration_ml: 'ml',
  active_minutes: 'min',
  mindfulness_minutes: 'min',
  hrv_ms: 'ms',
  calories_kcal: 'kcal',
  workout_minutes: 'min',
  stress_score: 'score',
  cycle_day: 'day',
  spo2_pct: '%',
  respiratory_rate_brpm: 'brpm'
};

wearablesRouter.post('/records/ingest', async (req, res) => {
  const parse = ingestSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: 'invalid_payload',
      message: 'appId, platform, and records[] are required.'
    });
  }

  const account = getAuthenticatedAccount(req);
  const durable = await ingestHealthObservations({
    accountId: account.accountId,
    clientId: account.client.id
  }, parse.data.records.map((record) => ({
    metricType: record.type,
    value: record.value,
    unit: unitByMetric[record.type] ?? 'unknown',
    measuredAtISO: record.recordedAtISO,
    sourceProvider: parse.data.appId,
    sourceRecordId: `${parse.data.appId}:${record.type}:${record.recordedAtISO}`,
    syncKey: `${parse.data.appId}:${record.type}:${record.recordedAtISO}`
  })));
  return res.status(200).json({
    connectionId: `canonical-${account.accountId}-${parse.data.platform}-${parse.data.appId}`,
    ingestedCount: durable.accepted.length,
    duplicateCount: durable.duplicate.length,
    rejectedCount: durable.rejected.length,
    totalStored: await listHealthObservations({ accountId: account.accountId, clientId: account.client.id }, { limit: 5000, offset: 0 }).then((items) => items.length),
    latestRecordedAtISO: durable.accepted[0]?.measuredAtISO ?? null,
    durableObservations: {
      accepted: durable.accepted.length,
      duplicate: durable.duplicate.length,
      rejected: durable.rejected.length
    }
  });
});

wearablesRouter.post('/sync/live', async (req, res) => {
  const parse = liveSyncSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: 'invalid_payload',
      message: 'Optional appId/platform payload is invalid.'
    });
  }

  try {
    const account = getAuthenticatedAccount(req);
    const appId = parse.data.appId ?? 'health-connect';
    const platform = parse.data.platform ?? (appId === 'apple-health' ? 'ios' : 'android');
    const observations = await listHealthObservations({ accountId: account.accountId, clientId: account.client.id }, { limit: 5000, offset: 0 });
    const { connection, payload } = buildLiveSyncPayload({
      userId: account.accountId,
      appId,
      platform,
      records: observations
        .filter((item) => item.sourceProvider === appId)
        .map((item) => ({ type: item.metricType as never, value: item.value, recordedAtISO: item.measuredAtISO }))
    });
    return res.status(200).json({
      connection,
      payload
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'insufficient_data') {
      return res.status(409).json({
        error: 'INSUFFICIENT_DATA',
        message: 'No real health records have been ingested for this health connection yet.'
      });
    }
    return res.status(404).json({
      error: 'connection_not_found',
      message: 'No connected health app found for this user.'
    });
  }
});

wearablesRouter.post('/sync', (req, res) => {
  const parse = wearableSyncSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: 'invalid_payload',
      message: 'deviceId, brand, and model are required.'
    });
  }

  return res.status(410).json({
    error: 'LEGACY_SYNC_REMOVED',
    message: 'Legacy device sync no longer returns estimated health values. Use /v1/health/observations:batch with real platform records.'
  });
});
