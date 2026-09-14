jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.fiteatsy.test' } }
}));

import {
  apiFetch,
  registerAccessTokenProvider,
  registerNetworkReachabilityProvider,
  registerUnauthorizedHandler
} from '../src/services/apiClient';

describe('shared API bounded completion', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    registerAccessTokenProvider(() => null);
    registerNetworkReachabilityProvider(null);
    registerUnauthorizedHandler(null);
  });

  it('classifies a request that never settles as TIMEOUT', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as typeof fetch;
    const request = apiFetch('/v1/health', { timeoutMs: 50 });
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    await jest.advanceTimersByTimeAsync(51);
    await assertion;
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [500, 'SERVER_ERROR']
  ])('classifies HTTP %s', async (status, code) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status, json: async () => ({ message: 'classified' }) });
    await expect(apiFetch('/v1/classification')).rejects.toMatchObject({ code, status });
  });

  it('preserves a structured backend error code for contract-specific UI states', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'DIET_PLAN_NOT_FOUND', message: 'No published plan.' }),
    });

    await expect(apiFetch('/v1/platform/nutrition-experience')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      serverCode: 'DIET_PLAN_NOT_FOUND',
      message: 'No published plan.',
    });
  });

  it.each([true, null])('does not claim the device is offline when reachability is %s', async (reachable) => {
    registerNetworkReachabilityProvider(() => reachable);
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(apiFetch('/v1/reports')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      serverCode: 'SERVICE_UNREACHABLE'
    });
  });

  it('reports offline only when transport evidence is definitively offline', async () => {
    registerNetworkReachabilityProvider(() => false);
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(apiFetch('/v1/reports')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      serverCode: 'DEVICE_OFFLINE'
    });
  });

  it('does not destroy a durable session for an unclassified 401 response', async () => {
    const onUnauthorized = jest.fn();
    registerAccessTokenProvider(() => 'expired-session-token');
    registerUnauthorizedHandler(onUnauthorized);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'ACCESS_TOKEN_REJECTED' }) });

    await expect(apiFetch('/v1/platform/health-profile')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ status: 401, serverCode: 'ACCESS_TOKEN_REJECTED' });
  });
});
