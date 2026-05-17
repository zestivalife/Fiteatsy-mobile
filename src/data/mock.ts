import { WearableDevice, WellnessSnapshot } from '../types';
import { recalculateWellness } from '../utils/wellness';

export const mockDevices: WearableDevice[] = [
  {
    id: 'dev-apple-1',
    brand: 'Apple',
    model: 'Apple Watch Series 9',
    connected: false,
    battery: 86,
    lastSyncISO: '2026-04-03T06:30:00.000Z'
  },
  {
    id: 'dev-samsung-1',
    brand: 'Samsung',
    model: 'Galaxy Watch 6',
    connected: false,
    battery: 62,
    lastSyncISO: '2026-04-02T18:10:00.000Z'
  },
  {
    id: 'dev-xiaomi-1',
    brand: 'Xiaomi',
    model: 'Watch S3',
    connected: false,
    battery: 49,
    lastSyncISO: '2026-04-01T07:40:00.000Z'
  },
  {
    id: 'dev-amazfit-1',
    brand: 'Amazfit',
    model: 'GTR 4',
    connected: false,
    battery: 71,
    lastSyncISO: '2026-03-31T20:01:00.000Z'
  },
  {
    id: 'dev-other-1',
    brand: 'Other',
    model: 'Bluetooth Wearable',
    connected: false,
    battery: 54,
    lastSyncISO: '2026-04-03T02:15:00.000Z'
  }
];

export const initialWellness: WellnessSnapshot = recalculateWellness({
  focusMinutes: 15,
  breathingMinutes: 5,
  movementMinutes: 10,
  hydrationLiters: 2.4,
  hydrationGoalLiters: 4,
  heartRateAvg: 72,
  sleepHours: 7.8,
  moodScore: 60,
  recoveryScore: 0,
  nourishmentScore: 0,
  wellnessScore: 0,
  hrvStatus: 'Normal',
  stressScore: 80
});
