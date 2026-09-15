import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import { apiFetch } from './apiClient';

export type ProfileNotificationPreferences = {
  all: boolean; hydration: boolean; nutrition: boolean; medication: boolean;
  consultation: boolean; followUp: boolean; subscription: boolean; account: boolean; general: boolean;
};
export type NotificationDeliveryState='APP_ENABLED_OS_ALLOWED'|'APP_ENABLED_OS_DENIED'|'APP_DISABLED'|'OS_NOT_DETERMINED';
export type AppPreferences = { theme: 'dark' | 'light'; units: 'metric' | 'imperial'; language: 'English' };

export const defaultNotificationPreferences: ProfileNotificationPreferences = { all: true, hydration: true, nutrition: true, medication: true, consultation: true, followUp: true, subscription: true, account: true, general: true };
export const defaultAppPreferences: AppPreferences = { theme: 'dark', units: 'metric', language: 'English' };
export const notificationDeliveryCapabilities={hydration:'DELIVERY_NOT_IMPLEMENTED',nutrition:'DELIVERY_NOT_IMPLEMENTED',medication:'DELIVERY_SUPPORTED',consultation:'PREFERENCE_SUPPORTED',followUp:'PREFERENCE_SUPPORTED',subscription:'PREFERENCE_SUPPORTED',account:'PREFERENCE_SUPPORTED',general:'PREFERENCE_SUPPORTED'} as const;
const key = (accountId: string, type: string) => `fiteatsy.profile.${accountId}.${type}.v1`;
const read = async <T>(accountId: string, type: string, fallback: T): Promise<T> => { const value = await AsyncStorage.getItem(key(accountId, type)); if (!value) return fallback; try { return { ...fallback, ...JSON.parse(value) }; } catch { return fallback; } };
const write = <T>(accountId: string, type: string, value: T) => AsyncStorage.setItem(key(accountId, type), JSON.stringify(value));
export const readNotificationPreferences = (accountId: string) => read(accountId, 'notifications', defaultNotificationPreferences);
export const isNotificationPreferenceEnabled=async(accountId:string,preference:Exclude<keyof ProfileNotificationPreferences,'all'>)=>{const value=await readNotificationPreferences(accountId);return value.all&&value[preference];};
export const writeNotificationPreferences = (accountId: string, value: ProfileNotificationPreferences) => write(accountId, 'notifications', value);
export const refreshNotificationPreferences=async(accountId:string)=>{const response=await apiFetch<{preferences:ProfileNotificationPreferences&{version:number;updatedAt:string}}>('/v1/preferences/notifications');const {version,updatedAt,...preferences}=response.preferences;await writeNotificationPreferences(accountId,preferences);return{preferences,version,updatedAt};};
export const saveNotificationPreferences=async(accountId:string,preferences:ProfileNotificationPreferences,version?:number)=>{const response=await apiFetch<{preferences:ProfileNotificationPreferences&{version:number;updatedAt:string}}>('/v1/preferences/notifications',{method:'PUT',body:JSON.stringify({...preferences,version})});const {version:nextVersion,updatedAt,...saved}=response.preferences;await writeNotificationPreferences(accountId,saved);return{preferences:saved,version:nextVersion,updatedAt};};
export const getNotificationDeliveryState=async(appEnabled:boolean):Promise<NotificationDeliveryState>=>{if(!appEnabled)return'APP_DISABLED';const permission=await Notifications.getPermissionsAsync();if(permission.status==='granted')return'APP_ENABLED_OS_ALLOWED';if(permission.status==='undetermined')return'OS_NOT_DETERMINED';return'APP_ENABLED_OS_DENIED';};
export const openNotificationSettings=()=>Linking.openSettings();
export const readAppPreferences = (accountId: string) => read(accountId, 'app', defaultAppPreferences);
export const writeAppPreferences = (accountId: string, value: AppPreferences) => write(accountId, 'app', value);
