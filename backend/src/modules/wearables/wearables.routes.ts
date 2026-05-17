import { Router } from 'express';
import { z } from 'zod';

const wearableSyncSchema = z.object({
  deviceId: z.string().min(1),
  brand: z.enum(['Apple', 'Samsung', 'Xiaomi', 'Amazfit', 'Other']),
  model: z.string().min(1)
});

type WearableBrand = z.infer<typeof wearableSyncSchema>['brand'];

const baselineByBrand: Record<
  WearableBrand,
  {
    heartRateAvg: number;
    sleepHours: number;
    hydrationLiters: number;
    focusMinutes: number;
    breathingMinutes: number;
    movementMinutes: number;
  }
> = {
  Apple: {
    heartRateAvg: 69,
    sleepHours: 7.6,
    hydrationLiters: 2.7,
    focusMinutes: 26,
    breathingMinutes: 12,
    movementMinutes: 20
  },
  Samsung: {
    heartRateAvg: 71,
    sleepHours: 7.2,
    hydrationLiters: 2.5,
    focusMinutes: 22,
    breathingMinutes: 10,
    movementMinutes: 18
  },
  Xiaomi: {
    heartRateAvg: 73,
    sleepHours: 6.9,
    hydrationLiters: 2.3,
    focusMinutes: 19,
    breathingMinutes: 8,
    movementMinutes: 16
  },
  Amazfit: {
    heartRateAvg: 72,
    sleepHours: 7.1,
    hydrationLiters: 2.4,
    focusMinutes: 20,
    breathingMinutes: 9,
    movementMinutes: 17
  },
  Other: {
    heartRateAvg: 72,
    sleepHours: 7,
    hydrationLiters: 2.4,
    focusMinutes: 20,
    breathingMinutes: 9,
    movementMinutes: 16
  }
};

const providerLabel: Record<WearableBrand, string> = {
  Apple: 'HealthKit',
  Samsung: 'Samsung Health',
  Xiaomi: 'Mi Fitness',
  Amazfit: 'Zepp',
  Other: 'Nuetra Universal Adapter'
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const jitter = (seed: number, variance: number) => (Math.random() - 0.5) * variance + seed;

export const wearablesRouter = Router();

wearablesRouter.post('/sync', async (req, res) => {
  const parse = wearableSyncSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: 'invalid_payload',
      message: 'deviceId, brand, and model are required.'
    });
  }

  const { deviceId, brand, model } = parse.data;
  const base = baselineByBrand[brand];

  const metrics = {
    heartRateAvg: Math.round(clamp(jitter(base.heartRateAvg, 6), 52, 110)),
    sleepHours: Number(clamp(jitter(base.sleepHours, 1.2), 4.5, 9.5).toFixed(1)),
    hydrationLiters: Number(clamp(jitter(base.hydrationLiters, 0.8), 0.8, 5).toFixed(1)),
    focusMinutes: Math.round(clamp(jitter(base.focusMinutes, 12), 5, 90)),
    breathingMinutes: Math.round(clamp(jitter(base.breathingMinutes, 8), 2, 40)),
    movementMinutes: Math.round(clamp(jitter(base.movementMinutes, 18), 5, 120))
  };

  const payload = {
    deviceId,
    brand,
    model,
    provider: providerLabel[brand],
    syncedAtISO: new Date().toISOString(),
    source: 'api' as const,
    metrics,
    dataQuality: {
      confidence: 0.94,
      isEstimated: false,
      warnings: [] as string[]
    }
  };

  return res.status(200).json(payload);
});
