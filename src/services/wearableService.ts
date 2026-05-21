import { WearableDevice, WearableSyncPayload, WellnessSnapshot } from '../types';
import { initialWellness } from '../data/mock';
import { recalculateWellness } from '../utils/wellness';
import Constants from 'expo-constants';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getApiBaseUrl = () => {
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) return fromExtra;
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (!host) return 'http://localhost:4001';
  return `http://${host}:4001`;
};

const apiBaseUrl = getApiBaseUrl();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const connectWearable = async (device: WearableDevice): Promise<WearableDevice> => {
  await delay(900);
  return {
    ...device,
    connected: true,
    lastSyncISO: new Date().toISOString()
  };
};

const validateAndNormalizePayload = (payload: WearableSyncPayload): WearableSyncPayload => {
  const warnings: string[] = [];

  const metrics = {
    heartRateAvg: Math.round(clamp(payload.metrics.heartRateAvg, 45, 130)),
    sleepHours: Number(clamp(payload.metrics.sleepHours, 3, 10).toFixed(1)),
    hydrationLiters: Number(clamp(payload.metrics.hydrationLiters, 0, 7).toFixed(1)),
    focusMinutes: Math.round(clamp(payload.metrics.focusMinutes, 0, 180)),
    breathingMinutes: Math.round(clamp(payload.metrics.breathingMinutes, 0, 90)),
    movementMinutes: Math.round(clamp(payload.metrics.movementMinutes, 0, 240))
  };

  (Object.keys(metrics) as Array<keyof typeof metrics>).forEach((key) => {
    if (!Number.isFinite(payload.metrics[key])) {
      throw new Error(`Invalid wearable metric: ${key}`);
    }
    if (payload.metrics[key] !== metrics[key]) {
      warnings.push(`Adjusted ${key} to safe range.`);
    }
  });

  const rawConfidence = payload.dataQuality?.confidence ?? 0.86;
  const confidence = Number(clamp(rawConfidence - warnings.length * 0.03, 0.5, 0.99).toFixed(2));

  return {
    ...payload,
    source: 'api',
    metrics,
    dataQuality: {
      confidence,
      isEstimated: false,
      warnings
    }
  };
};

const payloadToWellness = (payload: WearableSyncPayload): WellnessSnapshot => {
  if (payload.dataQuality.confidence < 0.72) {
    throw new Error('Wearable data quality too low to update wellness score safely.');
  }

  return recalculateWellness({
    ...initialWellness,
    heartRateAvg: payload.metrics.heartRateAvg,
    sleepHours: payload.metrics.sleepHours,
    hydrationLiters: payload.metrics.hydrationLiters,
    focusMinutes: payload.metrics.focusMinutes,
    breathingMinutes: payload.metrics.breathingMinutes,
    movementMinutes: payload.metrics.movementMinutes
  });
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const buildMockPayload = (device: WearableDevice): WearableSyncPayload => {
  const seed = device.id.length + device.brand.length + new Date().getDate();
  return {
    deviceId: device.id,
    brand: device.brand,
    model: device.model,
    provider: device.brand === 'GoBOLT' ? 'gobolt-local' : 'wearable-local',
    syncedAtISO: new Date().toISOString(),
    source: 'mock',
    metrics: {
      heartRateAvg: 62 + (seed % 22),
      sleepHours: Number((6.1 + (seed % 23) / 10).toFixed(1)),
      hydrationLiters: Number((1.8 + (seed % 12) / 10).toFixed(1)),
      focusMinutes: 22 + (seed % 56),
      breathingMinutes: 4 + (seed % 18),
      movementMinutes: 28 + (seed % 72)
    },
    dataQuality: {
      confidence: 0.74,
      isEstimated: true,
      warnings: ['Live wearable API unavailable. Synced using device-estimated baseline data.']
    }
  };
};

export const syncWearableData = async (device: WearableDevice): Promise<{ wellness: WellnessSnapshot; payload: WearableSyncPayload }> => {
  const body = {
    deviceId: device.id,
    brand: device.brand,
    model: device.model
  };

  let payload: WearableSyncPayload;
  try {
    const response = await withTimeout(
      fetch(`${apiBaseUrl}/v1/wearables/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }),
      5000
    );

    if (!response.ok) {
      throw new Error(`Wearable sync failed: ${response.status}`);
    }

    payload = validateAndNormalizePayload((await response.json()) as WearableSyncPayload);
  } catch {
    payload = buildMockPayload(device);
  }

  return {
    payload,
    wellness: payloadToWellness(payload)
  };
};
