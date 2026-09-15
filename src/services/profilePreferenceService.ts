import AsyncStorage from '@react-native-async-storage/async-storage';

export type ProfileNotificationPreferences = {
  all: boolean; hydration: boolean; nutrition: boolean; medication: boolean;
  consultation: boolean; followUp: boolean; subscription: boolean; account: boolean; general: boolean;
};
export type AppPreferences = { theme: 'dark' | 'light'; units: 'metric' | 'imperial'; language: 'English' };

export const defaultNotificationPreferences: ProfileNotificationPreferences = { all: true, hydration: true, nutrition: true, medication: true, consultation: true, followUp: true, subscription: true, account: true, general: true };
export const defaultAppPreferences: AppPreferences = { theme: 'dark', units: 'metric', language: 'English' };
const key = (accountId: string, type: string) => `fiteatsy.profile.${accountId}.${type}.v1`;
const read = async <T>(accountId: string, type: string, fallback: T): Promise<T> => { const value = await AsyncStorage.getItem(key(accountId, type)); if (!value) return fallback; try { return { ...fallback, ...JSON.parse(value) }; } catch { return fallback; } };
const write = <T>(accountId: string, type: string, value: T) => AsyncStorage.setItem(key(accountId, type), JSON.stringify(value));
export const readNotificationPreferences = (accountId: string) => read(accountId, 'notifications', defaultNotificationPreferences);
export const writeNotificationPreferences = (accountId: string, value: ProfileNotificationPreferences) => write(accountId, 'notifications', value);
export const readAppPreferences = (accountId: string) => read(accountId, 'app', defaultAppPreferences);
export const writeAppPreferences = (accountId: string, value: AppPreferences) => write(accountId, 'app', value);
