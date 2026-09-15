import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiResponse } from './apiClient';
import { getIdentityScopedStorageKey } from '../utils/identityScopedStorage';

export const GRIEVANCE_CATEGORIES=['App / Technical Issue','Login / Account','Health Sync','Apple Health / Health Connect','Nutrition','Diet Plan','Health Reports / Lab Reports','Subscription / Payment','Notifications','Profile','Consultant / Care','Privacy / Consent','Other'] as const;
export type GrievanceDraft={clientRequestId:string;category:string;subject:string;description:string;contactPreference:string;attachment:null|{uri:string;name:string;mimeType:string};updatedAtISO:string};
const uuid=()=>`${Date.now().toString(16).padStart(8,'0').slice(-8)}-0000-4000-8000-${Math.random().toString(16).slice(2,14).padEnd(12,'0')}`;
const key=(accountId:string)=>{const scoped=getIdentityScopedStorageKey('fiteatsy.grievance.draft.v1',{userId:accountId,clientId:accountId});if(!scoped)throw new Error('Authenticated account identity is required for grievance drafts.');return scoped;};
export const newGrievanceDraft=():GrievanceDraft=>({clientRequestId:uuid(),category:'',subject:'',description:'',contactPreference:'',attachment:null,updatedAtISO:new Date().toISOString()});
export const loadGrievanceDraft=async(accountId:string)=>{const raw=await AsyncStorage.getItem(key(accountId));return raw?JSON.parse(raw) as GrievanceDraft:null;};
export const saveGrievanceDraft=async(accountId:string,draft:GrievanceDraft)=>AsyncStorage.setItem(key(accountId),JSON.stringify({...draft,updatedAtISO:new Date().toISOString()}));
export const clearGrievanceDraft=async(accountId:string)=>AsyncStorage.removeItem(key(accountId));
export const submitGrievance=async(draft:GrievanceDraft,currentRoute='GrievanceForm')=>{const network=await NetInfo.fetch();const form=new FormData();const metadata={clientRequestId:draft.clientRequestId,category:draft.category,subject:draft.subject.trim(),description:draft.description.trim(),contactPreference:draft.contactPreference||undefined,platform:Platform.OS,appVersion:Constants.expoConfig?.version,buildNumber:Platform.OS==='ios'?Constants.expoConfig?.ios?.buildNumber:String(Constants.expoConfig?.android?.versionCode??''),runtimeVersion:Constants.expoConfig?.runtimeVersion?.toString(),osVersion:String(Platform.Version),deviceModel:String((Platform.constants as any)?.Model??(Platform.constants as any)?.model??'unknown'),route:currentRoute,networkType:network.type,correlationId:uuid()};Object.entries(metadata).forEach(([k,v])=>{if(v!=null&&v!=='')form.append(k,String(v));});if(draft.attachment)form.append('attachment',{uri:draft.attachment.uri,name:draft.attachment.name,type:draft.attachment.mimeType} as any);const response=await apiResponse('/v1/grievances',{method:'POST',body:form,timeoutMs:20000});return response.json() as Promise<{grievance:{id:string;referenceId:string}}>;};
