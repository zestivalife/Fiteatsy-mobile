import { WearableDevice, WearableSyncPayload, WellnessSnapshot } from '../types';
import { emptyWellness } from '../state/emptyWellness';
import { recalculateWellness } from '../utils/wellness';
import { postJson } from './apiClient';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const normalize = (value: number | null, min: number, max: number, decimals = 0) => {
    if (value == null) return null;
    if (!Number.isFinite(value)) throw new Error('Invalid wearable metric.');
    const clamped = clamp(value, min, max);
    return decimals === 0 ? Math.round(clamped) : Number(clamped.toFixed(decimals));
  };

  const metrics = {
    heartRateAvg: normalize(payload.metrics.heartRateAvg, 45, 130),
    sleepHours: normalize(payload.metrics.sleepHours, 3, 10, 1),
    hydrationLiters: normalize(payload.metrics.hydrationLiters, 0, 7, 1),
    focusMinutes: normalize(payload.metrics.focusMinutes, 0, 180),
    breathingMinutes: normalize(payload.metrics.breathingMinutes, 0, 90),
    movementMinutes: normalize(payload.metrics.movementMinutes, 0, 240)
  };

  (Object.keys(metrics) as Array<keyof typeof metrics>).forEach((key) => {
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
    ...emptyWellness,
    heartRateAvg: payload.metrics.heartRateAvg ?? emptyWellness.heartRateAvg,
    sleepHours: payload.metrics.sleepHours ?? emptyWellness.sleepHours,
    hydrationLiters: payload.metrics.hydrationLiters ?? emptyWellness.hydrationLiters,
    focusMinutes: payload.metrics.focusMinutes ?? emptyWellness.focusMinutes,
    breathingMinutes: payload.metrics.breathingMinutes ?? emptyWellness.breathingMinutes,
    movementMinutes: payload.metrics.movementMinutes ?? emptyWellness.movementMinutes,
    availability: 'available',
    lastUpdatedISO: payload.syncedAtISO,
    source: payload.provider
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

export const syncWearableData = async (device: WearableDevice): Promise<{ wellness: WellnessSnapshot; payload: WearableSyncPayload }> => {
  const body = {
    deviceId: device.id,
    brand: device.brand,
    model: device.model
  };

  const payload = validateAndNormalizePayload(
    await withTimeout(
      postJson<WearableSyncPayload>('/v1/wearables/sync', body),
      5000
    )
  );

  return {
    payload,
    wellness: payloadToWellness(payload)
  };
};
