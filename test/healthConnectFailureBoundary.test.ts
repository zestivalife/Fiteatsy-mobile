jest.mock('react-native', () => ({ Platform: { OS: 'android', Version: 35 } }));
jest.mock('react-native-health-connect', () => ({
  SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
  getGrantedPermissions: jest.fn(),
  getSdkStatus: jest.fn(),
  initialize: jest.fn(),
  readRecords: jest.fn(),
  requestPermission: jest.fn()
}));

import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords
} from 'react-native-health-connect';
import {
  syncFromHealthConnect,
  withHealthConnectTimeout
} from '../src/services/healthConnectService';

const recordTypes = [
  'Steps',
  'SleepSession',
  'RestingHeartRate',
  'HeartRateVariabilityRmssd',
  'ExerciseSession',
  'ActiveCaloriesBurned',
  'Weight',
  'Distance'
  ,'HeartRate'
  ,'Hydration'
  ,'OxygenSaturation'
  ,'RespiratoryRate'
];

const grant = (types = recordTypes) => types.map((recordType) => ({ accessType: 'read', recordType }));

const prepareAvailableProvider = (granted = grant()) => {
  (getSdkStatus as jest.Mock).mockResolvedValue(3);
  (initialize as jest.Mock).mockResolvedValue(true);
  (getGrantedPermissions as jest.Mock).mockResolvedValue(granted);
};

describe('Health Connect native failure boundary', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('settles an unresolved native operation with a controlled timeout', async () => {
    jest.useFakeTimers();
    const pending = withHealthConnectTimeout(new Promise<never>(() => undefined), 100);
    jest.advanceTimersByTime(100);
    await expect(pending).rejects.toThrow('health_connect_operation_timed_out');
  });

  it('propagates a native rejection without leaving the operation pending', async () => {
    const failure = new Error('native_process_failure');
    await expect(withHealthConnectTimeout(Promise.reject(failure), 100)).rejects.toBe(failure);
  });

  it('returns a native success before the boundary expires', async () => {
    await expect(withHealthConnectTimeout(Promise.resolve('ready'), 100)).resolves.toBe('ready');
  });

  it('isolates one metric read failure and continues syncing the remaining metrics', async () => {
    prepareAvailableProvider();
    (readRecords as jest.Mock).mockImplementation(async (recordType: string) => {
      if (recordType === 'Steps') throw new Error('steps_provider_failure');
      if (recordType === 'Weight') {
        return {
          records: [{
            time: new Date().toISOString(),
            weight: { inKilograms: 72 },
            metadata: { id: 'weight-1', dataOrigin: 'test.health' }
          }]
        };
      }
      return { records: [] };
    });

    const payload = await syncFromHealthConnect();

    expect(payload.dataQuality.connectedMetrics?.steps).toBe('read_failed');
    expect(payload.dataQuality.connectedMetrics?.weight).toBe('synced');
    expect(payload.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ metricType: 'weight', value: 72, sourceRecordId: 'weight-1' })
    ]));
    expect(readRecords).toHaveBeenCalledWith('Distance', expect.any(Object));
  });

  it('continues to Exercise when the HRV provider read rejects', async () => {
    prepareAvailableProvider();
    const timestamp = new Date().toISOString();
    (readRecords as jest.Mock).mockImplementation(async (recordType: string) => {
      if (recordType === 'HeartRateVariabilityRmssd') throw new Error('hrv_provider_failure');
      if (recordType === 'ExerciseSession') {
        return { records: [{
          startTime: new Date(Date.now() - 30 * 60_000).toISOString(),
          endTime: timestamp,
          metadata: { id: 'exercise-1', dataOrigin: 'test.health' }
        }] };
      }
      return { records: [] };
    });

    const payload = await syncFromHealthConnect();

    expect(payload.dataQuality.connectedMetrics?.hrv).toBe('read_failed');
    expect(payload.dataQuality.connectedMetrics?.workouts).toBe('synced');
    expect(payload.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ metricType: 'workout_minutes', sourceRecordId: 'exercise-1' })
    ]));
  });

  it('continues to later metrics when the Sleep provider read rejects', async () => {
    prepareAvailableProvider();
    const timestamp = new Date().toISOString();
    (readRecords as jest.Mock).mockImplementation(async (recordType: string) => {
      if (recordType === 'SleepSession') throw new Error('sleep_provider_failure');
      if (recordType === 'Distance') {
        return { records: [{
          startTime: new Date(Date.now() - 10 * 60_000).toISOString(),
          endTime: timestamp,
          distance: { inMeters: 900 },
          metadata: { id: 'distance-1', dataOrigin: 'test.health' }
        }] };
      }
      return { records: [] };
    });

    const payload = await syncFromHealthConnect();

    expect(payload.dataQuality.connectedMetrics?.sleep).toBe('read_failed');
    expect(payload.dataQuality.connectedMetrics?.distance).toBe('synced');
    expect(payload.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ metricType: 'distance', value: 900 })
    ]));
  });

  it('reads approved HeartRate, Hydration, OxygenSaturation, RespiratoryRate and provider sleep stages', async () => {
    prepareAvailableProvider();
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 60 * 60_000).toISOString();
    (readRecords as jest.Mock).mockImplementation(async (recordType: string) => {
      const metadata = { id: `${recordType}-1`, dataOrigin: 'test.health' };
      if (recordType === 'HeartRate') return { records: [{ startTime, endTime, metadata,
        samples: [{ time: endTime, beatsPerMinute: 64 }, { time: endTime, beatsPerMinute: 72 }] }] };
      if (recordType === 'Hydration') return { records: [{ startTime, endTime, metadata, volume: { inMilliliters: 400 } }] };
      if (recordType === 'OxygenSaturation') return { records: [{ time: endTime, metadata, percentage: 98 }] };
      if (recordType === 'RespiratoryRate') return { records: [{ time: endTime, metadata, rate: 16 }] };
      if (recordType === 'SleepSession') return { records: [{ startTime, endTime, metadata, stages: [
        { startTime, endTime, stage: 5 }
      ] }] };
      return { records: [] };
    });

    const payload = await syncFromHealthConnect();

    expect(payload.metrics).toEqual(expect.objectContaining({ heartRateAvg: 68, hydrationLiters: 0.4,
      spo2Pct: 98, respiratoryRateBrpm: 16 }));
    expect(payload.dataQuality.connectedMetrics).toEqual(expect.objectContaining({ heart_rate: 'synced',
      hydration: 'synced', spo2: 'synced', respiratory_rate: 'synced', sleep: 'synced' }));
    expect(payload.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ metricType: 'heart_rate', value: 68 }),
      expect.objectContaining({ metricType: 'hydration_ml', value: 400 }),
      expect.objectContaining({ metricType: 'spo2', value: 98 }),
      expect.objectContaining({ metricType: 'respiratory_rate', value: 16 }),
      expect.objectContaining({ metricType: 'sleep_deep_minutes', value: 60 })
    ]));
  });

  it('keeps no-permission, no-data, read-failed, and successful metrics distinct', async () => {
    prepareAvailableProvider(grant(recordTypes.filter((recordType) => recordType !== 'Steps')));
    const timestamp = new Date().toISOString();
    (readRecords as jest.Mock).mockImplementation(async (recordType: string) => {
      if (recordType === 'HeartRateVariabilityRmssd') throw new Error('hrv_provider_failure');
      if (recordType === 'Weight') return { records: [] };
      if (recordType === 'SleepSession') return { records: [{ startTime: new Date(Date.now() - 7 * 60 * 60_000).toISOString(), endTime: timestamp, metadata: { id: 'sleep-1' } }] };
      if (recordType === 'RestingHeartRate') return { records: [{ time: timestamp, beatsPerMinute: 61, metadata: { id: 'hr-1' } }] };
      if (recordType === 'ExerciseSession') return { records: [{ startTime: new Date(Date.now() - 20 * 60_000).toISOString(), endTime: timestamp, metadata: { id: 'exercise-1' } }] };
      if (recordType === 'ActiveCaloriesBurned') return { records: [{ startTime: new Date(Date.now() - 20 * 60_000).toISOString(), endTime: timestamp, energy: { inKilocalories: 120 }, metadata: { id: 'calories-1' } }] };
      if (recordType === 'Distance') return { records: [{ startTime: new Date(Date.now() - 20 * 60_000).toISOString(), endTime: timestamp, distance: { inMeters: 1000 }, metadata: { id: 'distance-1' } }] };
      return { records: [] };
    });

    const payload = await syncFromHealthConnect();

    expect(payload.dataQuality.connectedMetrics).toEqual(expect.objectContaining({
      steps: 'no_permission',
      weight: 'no_recent_data',
      hrv: 'read_failed',
      sleep: 'synced',
      heart_rate: 'synced',
      workouts: 'synced',
      calories: 'synced',
      distance: 'synced'
    }));
    expect(payload.observations).toHaveLength(5);
    expect(payload.dataQuality.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('hrv')
    ]));
  });

  it.each([
    ['RestingHeartRate', 'heart_rate'],
    ['ExerciseSession', 'workouts'],
    ['ActiveCaloriesBurned', 'calories'],
    ['Weight', 'weight'],
    ['Distance', 'distance']
  ] as const)('isolates a %s read failure without suppressing the other metric reads', async (failedRecordType, metric) => {
    prepareAvailableProvider();
    (readRecords as jest.Mock).mockImplementation(async (recordType: string) => {
      if (recordType === failedRecordType) throw new Error(`${recordType}_provider_failure`);
      return { records: [] };
    });

    const payload = await syncFromHealthConnect();

    expect(payload.dataQuality.connectedMetrics?.[metric]).toBe('read_failed');
    recordTypes
      .filter((recordType) => recordType !== failedRecordType)
      .forEach((recordType) => expect(readRecords).toHaveBeenCalledWith(recordType, expect.any(Object)));
  });

  it('fails before record reads when the provider is unavailable', async () => {
    (getSdkStatus as jest.Mock).mockResolvedValue(0);

    await expect(syncFromHealthConnect()).rejects.toThrow('health_connect_unavailable_0');
    expect(readRecords).not.toHaveBeenCalled();
  });
});
