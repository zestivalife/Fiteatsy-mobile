import { requireNativeModule } from 'expo-modules-core';

export type HealthKitSample = {
  id: string; metric: string; value: number; unit: string; startAtISO: string; endAtISO: string;
  sourceApplication?: string; device?: string; sleepStage?: string; measurementMethod?: string;
  metadata?: Record<string, unknown>;
};

export type HealthKitReadResult = { samples: HealthKitSample[]; deletedIds: string[]; anchor: string };
const Native = requireNativeModule('FiteatsyHealthKit');
export const isHealthKitAvailable = (): Promise<boolean> => Native.isAvailable();
export const requestHealthKitAuthorization = (metrics: string[]): Promise<{ grantedScopes: string[] }> => Native.requestAuthorization(metrics);
export const readHealthKitChanges = (metric: string, anchor?: string, startAtISO?: string): Promise<HealthKitReadResult> =>
  Native.readChanges(metric, anchor ?? null, startAtISO ?? null);
export const enableHealthKitBackgroundDelivery = (metrics: string[]): Promise<boolean> => Native.enableBackgroundDelivery(metrics);
