jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../modules/fiteatsy-healthkit', () => ({
  enableHealthKitBackgroundDelivery: jest.fn(),
  isHealthKitAvailable: jest.fn(),
  readHealthKitChanges: jest.fn(),
  requestHealthKitAuthorization: jest.fn()
}));

import { withAppleHealthTimeout } from '../src/services/appleHealthService';

describe('Apple Health native deadline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('rejects an unresolved native promise at the configured deadline', async () => {
    const result = withAppleHealthTimeout(new Promise<never>(() => undefined), 25, 'native_timeout');
    jest.advanceTimersByTime(25);
    await expect(result).rejects.toThrow('native_timeout');
  });

  test('preserves a native result that resolves before the deadline', async () => {
    await expect(withAppleHealthTimeout(Promise.resolve('ok'), 25, 'native_timeout')).resolves.toBe('ok');
  });
});
