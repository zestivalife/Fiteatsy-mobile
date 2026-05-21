import { randomUUID } from 'crypto';
const healthAppsByPlatform = {
    ios: [
        { id: 'apple-health', label: 'Apple Health', subtitle: 'iPhone wellness and activity data', brand: 'Apple' },
        { id: 'fitbit', label: 'Fitbit', subtitle: 'Sleep and movement summaries', brand: 'Other' }
    ],
    android: [
        { id: 'health-connect', label: 'Health Connect', subtitle: 'Android unified health data', brand: 'Other' },
        { id: 'google-fit', label: 'Google Fit', subtitle: 'Activity, steps, and heart trends', brand: 'Other' },
        { id: 'samsung-health', label: 'Samsung Health', subtitle: 'Samsung device health insights', brand: 'Samsung' },
        { id: 'fitbit', label: 'Fitbit', subtitle: 'Sleep and movement summaries', brand: 'Other' }
    ]
};
const providerLabel = {
    Apple: 'HealthKit',
    Samsung: 'Samsung Health',
    Xiaomi: 'Mi Fitness',
    Amazfit: 'Zepp',
    GoBOLT: 'GoBOLT Health',
    Other: 'Nuetra Universal Adapter'
};
const baselineByBrand = {
    Apple: { heartRateAvg: 69, sleepHours: 7.6, hydrationLiters: 2.7, focusMinutes: 26, breathingMinutes: 12, movementMinutes: 20 },
    Samsung: { heartRateAvg: 71, sleepHours: 7.2, hydrationLiters: 2.5, focusMinutes: 22, breathingMinutes: 10, movementMinutes: 18 },
    Xiaomi: { heartRateAvg: 73, sleepHours: 6.9, hydrationLiters: 2.3, focusMinutes: 19, breathingMinutes: 8, movementMinutes: 16 },
    Amazfit: { heartRateAvg: 72, sleepHours: 7.1, hydrationLiters: 2.4, focusMinutes: 20, breathingMinutes: 9, movementMinutes: 17 },
    GoBOLT: { heartRateAvg: 72, sleepHours: 7.1, hydrationLiters: 2.4, focusMinutes: 20, breathingMinutes: 9, movementMinutes: 17 },
    Other: { heartRateAvg: 72, sleepHours: 7, hydrationLiters: 2.4, focusMinutes: 20, breathingMinutes: 9, movementMinutes: 16 }
};
const connections = new Map();
const recordsByConnectionId = new Map();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const jitter = (seed, variance) => (Math.random() - 0.5) * variance + seed;
const getBrandForApp = (platform, appId) => {
    const app = healthAppsByPlatform[platform].find((item) => item.id === appId);
    return app?.brand ?? 'Other';
};
export const getHealthApps = (platform) => healthAppsByPlatform[platform];
export const connectHealthApp = (params) => {
    const app = healthAppsByPlatform[params.platform].find((item) => item.id === params.appId);
    if (!app) {
        throw new Error('app_not_supported');
    }
    const existing = Array.from(connections.values()).find((item) => item.userId === params.userId && item.appId === params.appId && item.platform === params.platform);
    const connection = existing
        ? { ...existing, status: 'connected' }
        : {
            id: `conn-${randomUUID()}`,
            userId: params.userId,
            appId: app.id,
            appName: app.label,
            platform: params.platform,
            provider: providerLabel[app.brand],
            connectedAtISO: new Date().toISOString(),
            status: 'connected'
        };
    connections.set(connection.id, connection);
    if (!recordsByConnectionId.has(connection.id)) {
        recordsByConnectionId.set(connection.id, []);
    }
    return connection;
};
export const getConnections = (userId) => Array.from(connections.values())
    .filter((item) => item.userId === userId)
    .sort((a, b) => +new Date(b.connectedAtISO) - +new Date(a.connectedAtISO));
export const ingestHealthRecords = (params) => {
    const connection = connectHealthApp({ userId: params.userId, appId: params.appId, platform: params.platform });
    const current = recordsByConnectionId.get(connection.id) ?? [];
    const merged = [...params.records, ...current]
        .filter((item) => Number.isFinite(item.value) && !Number.isNaN(+new Date(item.recordedAtISO)))
        .slice(0, 5000);
    recordsByConnectionId.set(connection.id, merged);
    return {
        connectionId: connection.id,
        ingestedCount: params.records.length,
        totalStored: merged.length,
        latestRecordedAtISO: merged[0]?.recordedAtISO ?? null
    };
};
const aggregateLiveMetrics = (records, base) => {
    if (records.length === 0) {
        return {
            heartRateAvg: Math.round(clamp(jitter(base.heartRateAvg, 6), 52, 110)),
            sleepHours: Number(clamp(jitter(base.sleepHours, 1.2), 4.5, 9.5).toFixed(1)),
            hydrationLiters: Number(clamp(jitter(base.hydrationLiters, 0.8), 0.8, 5).toFixed(1)),
            focusMinutes: Math.round(clamp(jitter(base.focusMinutes, 12), 5, 90)),
            breathingMinutes: Math.round(clamp(jitter(base.breathingMinutes, 8), 2, 40)),
            movementMinutes: Math.round(clamp(jitter(base.movementMinutes, 18), 5, 120))
        };
    }
    const now = Date.now();
    const lookbackMs = 24 * 60 * 60 * 1000;
    const recent = records.filter((item) => now - +new Date(item.recordedAtISO) <= lookbackMs);
    const values = (type) => recent.filter((item) => item.type === type).map((item) => item.value);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const resting = avg(values('resting_heart_rate'));
    const sleepMinutes = sum(values('sleep_minutes'));
    const hydrationMl = sum(values('hydration_ml'));
    const activeMinutes = sum(values('active_minutes'));
    const focusMinutes = sum(values('steps')) > 0 ? Math.round(sum(values('steps')) / 120) : null;
    const breathingMinutes = sum(values('mindfulness_minutes'));
    return {
        heartRateAvg: Math.round(clamp(resting ?? jitter(base.heartRateAvg, 5), 48, 115)),
        sleepHours: Number(clamp((sleepMinutes > 0 ? sleepMinutes / 60 : base.sleepHours), 3.5, 10).toFixed(1)),
        hydrationLiters: Number(clamp((hydrationMl > 0 ? hydrationMl / 1000 : base.hydrationLiters), 0.7, 5.5).toFixed(1)),
        focusMinutes: Math.round(clamp(focusMinutes ?? base.focusMinutes, 5, 120)),
        breathingMinutes: Math.round(clamp(breathingMinutes > 0 ? breathingMinutes : base.breathingMinutes, 2, 60)),
        movementMinutes: Math.round(clamp(activeMinutes > 0 ? activeMinutes : base.movementMinutes, 5, 180))
    };
};
export const buildLiveSyncPayload = (params) => {
    const pool = getConnections(params.userId).filter((item) => item.status === 'connected');
    const connection = params.appId
        ? pool.find((item) => item.appId === params.appId && (!params.platform || item.platform === params.platform))
        : pool[0];
    if (!connection) {
        throw new Error('connection_not_found');
    }
    const brand = getBrandForApp(connection.platform, connection.appId);
    const records = recordsByConnectionId.get(connection.id) ?? [];
    const metrics = aggregateLiveMetrics(records, baselineByBrand[brand]);
    const payload = {
        deviceId: connection.id,
        brand,
        model: connection.appName,
        provider: connection.provider,
        syncedAtISO: new Date().toISOString(),
        source: 'api',
        metrics,
        dataQuality: {
            confidence: records.length > 0 ? 0.95 : 0.86,
            isEstimated: records.length === 0,
            warnings: records.length === 0 ? ['No live records yet. Using provider baseline until records are ingested.'] : []
        }
    };
    return { connection, payload };
};
