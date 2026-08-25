jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.fiteatsy.test' } }
}));

import { apiFetch, ApiClientError } from '../src/services/apiClient';

describe('shared API bounded completion', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
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
});
