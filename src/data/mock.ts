import { WearableDevice, WellnessSnapshot } from '../types';

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
    id: 'dev-gobolt-1',
    brand: 'GoBOLT',
    model: 'GoBOLT Health Watch',
    connected: false,
    battery: 68,
    lastSyncISO: '2026-04-02T11:30:00.000Z'
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

export const initialWellness: WellnessSnapshot = {
  focusMinutes: 0,
  breathingMinutes: 0,
  movementMinutes: 0,
  hydrationLiters: 0,
  hydrationGoalLiters: 4,
  heartRateAvg: 0,
  sleepHours: 0,
  moodScore: 0,
  recoveryScore: 0,
  nourishmentScore: 0,
  wellnessScore: 0,
  hrvStatus: 'Normal',
  stressScore: 0
};
