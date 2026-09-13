jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../modules/fiteatsy-healthkit', () => ({
  enableHealthKitBackgroundDelivery: jest.fn(),
  isHealthKitAvailable: jest.fn(),
  readHealthKitChanges: jest.fn(),
  requestHealthKitAuthorization: jest.fn()
}));

import { settleWithConcurrency, withAppleHealthTimeout } from '../src/services/appleHealthService';

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

  test('settles every metric while respecting the native-query concurrency limit', async () => {
    let active = 0;
    let maximumActive = 0;
    const result = await settleWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      if (value === 3) throw new Error('metric_failed');
      return value * 2;
    });

    expect(maximumActive).toBe(2);
    expect(result.map((item) => item.status)).toEqual([
      'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled'
    ]);
  });
});
