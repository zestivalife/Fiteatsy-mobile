const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    mockStorage.delete(key);
    return Promise.resolve();
  })
}));

jest.mock('../src/services/apiClient', () => {
  class ApiClientError extends Error {}
  return {
    ApiClientError,
    apiFetch: jest.fn(async () => {
      throw new ApiClientError('offline');
    })
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveActiveCareCase } from '../src/services/platformCaseService';
import { enqueueSyncItem, getSyncQueue } from '../src/services/platformSyncService';
import { SyncQueueItem } from '../src/types';

const syncItem = (id: string): SyncQueueItem => ({
  id,
  entityType: 'health_event',
  operation: 'enqueue',
  status: 'pending',
  attempts: 0,
  maxAttempts: 5,
  nextAttemptAtISO: null,
  createdAtISO: '2026-08-09T00:00:00.000Z',
  updatedAtISO: '2026-08-09T00:00:00.000Z',
    payload: {
      id,
      eventType: 'wearable_synced',
      eventSource: 'mobile.wearable',
      userId: 'acct_a',
      careCaseId: 'case-a',
      occurredAtISO: '2026-08-09T00:00:00.000Z',
      eventPayload: { id },
      priority: 'low',
      shouldCreateTimelineEntry: true,
      shouldEvaluateTicket: false,
      schemaVersion: 1
    },
  lastError: null
});

describe('platform scoped storage', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
  });

  it('persists active care cases under account and client scoped keys', async () => {
    await resolveActiveCareCase({ userId: 'acct_a', clientId: 'fc_a', onboarding: null });
    await resolveActiveCareCase({ userId: 'acct_b', clientId: 'fc_b', onboarding: null });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'fiteatsy.platform.activeCareCase.v1:acct_a:fc_a',
      expect.any(String)
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'fiteatsy.platform.activeCareCase.v1:acct_b:fc_b',
      expect.any(String)
    );
    expect(mockStorage.get('fiteatsy.platform.activeCareCase.v1')).toBeUndefined();
  });

  it('does not expose one account sync queue to another account', async () => {
    await enqueueSyncItem(syncItem('event-a'), { userId: 'acct_a', clientId: 'fc_a' });
    await enqueueSyncItem(syncItem('event-b'), { userId: 'acct_b', clientId: 'fc_b' });

    await expect(getSyncQueue({ userId: 'acct_a', clientId: 'fc_a' })).resolves.toMatchObject([{ id: 'event-a' }]);
    await expect(getSyncQueue({ userId: 'acct_b', clientId: 'fc_b' })).resolves.toMatchObject([{ id: 'event-b' }]);
    await expect(getSyncQueue({ userId: 'acct_c', clientId: 'fc_c' })).resolves.toEqual([]);
    expect(mockStorage.get('fiteatsy.platform.syncQueue.v1')).toBeUndefined();
  });
});
