import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch,apiResponse } from './apiClient';
import { getIdentityScopedStorageKey } from '../utils/identityScopedStorage';
const key=(accountId:string)=>{const scoped=getIdentityScopedStorageKey('fiteatsy.profile.photo.v1',{userId:accountId,clientId:accountId});if(!scoped)throw new Error('Authenticated account identity is required for profile photos.');return scoped;};
export const readCachedProfilePhoto=(accountId:string)=>AsyncStorage.getItem(key(accountId));
export const cacheProfilePhoto=(accountId:string,dataUri:string)=>AsyncStorage.setItem(key(accountId),dataUri);
export const hydrateProfilePhoto=async(accountId:string)=>{const cached=await readCachedProfilePhoto(accountId);if(cached)return cached;try{const data=await apiFetch<{dataUri:string}>('/v1/profile/photo/data');await cacheProfilePhoto(accountId,data.dataUri);return data.dataUri;}catch{return null;}};
export const uploadProfilePhoto=async(input:{accountId:string;uri:string;mimeType:string;fileName:string;dataUri:string})=>{const form=new FormData();form.append('photo',{uri:input.uri,type:input.mimeType,name:input.fileName} as any);await apiResponse('/v1/profile/photo',{method:'PUT',body:form,timeoutMs:30000});await cacheProfilePhoto(input.accountId,input.dataUri);return input.dataUri;};
