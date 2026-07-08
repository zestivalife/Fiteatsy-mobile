import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncQueueItem } from '../types';

const SYNC_QUEUE_STORAGE_KEY = 'fiteatsy.platform.syncQueue.v1';

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const persistQueue = async (items: SyncQueueItem[]) => {
  await AsyncStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(items));
};

export const getSyncQueue = async (): Promise<SyncQueueItem[]> => {
  const raw = await AsyncStorage.getItem(SYNC_QUEUE_STORAGE_KEY);
  return safeParse<SyncQueueItem[]>(raw, []);
};

export const enqueueSyncItem = async (item: SyncQueueItem): Promise<void> => {
  const queue = await getSyncQueue();
  await persistQueue([item, ...queue].slice(0, 500));
};

export const updateSyncQueueItem = async (
  itemId: string,
  updater: (item: SyncQueueItem) => SyncQueueItem
): Promise<void> => {
  const queue = await getSyncQueue();
  const next = queue.map((item) => (item.id === itemId ? updater(item) : item));
  await persistQueue(next);
};

export const getPendingSyncItems = async (): Promise<SyncQueueItem[]> => {
  const queue = await getSyncQueue();
  return queue.filter((item) => item.status === 'pending' || item.status === 'failed');
};
