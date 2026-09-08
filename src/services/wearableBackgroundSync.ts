import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import type { HealthAppId } from './healthAppService';
import { runHealthSync } from './healthSyncManager';
import type { GovernedProvider } from './wearablePlatformService';
import type { WellnessSnapshot } from '../types';

const TASK = 'fiteatsy-governed-wearable-sync';
const CONFIG_KEY = '@fiteatsy/wearable-background-config';
const RETRY_KEY = '@fiteatsy/wearable-retry-state';
const MAX_RETRIES = 5;

type BackgroundConfig = { connectionId: string; provider: GovernedProvider; appId: HealthAppId };
type RetryState = { attempts: number; nextAttemptAt: number; safeErrorCode: string };

const neutralWellness: WellnessSnapshot = { focusMinutes:0,breathingMinutes:0,movementMinutes:0,hydrationLiters:0,
  hydrationGoalLiters:0,heartRateAvg:0,sleepHours:0,moodScore:0,recoveryScore:0,nourishmentScore:0,wellnessScore:0,
  hrvStatus:'Unavailable',stressScore:0,availability:'not_synced',lastUpdatedISO:null,source:null };

const retryable = (code: string) => !/permission|consent|unsupported|unavailable|invalid/i.test(code);

if (!TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask(TASK, async () => {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (!raw) return BackgroundTask.BackgroundTaskResult.Success;
    const config = JSON.parse(raw) as BackgroundConfig;
    const retryRaw = await AsyncStorage.getItem(RETRY_KEY);
    const retry = retryRaw ? JSON.parse(retryRaw) as RetryState : null;
    if (retry && Date.now() < retry.nextAttemptAt) return BackgroundTask.BackgroundTaskResult.Success;
    try {
      await runHealthSync(config.appId, neutralWellness, { connectionId:config.connectionId,
        provider:config.provider,trigger:retry ? 'RETRY' : 'BACKGROUND' });
      await AsyncStorage.removeItem(RETRY_KEY);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0,100) : 'unknown_error';
      if (!retryable(code)) { await AsyncStorage.removeItem(RETRY_KEY); return BackgroundTask.BackgroundTaskResult.Failed; }
      const attempts = Math.min(MAX_RETRIES, (retry?.attempts ?? 0) + 1);
      const nextAttemptAt = Date.now() + Math.min(24 * 60 * 60_000, 15 * 60_000 * 2 ** (attempts - 1));
      await AsyncStorage.setItem(RETRY_KEY, JSON.stringify({ attempts,nextAttemptAt,safeErrorCode:code } satisfies RetryState));
      return attempts >= MAX_RETRIES ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
    }
  });
}

export const registerWearableBackgroundSync = async (config: BackgroundConfig) => {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  if (!(await TaskManager.isTaskRegisteredAsync(TASK))) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 60 });
};

export const unregisterWearableBackgroundSync = async () => {
  await AsyncStorage.multiRemove([CONFIG_KEY, RETRY_KEY]);
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
};
