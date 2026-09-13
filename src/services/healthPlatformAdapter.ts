import { Platform } from 'react-native';
import type { WearableSyncPayload } from '../types';
import {
  APPLE_HEALTH_SCOPES,
  inspectAppleHealthAvailability,
  requestAppleHealthPermissions,
  syncFromAppleHealth
} from './appleHealthService';
import {
  inspectHealthConnectPermissions,
  requestHealthConnectPermissionsOnly,
  syncFromHealthConnect
} from './healthConnectService';
import { APPLE_HEALTH_QUERYABLE_METRICS, HEALTH_CONNECT_QUERYABLE_METRICS } from './healthMetricRegistry';

export type HealthPlatform = 'APPLE_HEALTH' | 'HEALTH_CONNECT';
export type HealthAppId = 'apple-health' | 'health-connect';
export type HealthProviderState = 'UNAVAILABLE' | 'AVAILABLE' | 'CONNECTED' | 'ACTION_REQUIRED' | 'ERROR';

export type HealthAccessResult = {
  supportedScopes: string[];
  grantedScopes: string[];
};

export interface HealthPlatformAdapter {
  readonly platform: HealthPlatform;
  readonly appId: HealthAppId;
  isAvailable(): Promise<boolean>;
  requestAccess(): Promise<HealthAccessResult>;
  queryAllSupportedMetrics(
    checkpoints: Record<string, string>,
    options?: { forceBackfill?: boolean }
  ): Promise<WearableSyncPayload & { anchors?: Record<string, string> }>;
  getSupportedMetricRegistry(): readonly string[];
}

export const appleHealthAdapter: HealthPlatformAdapter = {
  platform: 'APPLE_HEALTH',
  appId: 'apple-health',
  isAvailable: inspectAppleHealthAvailability,
  async requestAccess() {
    const result = await requestAppleHealthPermissions();
    return { supportedScopes: result.supportedScopes, grantedScopes: result.supportedScopes };
  },
  queryAllSupportedMetrics: (checkpoints, options) =>
    syncFromAppleHealth(checkpoints, { forceBackfill: options?.forceBackfill }),
  getSupportedMetricRegistry: () => APPLE_HEALTH_QUERYABLE_METRICS.map((metric) => metric.metricKey)
};

export const healthConnectAdapter: HealthPlatformAdapter = {
  platform: 'HEALTH_CONNECT',
  appId: 'health-connect',
  async isAvailable() {
    try {
      await inspectHealthConnectPermissions();
      return true;
    } catch {
      return false;
    }
  },
  async requestAccess() {
    const result = await requestHealthConnectPermissionsOnly();
    const grantedScopes = Object.entries(result.permissionStates)
      .filter(([, granted]) => granted)
      .map(([scope]) => scope);
    return { supportedScopes: Object.keys(result.permissionStates), grantedScopes };
  },
  queryAllSupportedMetrics: (checkpoints) => syncFromHealthConnect(checkpoints.__changes__),
  getSupportedMetricRegistry: () => HEALTH_CONNECT_QUERYABLE_METRICS.map((metric) => metric.metricKey)
};

export const getHealthPlatformAdapter = (): HealthPlatformAdapter =>
  Platform.OS === 'ios' ? appleHealthAdapter : healthConnectAdapter;
