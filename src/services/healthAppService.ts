import { Linking, Platform } from 'react-native';
import { WearableSyncPayload } from '../types';
import { apiFetch, postJson } from './apiClient';
import { syncFromHealthConnect } from './healthConnectService';
import { syncFromHealthKit } from './healthKitService';

export type HealthAppId = 'apple-health' | 'health-connect' | 'google-fit' | 'samsung-health' | 'fitbit';
export type RecoveryConnectionState =
  | 'connected'
  | 'partial'
  | 'calibrating'
  | 'no_recent_data'
  | 'no_signals'
  | 'permission_missing';

export type HealthAppOption = {
  id: HealthAppId;
  label: string;
  subtitle: string;
};

const fallbackApps: HealthAppOption[] = [
  { id: 'apple-health', label: 'Apple Health', subtitle: 'iPhone wellness and activity data' },
  { id: 'health-connect', label: 'Health Connect', subtitle: 'Android unified recovery signals' }
];

export const getAvailableHealthApps = async (): Promise<HealthAppOption[]> => {
  if (Platform.OS === 'android') {
    return [{ id: 'health-connect', label: 'Health Connect', subtitle: 'Android unified recovery signals' }];
  }

  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const payload = await apiFetch<{ apps?: HealthAppOption[] }>(`/v1/wearables/health-apps?platform=${platform}`);
    if (Array.isArray(payload.apps) && payload.apps.length > 0) {
      return payload.apps;
    }
    return fallbackApps;
  } catch {
    return fallbackApps;
  }
};

export const connectHealthApp = async (appId: HealthAppId) => {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return postJson<{
    connected: boolean;
    connectionId: string;
    appId: HealthAppId;
    appName: string;
    provider: string;
    connectedAtISO: string;
    status: 'connected' | 'paused';
  }>('/v1/wearables/connect-app', {
    appId,
    platform
  }).catch(() => {
    throw new Error('health_app_connect_failed');
  });
};

export const syncConnectedHealthApp = async (appId: HealthAppId): Promise<WearableSyncPayload> => {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  // Android: source-of-truth sync must read directly from Health Connect.
  if (platform === 'android' && ['health-connect', 'google-fit', 'samsung-health'].includes(appId)) {
    return syncFromHealthConnect();
  }

  if (platform === 'ios' && appId === 'apple-health') {
    return syncFromHealthKit();
  }

  throw new Error('apple_health_native_reader_not_available');
};

export const openHealthConnectPlayStore = async () => {
  if (Platform.OS !== 'android') return;
  const marketUrl = 'market://details?id=com.google.android.apps.healthdata';
  const webUrl = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';

  const canOpenMarket = await Linking.canOpenURL(marketUrl);
  await Linking.openURL(canOpenMarket ? marketUrl : webUrl);
};

const metricPriority: Array<keyof NonNullable<WearableSyncPayload['dataQuality']['connectedMetrics']>> = [
  'steps',
  'sleep',
  'heart_rate',
  'hrv',
  'workouts'
];

export const classifyRecoveryConnectionState = (payload: WearableSyncPayload): RecoveryConnectionState => {
  const connectedMetrics = payload.dataQuality.connectedMetrics ?? {};
  const statuses = metricPriority.map((key) => connectedMetrics[key] ?? 'missing');
  const syncedCount = statuses.filter((status) => status === 'synced').length;
  const noPermissionCount = statuses.filter((status) => status === 'no_permission').length;
  const noRecentCount = statuses.filter((status) => status === 'no_recent_data').length;

  if (noPermissionCount > 0 && syncedCount === 0) {
    return 'permission_missing';
  }
  if (syncedCount >= 4) {
    return 'connected';
  }
  if (syncedCount >= 2) {
    return 'partial';
  }
  if (syncedCount === 1) {
    return 'calibrating';
  }
  if (noRecentCount >= 3) {
    return 'no_recent_data';
  }
  return 'no_signals';
};
