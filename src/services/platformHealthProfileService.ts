import { AssessmentProfile, OnboardingProfile } from '../types';
import { apiFetch } from './apiClient';

const positiveNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const nonEmptyArray = (value: string[] | null | undefined) =>
  Array.isArray(value) ? value.filter((item) => item.trim().length > 0) : undefined;

const compactPayload = (payload: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

const goalList = (profile: OnboardingProfile) =>
  Array.from(
    new Set(
      [
        profile.primaryGoal,
        profile.wellnessGoal,
        ...(profile.healthGoals ?? []),
        ...(profile.secondaryGoals ?? [])
      ].filter(Boolean)
    )
  );

export const syncPlatformHealthProfile = async (
  onboarding: OnboardingProfile | null,
  assessment: AssessmentProfile | null
) => {
  if (!onboarding) return null;

  const payload = compactPayload({
    dateOfBirthISO: onboarding.dateOfBirthISO,
    gender: onboarding.gender,
    heightCm: positiveNumber(assessment?.heightCm ?? onboarding.heightCm),
    currentWeightKg: positiveNumber(assessment?.weightKg ?? onboarding.currentWeightKg),
    goalWeightKg: positiveNumber(onboarding.goalWeightKg),
    waistCm: positiveNumber(onboarding.waistCm),
    hipCm: positiveNumber(onboarding.hipCm),
    neckCm: positiveNumber(onboarding.neckCm),
    bodyFatPct: positiveNumber(onboarding.bodyFatPct),
    occupation: onboarding.occupation,
    workingHoursLabel: onboarding.workingHoursLabel ?? onboarding.workHours,
    shiftType: onboarding.shiftType,
    activityLevel: onboarding.activityLevel,
    workMode: onboarding.workMode,
    travelFrequency: onboarding.travelFrequency,
    dietType: onboarding.dietType,
    regionalCuisine: onboarding.regionalCuisine,
    preferredCuisines: nonEmptyArray(onboarding.preferredCuisines),
    foodsLiked: nonEmptyArray(onboarding.foodsLiked),
    foodsDisliked: nonEmptyArray(onboarding.foodsDisliked),
    foodAllergies: nonEmptyArray(onboarding.foodAllergies),
    foodIntolerances: nonEmptyArray(onboarding.foodIntolerances),
    currentSupplements: nonEmptyArray(onboarding.currentSupplements),
    currentMedicines: nonEmptyArray(onboarding.currentMedicines),
    wakeTime: onboarding.wakeTime,
    breakfastTime: onboarding.breakfastTime,
    lunchTime: onboarding.lunchTime,
    dinnerTime: onboarding.dinnerTime,
    sleepTime: onboarding.sleepTime,
    mealsPerDay: positiveNumber(onboarding.mealsPerDay),
    waterIntakeLiters: positiveNumber(onboarding.waterIntakeLiters),
    sleepHours: positiveNumber(onboarding.sleepHours),
    sleepGoalHours: positiveNumber(onboarding.sleepGoalHours),
    outsideFoodFrequency: onboarding.outsideFoodFrequency,
    cookingAtHome: onboarding.cookingAtHome,
    whoCooks: onboarding.whoCooks,
    smokingStatus: onboarding.smokingStatus,
    alcoholFrequency: onboarding.alcoholFrequency,
    exerciseFrequency: onboarding.exerciseFrequency,
    stressLevelLabel: onboarding.stressLevelLabel,
    primaryConditions: nonEmptyArray(onboarding.primaryConditions),
    previousConditions: nonEmptyArray(onboarding.previousConditions),
    familyHistoryConditions: nonEmptyArray(onboarding.familyHistoryConditions),
    wellnessGoals: goalList(onboarding),
    medicalNotes: onboarding.medicalNotes,
    pregnancyStatus: onboarding.pregnancyStatus,
    breastfeedingStatus: onboarding.breastfeedingStatus,
    pcosStatus: onboarding.pcosStatus,
    thyroidStatus: onboarding.thyroidStatus,
    diabetesStatus: onboarding.diabetesStatus,
    hypertensionStatus: onboarding.hypertensionStatus
  });

  return apiFetch('/v1/platform/health-profile', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
};
