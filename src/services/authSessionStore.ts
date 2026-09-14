import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SECURE_SESSION_KEY = 'fiteatsy.auth.session.v2';
const LEGACY_SESSION_KEY = 'nuetra.auth';

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

export const readPersistedAuthSession = async (): Promise<string | null> => {
  const secureValue = await SecureStore.getItemAsync(SECURE_SESSION_KEY, secureOptions);
  if (secureValue) return secureValue;

  // One-time migration for users installed before the canonical secure store.
  const legacyValue = await AsyncStorage.getItem(LEGACY_SESSION_KEY);
  if (!legacyValue) return null;
  await SecureStore.setItemAsync(SECURE_SESSION_KEY, legacyValue, secureOptions);
  await AsyncStorage.removeItem(LEGACY_SESSION_KEY);
  return legacyValue;
};

export const writePersistedAuthSession = async (serializedSession: string): Promise<void> => {
  await SecureStore.setItemAsync(SECURE_SESSION_KEY, serializedSession, secureOptions);
  await AsyncStorage.removeItem(LEGACY_SESSION_KEY);
};

export const clearPersistedAuthSession = async (): Promise<void> => {
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_SESSION_KEY, secureOptions),
    AsyncStorage.removeItem(LEGACY_SESSION_KEY)
  ]);
};

export const AUTH_SESSION_STORAGE_VERSION = 2;
