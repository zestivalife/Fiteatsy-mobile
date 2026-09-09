import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type HealthKitSample = {
  id: string; metric: string; value: number; unit: string; startAtISO: string; endAtISO: string;
  sourceApplication?: string; device?: string; sleepStage?: string; measurementMethod?: string;
  metadata?: Record<string, unknown>;
};

export type HealthKitReadResult = { samples: HealthKitSample[]; deletedIds: string[]; anchor: string };
type FiteatsyHealthKitNativeModule = {
  isAvailable(): Promise<boolean>;
  requestAuthorization(metrics: string[]): Promise<{ grantedScopes: string[] }>;
  readChanges(metric: string, anchor: string | null, startAtISO: string | null): Promise<HealthKitReadResult>;
  enableBackgroundDelivery(metrics: string[]): Promise<boolean>;
};

const nativeModule = (): FiteatsyHealthKitNativeModule | null =>
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<FiteatsyHealthKitNativeModule>('FiteatsyHealthKit')
    : null;

export const isHealthKitAvailable = async (): Promise<boolean> => {
  const native = nativeModule();
  if (!native) return false;
  try { return await native.isAvailable(); } catch { return false; }
};

export const requestHealthKitAuthorization = async (metrics: string[]): Promise<{ grantedScopes: string[] }> => {
  const native = nativeModule();
  if (!native) throw new Error('FITEATSY_HEALTHKIT_NATIVE_MODULE_MISSING');
  return native.requestAuthorization(metrics);
};
export const readHealthKitChanges = (metric: string, anchor?: string, startAtISO?: string): Promise<HealthKitReadResult> =>
  nativeModule()?.readChanges(metric, anchor ?? null, startAtISO ?? null)
    ?? Promise.reject(new Error('FITEATSY_HEALTHKIT_NATIVE_MODULE_MISSING'));
export const enableHealthKitBackgroundDelivery = (metrics: string[]): Promise<boolean> =>
  nativeModule()?.enableBackgroundDelivery(metrics) ?? Promise.resolve(false);
