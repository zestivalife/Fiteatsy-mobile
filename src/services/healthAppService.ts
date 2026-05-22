import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { WearableSyncPayload } from '../types';
import { syncFromHealthConnect } from './healthConnectService';

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

const getApiBaseUrl = () => {
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) return fromExtra;

  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (!host) return 'http://localhost:4001';
  return `http://${host}:4001`;
};

const apiBaseUrl = getApiBaseUrl();

export const getAvailableHealthApps = async (): Promise<HealthAppOption[]> => {
  if (Platform.OS === 'android') {
    return [{ id: 'health-connect', label: 'Health Connect', subtitle: 'Android unified recovery signals' }];
  }

  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const response = await fetch(`${apiBaseUrl}/v1/wearables/health-apps?platform=${platform}`);
    if (!response.ok) {
      throw new Error('failed_health_app_fetch');
    }
    const payload = (await response.json()) as { apps?: HealthAppOption[] };
    if (Array.isArray(payload.apps) && payload.apps.length > 0) {
      return payload.apps;
    }
    return fallbackApps;
  } catch {
    return fallbackApps;
  }
};

export const connectHealthApp = async (appId: HealthAppId) => {
  if (Platform.OS === 'android' && appId === 'health-connect') {
    return {
      connected: true,
      connectionId: `health-connect-${Date.now()}`,
      appId: 'health-connect' as const,
      appName: 'Health Connect',
      provider: 'Health Connect',
      connectedAtISO: new Date().toISOString(),
      status: 'connected' as const
    };
  }

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const response = await fetch(`${apiBaseUrl}/v1/wearables/connect-app`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId,
      platform,
      userId: 'emp-demo-1'
    })
  });

  if (!response.ok) {
    throw new Error('health_app_connect_failed');
  }

  return (await response.json()) as {
    connected: boolean;
    connectionId: string;
    appId: HealthAppId;
    appName: string;
    provider: string;
    connectedAtISO: string;
    status: 'connected' | 'paused';
  };
};

export const syncConnectedHealthApp = async (appId: HealthAppId): Promise<WearableSyncPayload> => {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  // Android: source-of-truth sync must read directly from Health Connect.
  if (platform === 'android' && ['health-connect', 'google-fit', 'samsung-health'].includes(appId)) {
    return syncFromHealthConnect();
  }

  const body = {
    userId: 'emp-demo-1',
    appId,
    platform
  };

  const response = await fetch(`${apiBaseUrl}/v1/wearables/sync/live`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error('live_sync_failed');
  }

const payload = (await response.json()) as { payload: WearableSyncPayload };
  return payload.payload;
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
