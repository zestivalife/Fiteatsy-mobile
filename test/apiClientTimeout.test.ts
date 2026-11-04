jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.fiteatsy.test' } }
}));

import { authenticatedApiFetch, apiFetch, registerAccessTokenProvider, registerUnauthorizedHandler } from '../src/services/apiClient';

describe('shared API bounded completion', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    registerAccessTokenProvider(() => null);
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

  it('invalidates an existing authenticated session after a 401 response', async () => {
    const onUnauthorized = jest.fn();
    registerAccessTokenProvider(() => 'expired-session-token');
    registerUnauthorizedHandler(onUnauthorized);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'SESSION_EXPIRED' }) });

    await expect(apiFetch('/v1/platform/health-profile')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('never sends an authenticated request when the session token is absent', async () => {
    const onUnauthorized = jest.fn();
    registerAccessTokenProvider(() => null);
    registerUnauthorizedHandler(onUnauthorized);
    global.fetch = jest.fn();

    await expect(authenticatedApiFetch('/v1/external-consultants')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      serverCode: 'AUTH_REQUIRED'
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('forces the current bearer token onto authenticated requests', async () => {
    registerAccessTokenProvider(() => 'current-session-token');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ connections: [] }) });

    await authenticatedApiFetch('/v1/external-consultants', { headers: { Authorization: 'Bearer stale-token' } });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.fiteatsy.test/v1/external-consultants',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer current-session-token' }) })
    );
  });
});
