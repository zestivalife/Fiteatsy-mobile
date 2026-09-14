jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.fiteatsy.test' } }
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }) }
}));

import { loginWithPin } from '../src/services/authService';

describe('authentication request termination', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('aborts a PIN request that never settles and returns a terminal timeout', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as typeof fetch;

    const request = loginWithPin({ mobile: '+919876543210', pin: '123456' });
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    await jest.advanceTimersByTimeAsync(15_001);
    await assertion;
  });
});
