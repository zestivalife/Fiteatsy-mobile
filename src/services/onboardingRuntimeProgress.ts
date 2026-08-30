import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FoodPreferenceProfile } from './foodPreferenceService';

export type OnboardingLifestyleDraft = {
  heightCm: number;
  weightKg: number;
  activityLevel: string;
  sleepHours: number;
  sleepQuality: string;
};

export type OnboardingRuntimeProgress = {
  version: 2;
  phase: 'lifestyle' | 'food' | 'recovery' | 'connect' | 'ready';
  step: number;
  lifestyle?: OnboardingLifestyleDraft;
  foodDraft?: FoodPreferenceProfile;
  saveState?: 'idle' | 'saving' | 'success' | 'error_recoverable' | 'error_nonrecoverable';
};

const keyFor = (clientId: string) => `fiteatsy.onboarding.runtime.v2:${clientId}`;

export const getOnboardingRuntimeProgress = async (clientId?: string | null): Promise<OnboardingRuntimeProgress | null> => {
  if (!clientId) return null;
  const stored = await AsyncStorage.getItem(keyFor(clientId));
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as OnboardingRuntimeProgress;
    return parsed?.version === 2 ? parsed : null;
  } catch {
    return null;
  }
};

export const setOnboardingRuntimeProgress = async (clientId: string | null | undefined, progress: Omit<OnboardingRuntimeProgress, 'version'>) => {
  if (!clientId) return;
  await AsyncStorage.setItem(keyFor(clientId), JSON.stringify({ version: 2, ...progress } satisfies OnboardingRuntimeProgress));
};

export const clearOnboardingRuntimeProgress = async (clientId?: string | null) => {
  if (!clientId) return;
  await AsyncStorage.removeItem(keyFor(clientId));
};
