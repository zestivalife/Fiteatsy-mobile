import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { countHealthObservations, ingestHealthObservations, listHealthObservations } from './health-observations.repository.js';
const observationSchema = z.object({
    metricType: z.string().trim().min(1).max(80),
    value: z.number().finite(),
    unit: z.string().trim().min(1).max(40),
    measuredAtISO: z.string().datetime(),
    sourceProvider: z.string().trim().min(1).max(80),
    sourceRecordId: z.string().trim().max(180).optional(),
    syncKey: z.string().trim().max(220).optional(),
    qualityStatus: z.enum(['accepted', 'estimated']).optional()
});
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
    createdAtISO: observation.createdAtISO
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
    const result = await ingestHealthObservations(owner, parsed.data.observations);
    return res.status(200).json({
        accepted: result.accepted.length,
        duplicate: result.duplicate.length,
        rejected: result.rejected.length,
        items: result.accepted.map((item) => toObservationDto(item, account.client.fiteatsyClientId)),
        duplicates: result.duplicate,
        rejections: result.rejected
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
