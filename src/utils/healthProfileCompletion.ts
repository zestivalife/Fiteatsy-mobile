import { AssessmentProfile, HealthProfileSectionKey, OnboardingProfile } from '../types';
import { calculateBodyFatPercentage } from './healthProfile';

export type HealthProfileSectionSummary = {
  id: HealthProfileSectionKey;
  title: string;
  completed: number;
  total: number;
  percent: number;
  missing: string[];
  status: 'complete' | 'in_progress' | 'needs_attention';
  updatedAtISO: string | null;
  summary: string;
};

export type HealthProfileCompletionSnapshot = {
  bmi: number | null;
  bodyFatPct: number | null;
  waistHipRatio: number | null;
  completionPercent: number;
  readinessPercent: number;
  isAiReady: boolean;
  missingItems: string[];
  sections: HealthProfileSectionSummary[];
};

const hasValue = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'boolean') return true;
  return Boolean(String(value ?? '').trim());
};

const buildStatus = (percent: number): HealthProfileSectionSummary['status'] => {
  if (percent >= 100) return 'complete';
  if (percent >= 40) return 'in_progress';
  return 'needs_attention';
};

const toSection = (
  id: HealthProfileSectionKey,
  title: string,
  fields: Array<{ label: string; value: unknown }>,
  updatedAtISO: string | null,
  summary: string
): HealthProfileSectionSummary => {
  const completed = fields.filter((field) => hasValue(field.value)).length;
  const missing = fields.filter((field) => !hasValue(field.value)).map((field) => field.label);
  const percent = Math.round((completed / Math.max(1, fields.length)) * 100);

  return {
    id,
    title,
    completed,
    total: fields.length,
    percent,
    missing,
    status: buildStatus(percent),
    updatedAtISO,
    summary
  };
};

export const calculateBmi = (heightCm?: number, weightKg?: number): number | null => {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightMeters = heightCm / 100;
  return Number((weightKg / (heightMeters * heightMeters)).toFixed(1));
};

export const calculateWaistHipRatio = (waistCm?: number, hipCm?: number): number | null => {
  if (!waistCm || !hipCm || waistCm <= 0 || hipCm <= 0) return null;
  return Number((waistCm / hipCm).toFixed(2));
};

export const buildHealthProfileCompletion = (
  onboarding: OnboardingProfile | null,
  assessment: AssessmentProfile | null,
  reportCount: number
): HealthProfileCompletionSnapshot => {
  const heightCm = assessment?.heightCm ?? onboarding?.heightCm;
  const currentWeightKg = assessment?.weightKg ?? onboarding?.currentWeightKg;
  const bmi = calculateBmi(heightCm, currentWeightKg);
  const bodyFatPct =
    calculateBodyFatPercentage({
      gender: onboarding?.gender,
      heightCm,
      waistCm: onboarding?.waistCm,
      neckCm: onboarding?.neckCm,
      hipCm: onboarding?.hipCm
    }) ??
    onboarding?.bodyFatPct ??
    null;
  const waistHipRatio = calculateWaistHipRatio(onboarding?.waistCm, onboarding?.hipCm);

  const updatedAt = (section: HealthProfileSectionKey) =>
    onboarding?.healthProfileSectionUpdatedAt?.[section] ?? onboarding?.createdAtISO ?? null;

  const sections = [
    toSection(
      'basic',
      'Basic Information',
      [
        { label: 'Date of Birth', value: onboarding?.dateOfBirthISO },
        { label: 'Calculated Age', value: onboarding?.calculatedAge },
        { label: 'Gender', value: onboarding?.gender },
        { label: 'Goal Weight', value: onboarding?.goalWeightKg },
        { label: 'Occupation', value: onboarding?.occupation },
        { label: 'Work Mode', value: onboarding?.workMode },
        { label: 'Working Hours', value: onboarding?.workingHoursLabel ?? onboarding?.workHours },
        { label: 'Shift Type', value: onboarding?.shiftType },
        { label: 'Travel Frequency', value: onboarding?.travelFrequency },
        { label: 'Activity Level', value: onboarding?.activityLevel }
      ],
      updatedAt('basic'),
      [onboarding?.occupation, onboarding?.workMode, onboarding?.activityLevel].filter(Boolean).join(' • ') ||
        'Personal baseline and schedule details'
    ),
    toSection(
      'body',
      'Body Measurements',
      [
        { label: 'Height', value: heightCm },
        { label: 'Current Weight', value: currentWeightKg },
        { label: 'Waist', value: onboarding?.waistCm },
        { label: 'Hip', value: onboarding?.hipCm },
        { label: 'Neck', value: onboarding?.neckCm },
        { label: 'BMI', value: bmi },
        { label: 'Body Fat %', value: bodyFatPct },
        { label: 'Waist-Hip Ratio', value: waistHipRatio }
      ],
      updatedAt('body'),
      [heightCm ? `${heightCm} cm` : null, currentWeightKg ? `${currentWeightKg} kg` : null, bmi ? `BMI ${bmi}` : null]
        .filter(Boolean)
        .join(' • ') || 'Measurements drive BMI, body fat, and dosing logic'
    ),
    toSection(
      'lifestyle',
      'Lifestyle',
      [
        { label: 'Sleep Hours', value: onboarding?.sleepHours },
        { label: 'Sleep Goal', value: onboarding?.sleepGoalHours },
        { label: 'Water Intake', value: onboarding?.waterIntakeLiters },
        { label: 'Meals Per Day', value: onboarding?.mealsPerDay },
        { label: 'Smoking Status', value: onboarding?.smokingStatus },
        { label: 'Alcohol Frequency', value: onboarding?.alcoholFrequency },
        { label: 'Exercise Frequency', value: onboarding?.exerciseFrequency },
        { label: 'Stress Level', value: onboarding?.stressLevelLabel },
        { label: 'Working Pattern', value: onboarding?.shiftType },
        { label: 'Activity Level', value: onboarding?.activityLevel }
      ],
      updatedAt('lifestyle'),
      [
        onboarding?.sleepHours ? `${onboarding.sleepHours} hrs sleep` : null,
        onboarding?.waterIntakeLiters ? `${onboarding.waterIntakeLiters} L water` : null,
        onboarding?.exerciseFrequency
      ]
        .filter(Boolean)
        .join(' • ') || 'Sleep, stress, hydration, and routine'
    ),
    toSection(
      'nutrition',
      'Nutrition Profile',
      [
        { label: 'Diet Type', value: onboarding?.dietType },
        { label: 'Regional Cuisine', value: onboarding?.regionalCuisine },
        { label: 'Preferred Cuisines', value: onboarding?.preferredCuisines },
        { label: 'Foods You Like', value: onboarding?.foodsLiked },
        { label: 'Foods You Dislike', value: onboarding?.foodsDisliked },
        { label: 'Food Allergies', value: onboarding?.foodAllergies },
        { label: 'Food Intolerances', value: onboarding?.foodIntolerances },
        { label: 'Outside Food Frequency', value: onboarding?.outsideFoodFrequency },
        { label: 'Cooking At Home', value: onboarding?.cookingAtHome },
        { label: 'Who Cooks', value: onboarding?.whoCooks },
        { label: 'Meal Timing Preference', value: onboarding?.mealTimingPreference },
        { label: 'Current Supplements', value: onboarding?.currentSupplements },
        { label: 'Current Medicines', value: onboarding?.currentMedicines }
      ],
      updatedAt('nutrition'),
      [onboarding?.dietType, onboarding?.regionalCuisine, onboarding?.outsideFoodFrequency].filter(Boolean).join(' • ') ||
        'Food choices and constraints for meal planning'
    ),
    toSection(
      'medical',
      'Medical Profile',
      [
        { label: 'Current Conditions', value: onboarding?.primaryConditions },
        { label: 'Previous Conditions', value: onboarding?.previousConditions },
        { label: 'Family History', value: onboarding?.familyHistoryConditions },
        { label: 'Current Medication', value: onboarding?.currentMedicines },
        { label: 'Supplements', value: onboarding?.currentSupplements },
        { label: 'PCOS', value: onboarding?.pcosStatus },
        { label: 'Thyroid', value: onboarding?.thyroidStatus },
        { label: 'Diabetes', value: onboarding?.diabetesStatus },
        { label: 'Hypertension', value: onboarding?.hypertensionStatus },
        { label: 'Pregnancy', value: onboarding?.pregnancyStatus },
        { label: 'Breastfeeding', value: onboarding?.breastfeedingStatus }
      ],
      updatedAt('medical'),
      [onboarding?.primaryConditions?.slice(0, 2).join(', '), onboarding?.currentMedicines?.length ? `${onboarding.currentMedicines.length} meds` : null]
        .filter(Boolean)
        .join(' • ') || 'Clinical conditions, medication, and care risks'
    ),
    toSection(
      'reports',
      'Blood Reports',
      [
        { label: 'Uploaded Reports', value: reportCount > 0 ? reportCount : null },
        { label: 'Shared Reports', value: onboarding?.consultantSharedReportIds?.length ?? 0 }
      ],
      updatedAt('reports'),
      reportCount > 0 ? `${reportCount} uploaded report${reportCount > 1 ? 's' : ''}` : 'No uploaded reports yet'
    ),
    toSection(
      'sharing',
      'Consultant Sharing',
      [
        { label: 'Assigned Consultant', value: onboarding?.assignedConsultant?.fullName ?? onboarding?.assignedConsultantId },
        { label: 'Reports Shared', value: onboarding?.consultantSharedReportIds },
        { label: 'Measurements Shared', value: onboarding?.shareMeasurementsWithConsultant },
        { label: 'Nutrition Shared', value: onboarding?.shareNutritionWithConsultant },
        { label: 'Medication Shared', value: onboarding?.shareMedicationWithConsultant },
        { label: 'Lifestyle Shared', value: onboarding?.shareLifestyleWithConsultant }
      ],
      updatedAt('sharing'),
      onboarding?.assignedConsultant?.fullName
        ? `Sharing with ${onboarding.assignedConsultant.fullName}`
        : 'No consultant assigned yet'
    )
  ];

  const totalCompleted = sections.reduce((sum, section) => sum + section.completed, 0);
  const totalFields = sections.reduce((sum, section) => sum + section.total, 0);
  const completionPercent = Math.round((totalCompleted / Math.max(1, totalFields)) * 100);
  const missingItems = sections.flatMap((section) => section.missing);
  const readinessPercent = Math.round(
    completionPercent * 0.5 +
      (sections.find((section) => section.id === 'nutrition')?.percent ?? 0) * 0.2 +
      (sections.find((section) => section.id === 'medical')?.percent ?? 0) * 0.1 +
      (sections.find((section) => section.id === 'reports')?.percent ?? 0) * 0.1 +
      (sections.find((section) => section.id === 'sharing')?.percent ?? 0) * 0.1
  );

  return {
    bmi,
    bodyFatPct,
    waistHipRatio,
    completionPercent,
    readinessPercent,
    isAiReady: readinessPercent >= 75,
    missingItems,
    sections
  };
};
