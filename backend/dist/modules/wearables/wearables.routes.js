import { Router } from 'express';
import { z } from 'zod';
import { buildLiveSyncPayload, connectHealthApp, getConnections, getHealthApps, ingestHealthRecords } from './wearables.service.js';
const wearableSyncSchema = z.object({
    deviceId: z.string().min(1),
    brand: z.enum(['Apple', 'Samsung', 'Xiaomi', 'Amazfit', 'GoBOLT', 'Other']),
    model: z.string().min(1)
});
const healthAppConnectSchema = z.object({
    appId: z.enum(['apple-health', 'health-connect', 'google-fit', 'samsung-health', 'fitbit']),
    platform: z.enum(['ios', 'android']),
    userId: z.string().min(1).max(120)
});
const healthRecordSchema = z.object({
    type: z.enum(['steps', 'sleep_minutes', 'resting_heart_rate', 'hydration_ml', 'active_minutes', 'mindfulness_minutes']),
    value: z.number().finite(),
    recordedAtISO: z.string().datetime()
});
const ingestSchema = z.object({
    userId: z.string().min(1).max(120),
    appId: z.enum(['apple-health', 'health-connect', 'google-fit', 'samsung-health', 'fitbit']),
    platform: z.enum(['ios', 'android']),
    records: z.array(healthRecordSchema).min(1).max(1000)
});
const liveSyncSchema = z.object({
    userId: z.string().min(1).max(120),
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
wearablesRouter.post('/connect-app', (req, res) => {
    const parse = healthAppConnectSchema.safeParse(req.body);
    if (!parse.success) {
        return res.status(400).json({
            error: 'invalid_payload',
            message: 'appId, platform, and userId are required.'
        });
    }
    try {
        const connection = connectHealthApp(parse.data);
        return res.status(200).json({
            connected: true,
            connectionId: connection.id,
            appId: connection.appId,
            appName: connection.appName,
            provider: connection.provider,
            connectedAtISO: connection.connectedAtISO,
            status: connection.status
        });
    }
    catch {
        return res.status(404).json({
            error: 'app_not_supported',
            message: 'Selected health app is not available on this platform.'
        });
    }
});
wearablesRouter.get('/connections/:userId', (req, res) => {
    const userId = req.params.userId;
    return res.status(200).json({
        userId,
        connections: getConnections(userId)
    });
});
wearablesRouter.post('/records/ingest', (req, res) => {
    const parse = ingestSchema.safeParse(req.body);
    if (!parse.success) {
        return res.status(400).json({
            error: 'invalid_payload',
            message: 'userId, appId, platform, and records[] are required.'
        });
    }
    const result = ingestHealthRecords(parse.data);
    return res.status(200).json(result);
});
wearablesRouter.post('/sync/live', (req, res) => {
    const parse = liveSyncSchema.safeParse(req.body);
    if (!parse.success) {
        return res.status(400).json({
            error: 'invalid_payload',
            message: 'userId is required for live sync.'
        });
    }
    try {
        const { connection, payload } = buildLiveSyncPayload(parse.data);
        return res.status(200).json({
            connection,
            payload
        });
    }
    catch {
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
    const payload = {
        deviceId: parse.data.deviceId,
        brand: parse.data.brand,
        model: parse.data.model,
        provider: 'Legacy Adapter',
        syncedAtISO: new Date().toISOString(),
        source: 'api',
        metrics: {
            heartRateAvg: 72,
            sleepHours: 7.1,
            hydrationLiters: 2.4,
            focusMinutes: 20,
            breathingMinutes: 9,
            movementMinutes: 17
        },
        dataQuality: {
            confidence: 0.82,
            isEstimated: true,
            warnings: ['Legacy sync endpoint used. Migrate to /v1/wearables/sync/live for connected health apps.']
        }
    };
    return res.status(200).json(payload);
});
