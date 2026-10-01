import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';

export type HealthKitSample = {
  id: string; metric: string; value: number; unit: string; startAtISO: string; endAtISO: string;
  sourceApplication?: string; sourceVersion?: string; sourceProductType?: string;
  device?: string; sleepStage?: string; measurementMethod?: string;
  metadata?: Record<string, unknown>;
};

export type HealthKitReadResult = { samples: HealthKitSample[]; deletedIds: string[]; anchor: string; hasMore: boolean };
export type HealthKitStatisticsResult = { value: number; startAtISO: string; endAtISO: string };
export type HealthKitActivitySummary = {
  dateISO: string;
  move: { value: number; goal: number; unit: 'kcal' };
  exercise: { value: number; goal: number; unit: 'min' };
  stand: { value: number; goal: number; unit: 'hr' };
};
type FiteatsyHealthKitNativeModule = {
  isAvailable(): Promise<boolean>;
  getAuthorizationRequestStatus(metrics: string[]): Promise<HealthKitAuthorizationInspection>;
  requestAuthorization(metrics: string[]): Promise<HealthKitAuthorizationResult>;
  readChanges(metric: string, anchor: string | null, startAtISO: string | null): Promise<HealthKitReadResult>;
  readCumulativeStatistics(metric: string, startAtISO: string, endAtISO: string): Promise<HealthKitStatisticsResult>;
  readActivitySummary(dateISO: string): Promise<HealthKitActivitySummary | null>;
  enableBackgroundDelivery(metrics: string[]): Promise<boolean>;
  addListener(eventName: 'onHealthDataChanged', listener: (event: { metric?: string }) => void): EventSubscription;
};

export type HealthKitAuthorizationResult = {
  requestCompleted: boolean;
  requestedScopes: string[];
  supportedScopes: string[];
  unsupportedScopes: string[];
  requestStatus: 'should_request' | 'unnecessary' | 'unknown';
};

export type HealthKitAuthorizationInspection = {
  available: boolean;
  requestedScopes: string[];
  supportedScopes: string[];
  unsupportedScopes: string[];
  requestStatus: 'should_request' | 'unnecessary' | 'unknown';
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

export const requestHealthKitAuthorization = async (metrics: string[]): Promise<HealthKitAuthorizationResult> => {
  const native = nativeModule();
  if (!native) throw new Error('FITEATSY_HEALTHKIT_NATIVE_MODULE_MISSING');
  return native.requestAuthorization(metrics);
};
export const inspectHealthKitAuthorization = async (metrics: string[]): Promise<HealthKitAuthorizationInspection> => {
  const native = nativeModule();
  if (!native) throw new Error('FITEATSY_HEALTHKIT_NATIVE_MODULE_MISSING');
  return native.getAuthorizationRequestStatus(metrics);
};
export const readHealthKitChanges = (metric: string, anchor?: string, startAtISO?: string): Promise<HealthKitReadResult> =>
  nativeModule()?.readChanges(metric, anchor ?? null, startAtISO ?? null)
    ?? Promise.reject(new Error('FITEATSY_HEALTHKIT_NATIVE_MODULE_MISSING'));
export const readHealthKitCumulativeStatistics = (metric: string, startAtISO: string, endAtISO: string): Promise<HealthKitStatisticsResult> => {
  const native = nativeModule();
  if (!native?.readCumulativeStatistics) return Promise.reject(new Error('FITEATSY_HEALTHKIT_STATISTICS_UNAVAILABLE'));
  return native.readCumulativeStatistics(metric, startAtISO, endAtISO);
};
export const readHealthKitActivitySummary = (dateISO: string): Promise<HealthKitActivitySummary | null> => {
  const native = nativeModule();
  if (!native?.readActivitySummary) return Promise.reject(new Error('FITEATSY_HEALTHKIT_ACTIVITY_SUMMARY_UNAVAILABLE'));
  return native.readActivitySummary(dateISO);
};
export const enableHealthKitBackgroundDelivery = (metrics: string[]): Promise<boolean> =>
  nativeModule()?.enableBackgroundDelivery(metrics) ?? Promise.resolve(false);

export const subscribeToHealthKitChanges = (listener: (event: { metric?: string }) => void): EventSubscription | null =>
  nativeModule()?.addListener('onHealthDataChanged', listener) ?? null;
