import { OnboardingProfile } from '../types';

export type HealthMetricValidationResult = {
  valid: boolean;
  missing: string[];
  invalid: string[];
};

export type HealthSnapshotMetrics = {
  bmi: number | null;
  bmr: number | null;
  tdee: number | null;
  calorieTarget: number | null;
  proteinTargetGrams: number | null;
  carbohydrateTargetGrams: number | null;
  fatTargetGrams: number | null;
  hydrationTargetLiters: number | null;
  validation: HealthMetricValidationResult;
};

const round = (value: number, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const isBetween = (value: number | null | undefined, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const normalizeGender = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'male') return 'male';
  if (normalized === 'female') return 'female';
  return null;
};

const activityMultiplier = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return null;
  if (['sedentary', 'inactive'].includes(normalized)) return 1.2;
  if (['light', 'lightly_active'].includes(normalized)) return 1.375;
  if (['moderate', 'moderately_active'].includes(normalized)) return 1.55;
  if (['active', 'very_active', 'athlete'].includes(normalized)) return 1.725;
  return null;
};

export const validateHealthMetricInputs = ({
  age,
  heightCm,
  weightKg
}: {
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
}): HealthMetricValidationResult => {
  const missing: string[] = [];
  const invalid: string[] = [];

  if (age == null) missing.push('age');
  else if (!isBetween(age, 10, 120)) invalid.push('age');

  if (heightCm == null) missing.push('height');
  else if (!isBetween(heightCm, 100, 250)) invalid.push('height');

  if (weightKg == null) missing.push('weight');
  else if (!isBetween(weightKg, 20, 300)) invalid.push('weight');

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid
  };
};

export const buildHealthSnapshotMetrics = (
  onboarding: OnboardingProfile | null,
  assessmentWeightKg?: number,
  assessmentHeightCm?: number
): HealthSnapshotMetrics => {
  const age = onboarding?.calculatedAge ?? onboarding?.age;
  const heightCm = assessmentHeightCm ?? onboarding?.heightCm;
  const weightKg = assessmentWeightKg ?? onboarding?.currentWeightKg;
  const validation = validateHealthMetricInputs({ age, heightCm, weightKg });
  const gender = normalizeGender(onboarding?.gender);
  const multiplier = activityMultiplier(onboarding?.activityLevel);
  const hasValidHeightWeight = isBetween(heightCm, 100, 250) && isBetween(weightKg, 20, 300);
  const hasValidWeight = isBetween(weightKg, 20, 300);
  const hasValidCoreInputs = validation.valid && hasValidHeightWeight && typeof age === 'number';
  const bmi =
    hasValidHeightWeight
      ? round(weightKg / (heightCm / 100) ** 2)
      : null;
  const bmr =
    hasValidCoreInputs && gender
      ? Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (gender === 'male' ? 5 : -161))
      : null;
  const tdee = bmr != null && multiplier != null ? Math.round(bmr * multiplier) : null;
  const calorieTarget = tdee;

  return {
    bmi,
    bmr,
    tdee,
    calorieTarget,
    proteinTargetGrams: calorieTarget == null ? null : Math.round((calorieTarget * 0.25) / 4),
    carbohydrateTargetGrams: calorieTarget == null ? null : Math.round((calorieTarget * 0.45) / 4),
    fatTargetGrams: calorieTarget == null ? null : Math.round((calorieTarget * 0.3) / 9),
    hydrationTargetLiters: hasValidWeight ? round(Math.max(2, weightKg * 0.035)) : null,
    validation
  };
};
