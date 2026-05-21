import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type HealthAppId = 'apple-health' | 'health-connect' | 'google-fit' | 'samsung-health' | 'fitbit';

export type HealthAppOption = {
  id: HealthAppId;
  label: string;
  subtitle: string;
};

const fallbackApps: HealthAppOption[] = [
  { id: 'apple-health', label: 'Apple Health', subtitle: 'iPhone wellness and activity data' },
  { id: 'health-connect', label: 'Health Connect', subtitle: 'Android unified health data' },
  { id: 'google-fit', label: 'Google Fit', subtitle: 'Activity, steps, and heart trends' },
  { id: 'samsung-health', label: 'Samsung Health', subtitle: 'Samsung device health insights' },
  { id: 'fitbit', label: 'Fitbit', subtitle: 'Sleep and movement summaries' }
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
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
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
      appId: HealthAppId;
      appName: string;
      provider: string;
      connectedAtISO: string;
    };
  } catch {
    return {
      connected: true,
      appId,
      appName: fallbackApps.find((item) => item.id === appId)?.label ?? 'Health App',
      provider: 'Local Health Adapter',
      connectedAtISO: new Date().toISOString()
    };
  }
};
