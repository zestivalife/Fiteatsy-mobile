import{apiFetch}from'./apiClient';
export type ConsultantConsentStatus='GRANTED'|'REVOKED'|'PENDING'|'NOT_REQUESTED';
export type ConsultantConsent={status:ConsultantConsentStatus;policyVersion:string;source:string;grantedAt:string|null;revokedAt:string|null;version:number;updatedAt:string|null};
export const getConsultantConsent=async()=>{const r=await apiFetch<{consent:ConsultantConsent}>('/v1/preferences/consultant-access');return r.consent;};
export const updateConsultantConsent=async(status:'GRANTED'|'REVOKED')=>{const r=await apiFetch<{consent:ConsultantConsent}>('/v1/preferences/consultant-access',{method:'PUT',body:JSON.stringify({status,policyVersion:'CONSULTANT_ACCESS_V1'})});return r.consent;};
