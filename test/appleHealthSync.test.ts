import fs from 'node:fs';
import path from 'node:path';

const mockHealthKit = {
  isHealthDataAvailableAsync: jest.fn(),
  requestAuthorization: jest.fn(),
  queryStatisticsCollectionForQuantity: jest.fn(),
  queryCategorySamples: jest.fn(),
  queryQuantitySamples: jest.fn(),
  queryWorkoutSamples: jest.fn()
};

jest.mock('@kingstinct/react-native-healthkit', () => mockHealthKit, { virtual: true });
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  APPLE_HEALTH_READ_TYPES,
  buildAppleObservation,
  durationToMinutes,
  getLiveHealthWindows,
  selectPrimarySleepSamples,
  syncFromAppleHealth
} from '../src/services/appleHealthService';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const source = (bundleIdentifier: string) => ({ source: { name: bundleIdentifier, bundleIdentifier } });
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000);

describe('Apple Health reader helpers', () => {
  it('converts HealthKit durations to minutes for every unit HealthKit reports', () => {
    expect(durationToMinutes({ unit: 's', quantity: 1800 })).toBe(30);
    expect(durationToMinutes({ unit: 'min', quantity: 45 })).toBe(45);
    expect(durationToMinutes({ unit: 'hr', quantity: 1.5 })).toBe(90);
    expect(durationToMinutes({ unit: 'furlongs', quantity: 3 })).toBe(0);
    expect(durationToMinutes(undefined)).toBe(0);
  });

  it('counts sleep from one source only and ignores in-bed and awake stages', () => {
    const watch = source('com.apple.health.watch');
    const phone = source('com.example.sleepapp');
    const samples = [
      { uuid: 'a', value: 3, startDate: at(8), endDate: at(6), sourceRevision: watch },
      { uuid: 'b', value: 5, startDate: at(6), endDate: at(5), sourceRevision: watch },
      { uuid: 'c', value: 2, startDate: at(5), endDate: at(4.9), sourceRevision: watch },
      { uuid: 'd', value: 0, startDate: at(9), endDate: at(4), sourceRevision: watch },
      { uuid: 'e', value: 1, startDate: at(8), endDate: at(7), sourceRevision: phone }
    ];
    expect(selectPrimarySleepSamples(samples).map((sample) => sample.uuid)).toEqual(['a', 'b']);
  });

  it('rejects non-positive, non-finite, future-dated and inverted observations', () => {
    const base = { metricType: 'steps', unit: 'count', recordType: 'StepCount', sourceRecordId: 'x', measuredAt: at(1) };
    expect(buildAppleObservation({ ...base, value: 0 })).toBeNull();
    expect(buildAppleObservation({ ...base, value: Number.NaN })).toBeNull();
    expect(buildAppleObservation({ ...base, value: null })).toBeNull();
    expect(buildAppleObservation({ ...base, value: 10, measuredAt: new Date(Date.now() + 3_600_000) })).toBeNull();
    expect(buildAppleObservation({ ...base, value: 10, start: at(1), end: at(2) })).toBeNull();
  });

  it('emits the same observation contract as Health Connect with an apple_health namespace', () => {
    const observation = buildAppleObservation({
      metricType: 'resting_heart_rate',
      value: 58.456,
      unit: 'bpm',
      measuredAt: at(2),
      recordType: 'RestingHeartRate',
      sourceRecordId: 'uuid-1',
      source: { bundleIdentifier: 'com.apple.health' },
      device: { name: 'Apple Watch' }
    });
    expect(observation).toMatchObject({
      metricType: 'resting_heart_rate',
      value: 58.46,
      unit: 'bpm',
      sourceProvider: 'apple_health',
      sourceRecordId: 'uuid-1',
      syncKey: 'apple_health:RestingHeartRate:com.apple.health:uuid-1',
      qualityStatus: 'accepted'
    });
    expect(observation?.sourceMetadata?.device).toEqual({ manufacturer: undefined, model: 'Apple Watch' });
    expect(observation?.sourceMetadata?.originalValue).toBe(58.456);
  });

  it('builds device-local midnight and most-recent-6-PM live windows', () => {
    const now = new Date(2026, 9, 26, 9, 30, 0);
    const windows = getLiveHealthWindows(now.getTime());
    expect(windows.dayStart.getHours()).toBe(0);
    expect(windows.dayStart.getMinutes()).toBe(0);
    expect(windows.sleepStart.getHours()).toBe(18);
    expect(windows.sleepStart.getDate()).toBe(25);
    expect(windows.endDate.getTime()).toBe(now.getTime());
  });
});

describe('Apple Health sync', () => {
  afterEach(() => jest.restoreAllMocks());

  const completedHour = (hoursAgo: number, total: number) => ({
    startDate: at(hoursAgo + 1),
    endDate: at(hoursAgo),
    sumQuantity: { unit: 'count', quantity: total },
    sources: []
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 26, 9, 30, 0));
    mockHealthKit.isHealthDataAvailableAsync.mockResolvedValue(true);
    mockHealthKit.requestAuthorization.mockResolvedValue(true);
    mockHealthKit.queryStatisticsCollectionForQuantity.mockImplementation(async (identifier: string) =>
      identifier.endsWith('StepCount') ? [completedHour(3, 500), completedHour(2, 0), completedHour(1, 700)] : []
    );
    mockHealthKit.queryCategorySamples.mockResolvedValue([
      { uuid: 'sleep-1', value: 3, startDate: at(9), endDate: at(5), sourceRevision: source('com.apple.health') }
    ]);
    mockHealthKit.queryQuantitySamples.mockImplementation(async (identifier: string) => {
      if (identifier.endsWith('RestingHeartRate')) {
        return [{ uuid: 'hr-1', quantity: 60, startDate: at(3), endDate: at(3), sourceRevision: source('com.apple.health') }];
      }
      if (identifier.endsWith('HeartRateVariabilitySDNN')) {
        return [{ uuid: 'hrv-1', quantity: 42, startDate: at(4), endDate: at(4), sourceRevision: source('com.apple.health') }];
      }
      return [];
    });
    mockHealthKit.queryWorkoutSamples.mockResolvedValue([
      { uuid: 'w-1', duration: { unit: 's', quantity: 2400 }, startDate: at(20), endDate: at(19), sourceRevision: source('com.apple.health') }
    ]);
  });

  it('requests read-only authorization for exactly the declared types', async () => {
    await syncFromAppleHealth();
    expect(mockHealthKit.requestAuthorization).toHaveBeenCalledWith({ toRead: [...APPLE_HEALTH_READ_TYPES] });
    expect(mockHealthKit.requestAuthorization.mock.calls[0][0]).not.toHaveProperty('toShare');
  });

  it('builds a payload with the same metric keys and aggregates as the Android reader', async () => {
    const payload = await syncFromAppleHealth();
    expect(payload.provider).toBe('Apple Health');
    expect(payload.brand).toBe('Apple');
    expect(payload.metrics).toMatchObject({ heartRateAvg: 60, sleepHours: 4, hrvMs: 42, workoutMinutes: 40, movementMinutes: 40 });
    expect(payload.dataQuality.connectedMetrics).toMatchObject({
      steps: 'synced',
      sleep: 'synced',
      heart_rate: 'synced',
      hrv: 'synced',
      workouts: 'synced',
      calories: 'no_recent_data',
      weight: 'no_recent_data',
      distance: 'no_recent_data',
      stress: 'unsupported'
    });
    expect(payload.observations?.map((o) => o.metricType).sort()).toEqual(
      ['hrv_ms', 'resting_heart_rate', 'sleep_minutes', 'steps', 'steps', 'workout_minutes'].sort()
    );
    expect(payload.observations?.every((o) => o.sourceProvider === 'apple_health' && o.syncKey)).toBe(true);
  });

  it('uses stable ids so repeated syncs de-duplicate, and skips empty buckets', async () => {
    const first = await syncFromAppleHealth();
    const second = await syncFromAppleHealth();
    const keys = (payload: typeof first) => (payload.observations ?? []).map((o) => o.syncKey).sort();
    expect(keys(first)).toEqual(keys(second));
    expect(new Set(keys(first)).size).toBe(keys(first).length);
    expect(first.observations?.filter((o) => o.metricType === 'steps')).toHaveLength(2);
  });

  it('includes the current partial hour only for a live display read', async () => {
    const currentBucket = {
      startDate: new Date(Date.UTC(2026, 9, 26, 9, 0, 0)),
      endDate: new Date(Date.UTC(2026, 9, 26, 10, 0, 0)),
      sumQuantity: { unit: 'count', quantity: 99 },
      sources: []
    };
    mockHealthKit.queryStatisticsCollectionForQuantity.mockImplementation(async (identifier: string) =>
      identifier.endsWith('StepCount') ? [completedHour(1, 700), currentBucket] : []
    );

    const syncPayload = await syncFromAppleHealth();
    const livePayload = await syncFromAppleHealth({ includeCurrentHour: true, liveDisplay: true });

    expect(syncPayload.observations?.filter((item) => item.metricType === 'steps')).toHaveLength(1);
    expect(livePayload.observations?.filter((item) => item.metricType === 'steps')).toHaveLength(2);
  });

  it('requests today for live activity and the most recent 6 PM for live sleep', async () => {
    await syncFromAppleHealth({ includeCurrentHour: true, liveDisplay: true });

    const stepsCall = mockHealthKit.queryStatisticsCollectionForQuantity.mock.calls.find(
      ([identifier]) => identifier.endsWith('StepCount')
    );
    const sleepCall = mockHealthKit.queryCategorySamples.mock.calls[0];
    const heartCall = mockHealthKit.queryQuantitySamples.mock.calls.find(
      ([identifier]) => identifier.endsWith('RestingHeartRate')
    );
    expect(stepsCall?.[4].filter.date.startDate.getHours()).toBe(0);
    expect(sleepCall[1].filter.date.startDate.getHours()).toBe(18);
    expect(heartCall?.[1].filter.date.startDate.getHours()).toBe(0);
    expect(stepsCall?.[4].filter.date.endDate.getTime()).toBe(Date.now());
  });

  it('reports a partial result instead of failing when one metric cannot be read', async () => {
    mockHealthKit.queryWorkoutSamples.mockRejectedValue(new Error('boom'));
    const payload = await syncFromAppleHealth();
    expect(payload.dataQuality.connectedMetrics?.workouts).toBe('read_failed');
    expect(payload.dataQuality.warnings.join(' ')).toContain('workouts');
    expect(payload.observations?.length).toBeGreaterThan(0);
  });

  it('returns an honest empty payload when HealthKit has no data', async () => {
    mockHealthKit.queryStatisticsCollectionForQuantity.mockResolvedValue([]);
    mockHealthKit.queryCategorySamples.mockResolvedValue([]);
    mockHealthKit.queryQuantitySamples.mockResolvedValue([]);
    mockHealthKit.queryWorkoutSamples.mockResolvedValue([]);
    const payload = await syncFromAppleHealth();
    expect(payload.observations).toEqual([]);
    expect(payload.dataQuality.confidence).toBe(0);
    expect(payload.dataQuality.warnings[0]).toContain('No recent Apple Health records');
  });

  it('fails clearly when HealthKit is unavailable or the permission flow fails', async () => {
    mockHealthKit.isHealthDataAvailableAsync.mockResolvedValue(false);
    await expect(syncFromAppleHealth()).rejects.toThrow('apple_health_unavailable');
    mockHealthKit.isHealthDataAvailableAsync.mockResolvedValue(true);
    mockHealthKit.requestAuthorization.mockRejectedValue(new Error('denied'));
    await expect(syncFromAppleHealth()).rejects.toThrow('apple_health_permission_flow_failed');
  });
});

describe('Apple Health native configuration', () => {
  it('registers the HealthKit config plugin as read-only with a usage description', () => {
    const appConfig = JSON.parse(read('app.json'));
    const entry = appConfig.expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === '@kingstinct/react-native-healthkit'
    );
    expect(entry).toBeDefined();
    expect(entry[1].NSHealthShareUsageDescription).toMatch(/Apple Health/);
    expect(entry[1].NSHealthUpdateUsageDescription).toBe(false);
  });

  it('routes iOS Apple Health syncs to the HealthKit reader', () => {
    const service = read('src/services/healthAppService.ts');
    expect(service).toContain("import { syncFromAppleHealth } from './appleHealthService'");
    expect(service).toContain("platform === 'ios' && appId === 'apple-health'");
    expect(service).not.toContain('apple_health_native_reader_not_available');
  });
});
