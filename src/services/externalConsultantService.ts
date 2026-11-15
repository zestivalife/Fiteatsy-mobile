import { apiFetch, postJson } from './apiClient';

export type ConsultantScope = 'PROFILE' | 'HEALTH_SUMMARY' | 'MEASUREMENTS' | 'BIOMARKERS' | 'DIET_PLANS' | 'APPOINTMENTS';

export type ExternalConsultantProfile = {
  id: string;
  slug?: string | null;
  display_name?: string | null;
  headline?: string | null;
  profession_code?: string | null;
  specialisations: string[];
  languages: string[];
  profile_photo_url?: string | null;
  verified_qualifications: number;
  phone_e164?: string | null;
};

export type ExternalConsultantConnection = {
  id: string;
  state: 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED' | 'REVOKED';
  consented_scopes: ConsultantScope[];
  programme_status: string;
  connected_at: string;
  disconnected_at?: string | null;
  consultant?: ExternalConsultantProfile | null;
};

export type ConnectionPreview = {
  pin_hint: string;
  requested_scopes: ConsultantScope[];
  expires_at: string;
  consent_required: boolean;
  consultant?: ExternalConsultantProfile | null;
};

export type ExternalDietPlan = { id: string; plan_id: string; plan_version: number; title: string; content: Record<string, unknown>; status: string; published_at: string; is_active: boolean };
export type ExternalAppointment = { id: string; appointment_id: string; title: string; starts_at: string; ends_at: string; status: string; created_at: string };

export const CONSENT_VERSION = 'external-consultant-v1';

const authorizationHeaders = (sessionToken: string): HeadersInit => {
  const token = sessionToken.trim();
  if (!token) throw new Error('Sign in to Fiteatsy before connecting a consultant.');
  return { Authorization: `Bearer ${token}` };
};

const idempotencyKey = () => {
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${random()}${random()}-${random()}-4${random().slice(1)}-${((8 + Math.floor(Math.random() * 4)).toString(16))}${random().slice(1)}-${random()}${random()}${random()}`;
};

export const getExternalConsultantFeatureStatus = () => apiFetch<{ enabled: boolean }>('/v1/external-consultants/feature-status');
export const previewExternalConsultant = (pin: string, sessionToken: string) =>
  postJson<ConnectionPreview>('/v1/external-consultants/preview', { pin }, authorizationHeaders(sessionToken));
export const connectExternalConsultant = (pin: string, acceptedScopes: ConsultantScope[], sessionToken: string, key = idempotencyKey()) =>
  postJson<{ connection_id: string; state: string; consented_scopes: ConsultantScope[] }>('/v1/external-consultants/redeem', {
    pin, acceptedScopes, consentVersion: CONSENT_VERSION, idempotencyKey: key
  }, authorizationHeaders(sessionToken));
export const listExternalConsultants = (sessionToken: string) => apiFetch<{ connections: ExternalConsultantConnection[] }>('/v1/external-consultants', { headers: authorizationHeaders(sessionToken) });
export const getExternalConsultant = (id: string, sessionToken: string) => apiFetch<{ connection: ExternalConsultantConnection }>(`/v1/external-consultants/${encodeURIComponent(id)}`, { headers: authorizationHeaders(sessionToken) });
export const getExternalDietPlans = (id: string, sessionToken: string) => apiFetch<{ plans: ExternalDietPlan[] }>(`/v1/external-consultants/${encodeURIComponent(id)}/diet-plans`, { headers: authorizationHeaders(sessionToken) });
export const selectExternalDietPlan = (connectionId: string, publicationId: string, sessionToken: string) => apiFetch<{ publication_id: string; active: boolean; selected_at: string }>(`/v1/external-consultants/${encodeURIComponent(connectionId)}/diet-plans/active`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authorizationHeaders(sessionToken) }, body: JSON.stringify({ publicationId }) });
export const getExternalAppointments = (id: string, sessionToken: string) => apiFetch<{ appointments: ExternalAppointment[] }>(`/v1/external-consultants/${encodeURIComponent(id)}/appointments`, { headers: authorizationHeaders(sessionToken) });
export const disconnectExternalConsultant = (id: string, sessionToken: string) => apiFetch<{ connection_id: string; state: string }>(`/v1/external-consultants/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authorizationHeaders(sessionToken) });
