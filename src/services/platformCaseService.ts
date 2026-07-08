import AsyncStorage from '@react-native-async-storage/async-storage';
import { CareCaseRef, OnboardingProfile } from '../types';

const ACTIVE_CARE_CASE_STORAGE_KEY = 'fiteatsy.platform.activeCareCase.v1';

const readStoredCareCase = async (): Promise<CareCaseRef | null> => {
  const raw = await AsyncStorage.getItem(ACTIVE_CARE_CASE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CareCaseRef;
  } catch {
    return null;
  }
};

export const resolveActiveCareCase = async (params: {
  userId: string;
  onboarding: OnboardingProfile | null;
}): Promise<CareCaseRef> => {
  const existing = await readStoredCareCase();
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

  await AsyncStorage.setItem(ACTIVE_CARE_CASE_STORAGE_KEY, JSON.stringify(careCase));
  return careCase;
};
