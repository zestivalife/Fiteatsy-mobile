jest.mock('react-native', () => ({ Platform: { OS: 'android', Version: 35 } }));
jest.mock('react-native-health-connect', () => ({
  SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
  getGrantedPermissions: jest.fn(),
  getSdkStatus: jest.fn(),
  initialize: jest.fn(),
  readRecords: jest.fn(),
  requestPermission: jest.fn()
}));

import { withHealthConnectTimeout } from '../src/services/healthConnectService';

describe('Health Connect native failure boundary', () => {
  afterEach(() => jest.useRealTimers());

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
});
