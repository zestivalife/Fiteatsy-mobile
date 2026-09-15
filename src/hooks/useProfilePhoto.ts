import{useEffect,useSyncExternalStore}from'react';import{getProfilePhotoSnapshot,hydrateProfilePhoto,subscribeProfilePhoto}from'../services/profilePhotoService';
export const useProfilePhoto=(accountId:string)=>{useEffect(()=>{if(accountId)void hydrateProfilePhoto(accountId);},[accountId]);return useSyncExternalStore(subscribeProfilePhoto,()=>getProfilePhotoSnapshot(accountId),()=>null);};
