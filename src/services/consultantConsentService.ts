import { apiFetch } from './apiClient';

export const CONSULTANT_ACCESS_POLICY_VERSION = 'CONSULTANT_ACCESS_V1';
export type ConsultantConsentStatus = 'GRANTED' | 'REVOKED' | 'PENDING' | 'NOT_REQUESTED';

export type ConsultantAccessRequest = {
  assignmentId: string;
  consultantUserId: string;
  consultantName: string;
  consultantRole: string;
  professionalType: string;
  relationshipType: string;
  purpose: string;
  dataCategories: string[];
  status: ConsultantConsentStatus;
  policyVersion: string;
  grantedAt: string | null;
  revokedAt: string | null;
  version: number;
  updatedAt: string | null;
};

export const getConsultantAccessRequests = async () => {
  const response = await apiFetch<{ requests: ConsultantAccessRequest[] }>('/v1/preferences/consultant-access');
  return response.requests;
};

export const updateConsultantAccess = async (assignmentId: string, status: 'GRANTED' | 'REVOKED') => {
  const response = await apiFetch<{ consent: ConsultantAccessRequest }>('/v1/preferences/consultant-access', {
    method: 'PUT',
    body: JSON.stringify({ assignmentId, status, policyVersion: CONSULTANT_ACCESS_POLICY_VERSION }),
  });
  return response.consent;
};
