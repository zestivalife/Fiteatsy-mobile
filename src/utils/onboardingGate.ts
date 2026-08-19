import type { PlatformHealthProfile } from '../services/platformHealthProfileService';

export type OnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type OnboardingResumeStep = 'basics' | 'assessment' | null;

export type OnboardingGate = {
  status: OnboardingStatus;
  resumeStep: OnboardingResumeStep;
};

const hasPositiveNumber = (value: number | null) => typeof value === 'number' && Number.isFinite(value) && value > 0;

export const deriveOnboardingGate = (profile: PlatformHealthProfile | null): OnboardingGate => {
  if (!profile) return { status: 'NOT_STARTED', resumeStep: 'basics' };
  if (!profile.dateOfBirthISO || !profile.gender) return { status: 'IN_PROGRESS', resumeStep: 'basics' };
  if (!hasPositiveNumber(profile.heightCm) || !hasPositiveNumber(profile.currentWeightKg)) {
    return { status: 'IN_PROGRESS', resumeStep: 'assessment' };
  }
  return { status: 'COMPLETED', resumeStep: null };
};
