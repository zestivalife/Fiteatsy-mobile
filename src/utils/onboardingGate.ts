import type { PlatformHealthProfile } from '../services/platformHealthProfileService';

export type OnboardingStatus = 'UNKNOWN' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type OnboardingResumeStep = 'basics' | 'anthropometrics' | 'assessment' | null;

export type OnboardingGate = {
  status: OnboardingStatus;
  resumeStep: OnboardingResumeStep;
};

const hasPositiveNumber = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0;

type OnboardingProfileEvidence = Partial<Pick<
  PlatformHealthProfile,
  'dateOfBirthISO' | 'gender' | 'heightCm' | 'currentWeightKg'
>>;

export const deriveOnboardingGate = (profile: OnboardingProfileEvidence | null): OnboardingGate => {
  if (!profile) return { status: 'NOT_STARTED', resumeStep: 'basics' };
  if (!profile.dateOfBirthISO || !profile.gender) return { status: 'IN_PROGRESS', resumeStep: 'basics' };
  if (!hasPositiveNumber(profile.heightCm) || !hasPositiveNumber(profile.currentWeightKg)) {
    return { status: 'IN_PROGRESS', resumeStep: 'anthropometrics' };
  }
  return { status: 'COMPLETED', resumeStep: null };
};
