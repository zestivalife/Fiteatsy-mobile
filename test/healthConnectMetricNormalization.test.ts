jest.mock('react-native', () => ({ Platform: { OS: 'android', Version: 35 } }));
jest.mock('react-native-health-connect', () => ({
  SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
  getGrantedPermissions: jest.fn(), getSdkStatus: jest.fn(), initialize: jest.fn(),
  getChanges: jest.fn(), readRecords: jest.fn(), requestPermission: jest.fn()
}));

import { getGrantedPermissions, getSdkStatus, initialize, requestPermission } from 'react-native-health-connect';
import { normalizeHealthConnectRecord, requestHealthConnectPermissionsOnly } from '../src/services/healthConnectService';

const metadata = { id: 'provider-1', dataOrigin: 'com.example.health', recordingMethod: 1 };

describe('Health Connect canonical metric normalization', () => {
  it('requests approved record, history and background permissions on Android 15', async () => {
    (getSdkStatus as jest.Mock).mockResolvedValue(3);
    (initialize as jest.Mock).mockResolvedValue(true);
    (requestPermission as jest.Mock).mockResolvedValue([]);
    (getGrantedPermissions as jest.Mock).mockResolvedValue([]);
    await requestHealthConnectPermissionsOnly();
    expect(requestPermission).toHaveBeenCalledWith(expect.arrayContaining([
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'Hydration' },
      { accessType: 'read', recordType: 'OxygenSaturation' },
      { accessType: 'read', recordType: 'RespiratoryRate' },
      { accessType: 'read', recordType: 'ReadHealthDataHistory' },
      { accessType: 'read', recordType: 'BackgroundAccessPermission' }
    ]));
  });

  it.each([
    ['Hydration', { volume: { inMilliliters: 475 } }, 'hydration_ml', 475, 'ml'],
    ['OxygenSaturation', { percentage: 97.5 }, 'spo2', 97.5, 'pct'],
    ['RespiratoryRate', { rate: 15.25 }, 'respiratory_rate', 15.25, 'brpm']
  ] as const)('normalizes %s with its source identity and canonical unit', (recordType, fields, metricType, value, unit) => {
    const observation = normalizeHealthConnectRecord({ recordType, time: '2026-11-17T08:00:00.000Z',
      startTime: '2026-11-17T07:55:00.000Z', endTime: '2026-11-17T08:00:00.000Z', metadata, ...fields })[0];
    expect(observation).toEqual(expect.objectContaining({ metricType, value, unit, sourceRecordId: 'provider-1' }));
    expect(observation.sourceMetadata).toEqual(expect.objectContaining({ sourceApplication: 'com.example.health' }));
  });

  it('uses a truthful interval average for a sampled heart-rate record', () => {
    const [observation] = normalizeHealthConnectRecord({ recordType: 'HeartRate',
      startTime: '2026-11-17T07:59:00.000Z', endTime: '2026-11-17T08:00:00.000Z', metadata,
      samples: [{ time: '2026-11-17T07:59:10.000Z', beatsPerMinute: 60 },
        { time: '2026-11-17T07:59:50.000Z', beatsPerMinute: 72 }] });
    expect(observation).toEqual(expect.objectContaining({ metricType: 'heart_rate', value: 66, unit: 'bpm' }));
    expect(observation.sourceMetadata).toEqual(expect.objectContaining({ measurementMethod: 'interval_average' }));
  });

  it('preserves a sleep session and emits only provider-supplied stages', () => {
    const observations = normalizeHealthConnectRecord({ recordType: 'SleepSession',
      startTime: '2026-11-16T22:00:00.000Z', endTime: '2026-11-17T06:00:00.000Z', metadata,
      stages: [
        { startTime: '2026-11-16T22:00:00.000Z', endTime: '2026-11-16T23:00:00.000Z', stage: 4 },
        { startTime: '2026-11-16T23:00:00.000Z', endTime: '2026-11-17T00:00:00.000Z', stage: 5 },
        { startTime: '2026-11-17T00:00:00.000Z', endTime: '2026-11-17T00:30:00.000Z', stage: 6 }
      ] });
    expect(observations.map((item) => item.metricType)).toEqual([
      'sleep_minutes', 'sleep_core_minutes', 'sleep_deep_minutes', 'sleep_rem_minutes'
    ]);
    expect(new Set(observations.map((item) => item.syncKey)).size).toBe(observations.length);
    expect(observations.every((item) => item.sourceRecordId === 'provider-1')).toBe(true);
  });

  it('rejects malformed or non-positive native values rather than fabricating data', () => {
    expect(normalizeHealthConnectRecord({ recordType: 'Hydration', endTime: 'invalid',
      volume: { inMilliliters: 0 }, metadata })).toEqual([]);
  });
});
