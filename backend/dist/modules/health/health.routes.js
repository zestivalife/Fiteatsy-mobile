import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { countHealthObservations, ingestHealthObservations, listHealthObservations } from './health-observations.repository.js';
import { calculateHealthScores } from '../intelligence/health-calculation-engine.js';
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
        recordingMethod: z.number().int().optional()
    }).strict().optional()
});
const metricUnits = {
    steps: new Set(['count']),
    sleep_minutes: new Set(['min']),
    resting_heart_rate: new Set(['bpm']),
    hrv_ms: new Set(['ms']),
    workout_minutes: new Set(['min']),
    active_minutes: new Set(['min']),
    active_energy: new Set(['kcal']),
    weight: new Set(['kg']),
    distance: new Set(['m']),
    hydration_ml: new Set(['ml']),
    stress_score: new Set(['score']),
    mindfulness_minutes: new Set(['min'])
};
const validateObservation = (observation) => {
    const allowedUnits = metricUnits[observation.metricType];
    if (!allowedUnits)
        return 'UNSUPPORTED_METRIC';
    if (!allowedUnits.has(observation.unit))
        return 'INVALID_UNIT';
    if (observation.value <= 0)
        return 'INVALID_VALUE';
    const measuredAt = Date.parse(observation.measuredAtISO);
    if (measuredAt > Date.now() + 5 * 60_000)
        return 'FUTURE_TIMESTAMP';
    const startAt = observation.sourceMetadata?.startAtISO ? Date.parse(observation.sourceMetadata.startAtISO) : null;
    const endAt = observation.sourceMetadata?.endAtISO ? Date.parse(observation.sourceMetadata.endAtISO) : null;
    if (startAt != null && endAt != null && endAt < startAt)
        return 'INVALID_INTERVAL';
    return null;
};
const batchSchema = z.object({
    observations: z.array(observationSchema).min(1).max(1000)
});
export const healthRouter = Router();
const currentOwner = (account) => ({
    accountId: account.accountId,
    clientId: account.client.id
});
const toObservationDto = (observation, fiteatsyClientId) => ({
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
});
healthRouter.use(requireAuthenticatedAccount);
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
    const result = await ingestHealthObservations(owner, parsed.data.observations);
    const scores = await calculateHealthScores(owner);
    return res.status(200).json({
        accepted: result.accepted.length,
        duplicate: result.duplicate.length,
        rejected: result.rejected.length,
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
    const bySource = observations.reduce((acc, observation) => {
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
    const statusFor = (...sources) => {
        const sourceStatus = sources
            .map((source) => bySource[source])
            .find((candidate) => candidate != null);
        if (!sourceStatus) {
            return {
                status: 'NOT_CONNECTED',
                lastSyncISO: null,
                latestMeasurementISO: null,
                recordsSynced: 0
            };
        }
        return {
            status: 'CONNECTED',
            ...sourceStatus
        };
    };
    return res.status(200).json({
        fiteatsyClientId: account.client.fiteatsyClientId,
        overallStatus: observations.length > 0 ? 'CONNECTED' : 'NOT_CONNECTED',
        lastSyncISO: observations.reduce((latest, observation) => (latest == null || observation.createdAtISO > latest ? observation.createdAtISO : latest), null),
        latestMeasurementISO: observations[0]?.measuredAtISO ?? null,
        recordsSynced: observations.length,
        appleHealth: statusFor('apple_health', 'apple-health'),
        healthConnect: statusFor('health_connect', 'health-connect'),
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
