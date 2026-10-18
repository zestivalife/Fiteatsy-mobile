import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WellnessSnapshot } from '../types';
import { runHealthSync, type HealthSyncResult } from './healthSyncManager';
import { getWearableBackgroundConfig } from './wearableBackgroundSync';

const LAST_SYNC_KEY_PREFIX = '@fiteatsy/wearable-last-lifecycle-sync:';
export const HEALTH_LIFECYCLE_SYNC_INTERVAL_MS = 15 * 60_000;

let lifecycleSync: Promise<HealthSyncResult | null> | null = null;

export const runConfiguredHealthLifecycleSync = async (input: {
  fiteatsyClientId: string;
  wellness: WellnessSnapshot;
  trigger: 'FOREGROUND_RESUME' | 'RETRY';
  force?: boolean;
}): Promise<HealthSyncResult | null> => {
  if (lifecycleSync) return lifecycleSync;
  lifecycleSync = (async () => {
    const config = await getWearableBackgroundConfig();
    if (!config || config.fiteatsyClientId !== input.fiteatsyClientId) return null;
    const lastKey = `${LAST_SYNC_KEY_PREFIX}${input.fiteatsyClientId}`;
    const lastRaw = await AsyncStorage.getItem(lastKey);
    const last = Number(lastRaw);
    if (!input.force && Number.isFinite(last) && Date.now() - last < HEALTH_LIFECYCLE_SYNC_INTERVAL_MS) return null;
    const result = await runHealthSync(config.appId, input.wellness, {
      connectionId: config.connectionId,
      provider: config.provider,
      trigger: input.trigger
    });
    await AsyncStorage.setItem(lastKey, String(Date.now()));
    return result;
  })().finally(() => { lifecycleSync = null; });
  return lifecycleSync;
};
