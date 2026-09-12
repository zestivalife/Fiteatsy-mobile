import type { PlatformHealthProfile } from '../services/platformHealthProfileService';

export type OnboardingStatus = 'UNKNOWN' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type OnboardingResolution = 'UNKNOWN' | 'INCOMPLETE' | 'COMPLETE';
export type OnboardingResumeStep = 'basics' | 'anthropometrics' | 'assessment' | null;

export type OnboardingGate = {
  status: OnboardingStatus;
  resumeStep: OnboardingResumeStep;
};

const hasPositiveNumber = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0;

type OnboardingProfileEvidence = Partial<Pick<
  PlatformHealthProfile,
  'dateOfBirthISO' | 'gender' | 'heightCm' | 'currentWeightKg'
>> & {
  onboardingComplete?: boolean | null;
  onboarding_complete?: boolean | null;
};

export const resolveOnboardingState = (
  profile: OnboardingProfileEvidence | null | undefined
): OnboardingResolution => {
  if (profile === undefined) return 'UNKNOWN';
  if (profile === null) return 'INCOMPLETE';
  if (profile.onboardingComplete === true || profile.onboarding_complete === true) return 'COMPLETE';
  if (!profile.dateOfBirthISO || !profile.gender) return 'INCOMPLETE';
  if (!hasPositiveNumber(profile.heightCm) || !hasPositiveNumber(profile.currentWeightKg)) return 'INCOMPLETE';
  return 'COMPLETE';
};

export const deriveOnboardingGate = (profile: OnboardingProfileEvidence | null): OnboardingGate => {
  if (!profile) return { status: 'NOT_STARTED', resumeStep: 'basics' };
  if (resolveOnboardingState(profile) === 'COMPLETE') return { status: 'COMPLETED', resumeStep: null };
  if (!profile.dateOfBirthISO || !profile.gender) return { status: 'IN_PROGRESS', resumeStep: 'basics' };
  if (!hasPositiveNumber(profile.heightCm) || !hasPositiveNumber(profile.currentWeightKg)) {
    return { status: 'IN_PROGRESS', resumeStep: 'anthropometrics' };
  }
  return { status: 'COMPLETED', resumeStep: null };
};
