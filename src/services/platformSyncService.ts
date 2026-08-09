import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncQueueItem } from '../types';
import { getIdentityScopedStorageKey, type StorageIdentity } from '../utils/identityScopedStorage';

const SYNC_QUEUE_STORAGE_KEY = 'fiteatsy.platform.syncQueue.v1';

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const getStorageKey = (identity?: StorageIdentity | null) =>
  getIdentityScopedStorageKey(SYNC_QUEUE_STORAGE_KEY, identity);

const persistQueue = async (items: SyncQueueItem[], identity?: StorageIdentity | null) => {
  const key = getStorageKey(identity);
  if (!key) return;
  await AsyncStorage.setItem(key, JSON.stringify(items));
};

export const getSyncQueue = async (identity?: StorageIdentity | null): Promise<SyncQueueItem[]> => {
  const key = getStorageKey(identity);
  if (!key) return [];
  const raw = await AsyncStorage.getItem(key);
  return safeParse<SyncQueueItem[]>(raw, []);
};

export const enqueueSyncItem = async (item: SyncQueueItem, identity?: StorageIdentity | null): Promise<void> => {
  const queue = await getSyncQueue(identity);
  await persistQueue([item, ...queue].slice(0, 500), identity);
};

export const updateSyncQueueItem = async (
  itemId: string,
  updater: (item: SyncQueueItem) => SyncQueueItem,
  identity?: StorageIdentity | null
): Promise<void> => {
  const queue = await getSyncQueue(identity);
  const next = queue.map((item) => (item.id === itemId ? updater(item) : item));
  await persistQueue(next, identity);
};

export const getPendingSyncItems = async (identity?: StorageIdentity | null): Promise<SyncQueueItem[]> => {
  const queue = await getSyncQueue(identity);
  return queue.filter((item) => item.status === 'pending' || item.status === 'failed');
};
