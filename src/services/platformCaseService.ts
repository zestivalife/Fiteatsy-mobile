import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClientError, apiFetch } from './apiClient';
import { CareCaseRef, OnboardingProfile } from '../types';
import { getIdentityScopedStorageKey, type StorageIdentity } from '../utils/identityScopedStorage';

const ACTIVE_CARE_CASE_STORAGE_KEY = 'fiteatsy.platform.activeCareCase.v1';

const getStorageKey = (identity: StorageIdentity) =>
  getIdentityScopedStorageKey(ACTIVE_CARE_CASE_STORAGE_KEY, identity);

const readStoredCareCase = async (identity: StorageIdentity): Promise<CareCaseRef | null> => {
  const key = getStorageKey(identity);
  if (!key) return null;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CareCaseRef;
  } catch {
    return null;
  }
};

export const resolveActiveCareCase = async (params: {
  userId: string;
  clientId?: string | null;
  onboarding: OnboardingProfile | null;
}): Promise<CareCaseRef> => {
  const identity = { userId: params.userId, clientId: params.clientId };
  const storageKey = getStorageKey(identity);
  try {
    const remote = await apiFetch<{
      id: string;
      userId: string;
      healthProfileId: string;
      recoveryProgramId: string;
      assignedConsultantId: string | null;
      assignedMentorId: string | null;
      currentStage: string;
      status: string;
      createdAtISO: string;
      updatedAtISO: string;
    }>('/v1/platform/care-cases/current');
    const remoteCase: CareCaseRef = {
      id: remote.id,
      userId: remote.userId,
      healthProfileId: remote.healthProfileId,
      recoveryProgramId: remote.recoveryProgramId,
      title: `${remote.currentStage.replace(/_/g, ' ')} Case`,
      status: remote.status === 'active' ? 'active' : 'draft',
      consultantAssignment: {
        consultantId: remote.assignedConsultantId,
        mentorId: remote.assignedMentorId,
        assignedAtISO: null
      },
      assignmentHistory: [],
      createdAtISO: remote.createdAtISO,
      updatedAtISO: remote.updatedAtISO,
      provisional: false
    };
    if (storageKey) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(remoteCase));
    }
    return remoteCase;
  } catch (error) {
    if (!(error instanceof ApiClientError)) {
      throw error;
    }
  }

  const existing = await readStoredCareCase(identity);
  if (existing) {
    return existing;
  }

  const nowISO = new Date().toISOString();
  const careTrack = params.onboarding?.careTrack ?? 'Foundational Recovery Care';
  const title = `${careTrack} Case`;
  const careCase: CareCaseRef = {
    id: `local-care-case-${Date.now()}`,
    userId: params.userId,
    healthProfileId: `local-health-profile-${params.userId}`,
    recoveryProgramId: `local-recovery-program-${params.userId}`,
    title,
    status: 'draft',
    consultantAssignment: {
      consultantId: params.onboarding?.assignedConsultantId ?? null,
      mentorId: null,
      assignedAtISO: params.onboarding?.assignedConsultant?.assignedAtISO ?? null
    },
    assignmentHistory: [],
    createdAtISO: nowISO,
    updatedAtISO: nowISO,
    provisional: true
  };

  if (storageKey) {
    await AsyncStorage.setItem(storageKey, JSON.stringify(careCase));
  }
  return careCase;
};
