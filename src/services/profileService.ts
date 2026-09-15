import { apiFetch } from './apiClient';
import { AssessmentGender } from '../types';
export type ProfileEdit={name:string;dateOfBirthISO:string;gender:AssessmentGender;heightCm:number;currentWeightKg:number};
export type ConfirmedProfile=ProfileEdit&{version:number;updatedAt:string};
export const saveProfile=async(value:ProfileEdit)=>{const response=await apiFetch<{profile:ConfirmedProfile}>('/v1/profile',{method:'PATCH',body:JSON.stringify(value)});return response.profile;};
