import { AssessmentProfile, OnboardingProfile } from '../types';
import { apiFetch } from './apiClient';

export type PlatformHealthProfile = {
  dateOfBirthISO: string | null;
  calculatedAge: number | null;
  gender: OnboardingProfile['gender'] | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  goalWeightKg: number | null;
  waistCm: number | null;
  hipCm: number | null;
  neckCm: number | null;
  bodyFatPct: number | null;
  occupation: string | null;
  workingHoursLabel: string | null;
  shiftType: string | null;
  activityLevel: string | null;
  workMode: string | null;
  travelFrequency: string | null;
  dietType: string | null;
  regionalCuisine: string | null;
  preferredCuisines: string[];
  foodsLiked: string[];
  foodsDisliked: string[];
  foodAllergies: string[];
  foodIntolerances: string[];
  currentSupplements: string[];
  currentMedicines: string[];
  wakeTime: string | null;
  breakfastTime: string | null;
  lunchTime: string | null;
  dinnerTime: string | null;
  sleepTime: string | null;
  mealsPerDay: number | null;
  waterIntakeLiters: number | null;
  sleepHours: number | null;
  sleepGoalHours: number | null;
  outsideFoodFrequency: string | null;
  cookingAtHome: string | null;
  whoCooks: string | null;
  smokingStatus: string | null;
  alcoholFrequency: string | null;
  exerciseFrequency: string | null;
  stressLevelLabel: string | null;
  primaryConditions: string[];
  previousConditions: string[];
  familyHistoryConditions: string[];
  wellnessGoals: string[];
  medicalNotes: string | null;
  pregnancyStatus: string | null;
  breastfeedingStatus: string | null;
  pcosStatus: string | null;
  thyroidStatus: string | null;
  diabetesStatus: string | null;
  hypertensionStatus: string | null;
};

export type PlatformHealthProfileBundle = {
  profile: PlatformHealthProfile;
  nutrition: {
    completionPercent: number;
    readinessScore: number;
    aiReady: boolean;
    missingFields: string[];
  };
  reportCount?: number;
};

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

export const getPlatformHealthProfile = () =>
  apiFetch<PlatformHealthProfileBundle>('/v1/platform/health-profile');

const firstGoal = (profile: PlatformHealthProfile) =>
  profile.wellnessGoals.find(Boolean) as OnboardingProfile['primaryGoal'] | undefined;

export const mergePlatformProfileIntoOnboarding = (
  onboarding: OnboardingProfile,
  profile: PlatformHealthProfile
): OnboardingProfile => {
  const primaryGoal = firstGoal(profile) ?? onboarding.primaryGoal;
  return {
    ...onboarding,
    dateOfBirthISO: profile.dateOfBirthISO ?? onboarding.dateOfBirthISO,
    calculatedAge: profile.calculatedAge ?? onboarding.calculatedAge,
    age: profile.calculatedAge ?? onboarding.age,
    gender: profile.gender ?? onboarding.gender,
    heightCm: profile.heightCm ?? onboarding.heightCm,
    currentWeightKg: profile.currentWeightKg ?? onboarding.currentWeightKg,
    goalWeightKg: profile.goalWeightKg ?? onboarding.goalWeightKg,
    waistCm: profile.waistCm ?? onboarding.waistCm,
    hipCm: profile.hipCm ?? onboarding.hipCm,
    neckCm: profile.neckCm ?? onboarding.neckCm,
    bodyFatPct: profile.bodyFatPct ?? onboarding.bodyFatPct,
    occupation: profile.occupation ?? onboarding.occupation,
    workingHoursLabel: profile.workingHoursLabel ?? onboarding.workingHoursLabel,
    shiftType: profile.shiftType ?? onboarding.shiftType,
    activityLevel: profile.activityLevel ?? onboarding.activityLevel,
    workMode: profile.workMode ?? onboarding.workMode,
    travelFrequency: profile.travelFrequency ?? onboarding.travelFrequency,
    dietType: profile.dietType ?? onboarding.dietType,
    regionalCuisine: profile.regionalCuisine ?? onboarding.regionalCuisine,
    preferredCuisines: profile.preferredCuisines.length > 0 ? profile.preferredCuisines : onboarding.preferredCuisines,
    foodsLiked: profile.foodsLiked.length > 0 ? profile.foodsLiked : onboarding.foodsLiked,
    foodsDisliked: profile.foodsDisliked.length > 0 ? profile.foodsDisliked : onboarding.foodsDisliked,
    foodAllergies: profile.foodAllergies.length > 0 ? profile.foodAllergies : onboarding.foodAllergies,
    foodIntolerances: profile.foodIntolerances.length > 0 ? profile.foodIntolerances : onboarding.foodIntolerances,
    currentSupplements: profile.currentSupplements.length > 0 ? profile.currentSupplements : onboarding.currentSupplements,
    currentMedicines: profile.currentMedicines.length > 0 ? profile.currentMedicines : onboarding.currentMedicines,
    wakeTime: profile.wakeTime ?? onboarding.wakeTime,
    breakfastTime: profile.breakfastTime ?? onboarding.breakfastTime,
    lunchTime: profile.lunchTime ?? onboarding.lunchTime,
    dinnerTime: profile.dinnerTime ?? onboarding.dinnerTime,
    sleepTime: profile.sleepTime ?? onboarding.sleepTime,
    mealsPerDay: profile.mealsPerDay ?? onboarding.mealsPerDay,
    waterIntakeLiters: profile.waterIntakeLiters ?? onboarding.waterIntakeLiters,
    sleepHours: profile.sleepHours ?? onboarding.sleepHours,
    sleepGoalHours: profile.sleepGoalHours ?? onboarding.sleepGoalHours,
    outsideFoodFrequency: profile.outsideFoodFrequency ?? onboarding.outsideFoodFrequency,
    cookingAtHome: profile.cookingAtHome ?? onboarding.cookingAtHome,
    whoCooks: profile.whoCooks ?? onboarding.whoCooks,
    smokingStatus: profile.smokingStatus ?? onboarding.smokingStatus,
    alcoholFrequency: profile.alcoholFrequency ?? onboarding.alcoholFrequency,
    exerciseFrequency: profile.exerciseFrequency ?? onboarding.exerciseFrequency,
    stressLevelLabel: profile.stressLevelLabel ?? onboarding.stressLevelLabel,
    primaryConditions: profile.primaryConditions.length > 0 ? profile.primaryConditions as OnboardingProfile['primaryConditions'] : onboarding.primaryConditions,
    previousConditions: profile.previousConditions.length > 0 ? profile.previousConditions as OnboardingProfile['previousConditions'] : onboarding.previousConditions,
    familyHistoryConditions: profile.familyHistoryConditions.length > 0 ? profile.familyHistoryConditions as OnboardingProfile['familyHistoryConditions'] : onboarding.familyHistoryConditions,
    healthGoals: profile.wellnessGoals.length > 0 ? profile.wellnessGoals as OnboardingProfile['healthGoals'] : onboarding.healthGoals,
    primaryGoal,
    wellnessGoal: primaryGoal,
    medicalNotes: profile.medicalNotes ?? onboarding.medicalNotes,
    pregnancyStatus: profile.pregnancyStatus ?? onboarding.pregnancyStatus,
    breastfeedingStatus: profile.breastfeedingStatus ?? onboarding.breastfeedingStatus,
    pcosStatus: profile.pcosStatus ?? onboarding.pcosStatus,
    thyroidStatus: profile.thyroidStatus ?? onboarding.thyroidStatus,
    diabetesStatus: profile.diabetesStatus ?? onboarding.diabetesStatus,
    hypertensionStatus: profile.hypertensionStatus ?? onboarding.hypertensionStatus
  };
};
