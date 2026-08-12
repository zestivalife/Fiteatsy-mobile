import {
  AgeBracket,
  AssessmentGender,
  ConsultantProfile,
  HealthGoal,
  OnboardingProfile
} from '../types';

const DEFAULT_DOB = new Date(1996, 0, 1);

export const calculateAgeFromDob = (dobInput: Date | string): number => {
  const dob = dobInput instanceof Date ? dobInput : new Date(dobInput);
  if (Number.isNaN(dob.getTime())) return 28;

  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    years -= 1;
  }
  return Math.max(18, Math.min(99, years));
};

export const toAgeBracket = (age: number): AgeBracket => {
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  return '55+';
};

export const deriveApproximateDobFromAge = (age: number, referenceDate = new Date()): Date => {
  const safeAge = Math.max(18, Math.min(99, Math.round(age)));
  return new Date(referenceDate.getFullYear() - safeAge, 6, 1);
};

export const dedupeGoals = (goals: Array<HealthGoal | null | undefined>): HealthGoal[] => {
  const unique = new Set<HealthGoal>();
  goals.forEach((goal) => {
    if (goal) unique.add(goal);
  });
  return Array.from(unique);
};

export const getPrimaryGoal = (profile: Pick<OnboardingProfile, 'primaryGoal' | 'healthGoals' | 'wellnessGoal'>): HealthGoal | undefined =>
  profile.primaryGoal ?? profile.healthGoals[0] ?? profile.wellnessGoal;

export const getSecondaryGoals = (profile: Pick<OnboardingProfile, 'primaryGoal' | 'secondaryGoals' | 'healthGoals'>): HealthGoal[] => {
  if (profile.secondaryGoals.length > 0) return profile.secondaryGoals;
  const primary = profile.primaryGoal ?? profile.healthGoals[0];
  return profile.healthGoals.filter((goal) => goal !== primary);
};

export const calculateBodyFatPercentage = (params: {
  gender?: AssessmentGender;
  heightCm?: number;
  waistCm?: number;
  neckCm?: number;
  hipCm?: number;
}): number | null => {
  const { gender, heightCm, waistCm, neckCm, hipCm } = params;
  if (!heightCm || !waistCm || !neckCm || heightCm <= 0 || waistCm <= 0 || neckCm <= 0) {
    return null;
  }

  const log10 = (value: number) => Math.log(value) / Math.log(10);

  let bodyFat: number | null = null;
  if (gender === 'Male') {
    const base = waistCm - neckCm;
    if (base > 0) {
      bodyFat = 86.01 * log10(base) - 70.041 * log10(heightCm) + 36.76;
    }
  } else if (gender === 'Female') {
    if (!hipCm || hipCm <= 0) return null;
    const base = waistCm + hipCm - neckCm;
    if (base > 0) {
      bodyFat = 163.205 * log10(base) - 97.684 * log10(heightCm) - 78.387;
    }
  }

  if (bodyFat == null || Number.isNaN(bodyFat) || !Number.isFinite(bodyFat)) {
    return null;
  }

  return Number(Math.min(60, Math.max(3, bodyFat)).toFixed(1));
};

export const createPendingConsultant = (careTrack: string, createdAtISO?: string): ConsultantProfile => ({
  id: 'pending-consultant-assignment',
  fullName: 'Consultant assignment in progress',
  profilePhotoUrl: null,
  availability: 'awaiting_schedule',
  specialization: careTrack,
  lastConsultationISO: null,
  nextAppointmentISO: null,
  chatEnabled: false,
  callEnabled: false,
  whatsappNumber: null,
  email: null,
  assignedAtISO: createdAtISO ?? null,
  status: 'pending_assignment'
});

export const normalizeOnboardingProfile = (profile: Partial<OnboardingProfile> & { name: string; createdAtISO: string }): OnboardingProfile => {
  const dateOfBirth =
    typeof profile.dateOfBirthISO === 'string' && !Number.isNaN(new Date(profile.dateOfBirthISO).getTime())
      ? new Date(profile.dateOfBirthISO)
      : typeof profile.age === 'number'
        ? deriveApproximateDobFromAge(profile.age)
        : DEFAULT_DOB;

  const healthGoals = dedupeGoals([
    ...(profile.healthGoals ?? []),
    profile.primaryGoal,
    ...(profile.secondaryGoals ?? []),
    profile.wellnessGoal
  ]);

  const primaryGoal = profile.primaryGoal ?? healthGoals[0];
  const secondaryGoals = healthGoals.filter((goal) => goal !== primaryGoal);
  const calculatedAge = calculateAgeFromDob(dateOfBirth);
  const careTrack = profile.careTrack ?? 'Foundational Recovery Care';
  const assignedConsultant =
    profile.assignedConsultant ??
    (profile.assignedConsultantId || profile.matchedDietitianName
      ? {
          id: profile.assignedConsultantId ?? `legacy-${(profile.matchedDietitianName ?? 'consultant').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          fullName: profile.matchedDietitianName ?? 'Assigned Consultant',
          profilePhotoUrl: null,
          availability: 'this_week',
          specialization: profile.matchedDietitianSpecialty ?? careTrack,
          lastConsultationISO: null,
          nextAppointmentISO: null,
          chatEnabled: true,
          callEnabled: false,
          whatsappNumber: null,
          email: null,
          assignedAtISO: profile.createdAtISO,
          status: 'assigned'
        }
      : null);

  return {
    ...profile,
    name: profile.name,
    dateOfBirthISO: dateOfBirth.toISOString(),
    calculatedAge,
    age: calculatedAge,
    heightCm: profile.heightCm,
    currentWeightKg: profile.currentWeightKg,
    goalWeightKg: profile.goalWeightKg,
    waistCm: profile.waistCm,
    hipCm: profile.hipCm,
    neckCm: profile.neckCm,
    bodyFatPct: profile.bodyFatPct,
    occupation: profile.occupation,
    workingHoursLabel: profile.workingHoursLabel,
    shiftType: profile.shiftType,
    activityLevel: profile.activityLevel,
    workMode: profile.workMode,
    travelFrequency: profile.travelFrequency,
    occupationMode: profile.occupationMode,
    dietType: profile.dietType,
    regionalCuisine: profile.regionalCuisine,
    preferredCuisines: profile.preferredCuisines ?? [],
    foodsLiked: profile.foodsLiked ?? [],
    foodsDisliked: profile.foodsDisliked ?? [],
    foodAllergies: profile.foodAllergies ?? [],
    foodIntolerances: profile.foodIntolerances ?? [],
    currentSupplements: profile.currentSupplements ?? [],
    currentMedicines: profile.currentMedicines ?? [],
    mealTimingPreference: profile.mealTimingPreference,
    cookingConfidence: profile.cookingConfidence,
    wakeTime: profile.wakeTime,
    breakfastTime: profile.breakfastTime,
    lunchTime: profile.lunchTime,
    dinnerTime: profile.dinnerTime,
    sleepTime: profile.sleepTime,
    mealsPerDay: profile.mealsPerDay,
    waterIntakeLiters: profile.waterIntakeLiters,
    sleepHours: profile.sleepHours,
    sleepGoalHours: profile.sleepGoalHours,
    sleepQualityLabel: profile.sleepQualityLabel,
    outsideFoodFrequency: profile.outsideFoodFrequency,
    cookingAtHome: profile.cookingAtHome,
    whoCooks: profile.whoCooks,
    smokingStatus: profile.smokingStatus,
    alcoholFrequency: profile.alcoholFrequency,
    exerciseFrequency: profile.exerciseFrequency,
    stressLevelLabel: profile.stressLevelLabel,
    gender: profile.gender ?? 'Prefer not to say',
    wellnessGoal: primaryGoal,
    ageBracket: profile.ageBracket ?? toAgeBracket(calculatedAge),
    primaryConditions: profile.primaryConditions ?? [],
    previousConditions: profile.previousConditions ?? [],
    familyHistoryConditions: profile.familyHistoryConditions ?? [],
    symptomTags: profile.symptomTags ?? ['Fatigue'],
    healthGoals,
    primaryGoal,
    secondaryGoals,
    medicalNotes: profile.medicalNotes,
    pregnancyStatus: profile.pregnancyStatus,
    breastfeedingStatus: profile.breastfeedingStatus,
    pcosStatus: profile.pcosStatus,
    thyroidStatus: profile.thyroidStatus,
    diabetesStatus: profile.diabetesStatus,
    hypertensionStatus: profile.hypertensionStatus,
    cholesterolStatus: profile.cholesterolStatus,
    heartConditionStatus: profile.heartConditionStatus,
    previousSurgeries: profile.previousSurgeries ?? [],
    wearablePreference: profile.wearablePreference ?? 'later',
    careTrack,
    assignedConsultantId: profile.assignedConsultantId ?? assignedConsultant?.id ?? null,
    assignedConsultant,
    consultantSharedReportIds: profile.consultantSharedReportIds ?? [],
    shareMeasurementsWithConsultant: profile.shareMeasurementsWithConsultant ?? true,
    shareNutritionWithConsultant: profile.shareNutritionWithConsultant ?? true,
    shareMedicationWithConsultant: profile.shareMedicationWithConsultant ?? true,
    shareLifestyleWithConsultant: profile.shareLifestyleWithConsultant ?? true,
    healthProfileSectionUpdatedAt: profile.healthProfileSectionUpdatedAt ?? {},
    matchedDietitianName: profile.matchedDietitianName ?? assignedConsultant?.fullName,
    matchedDietitianSpecialty: profile.matchedDietitianSpecialty ?? assignedConsultant?.specialization,
    calendarProvider: profile.calendarProvider ?? 'None',
    calendarPermissionGranted: profile.calendarPermissionGranted ?? false,
    notificationPermissionGranted: profile.notificationPermissionGranted ?? false,
    createdAtISO: profile.createdAtISO,
    role: profile.role,
    workHours: profile.workHours,
    biggestChallenge: profile.biggestChallenge
  };
};

export const getConsultantProfile = (profile: OnboardingProfile | null): ConsultantProfile => {
  if (profile?.assignedConsultant) return profile.assignedConsultant;
  return createPendingConsultant(profile?.careTrack ?? 'Foundational Recovery Care', profile?.createdAtISO);
};

export const formatConsultantAvailability = (availability: ConsultantProfile['availability']): string => {
  switch (availability) {
    case 'available_today':
      return 'Available today';
    case 'next_24h':
      return 'Next 24 hours';
    case 'this_week':
      return 'This week';
    case 'reassigning':
      return 'Reassigning';
    default:
      return 'Awaiting schedule';
  }
};

export const formatDobLabel = (dateOfBirthISO: string): string => {
  const date = new Date(dateOfBirthISO);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const isFemaleProfile = (gender: AssessmentGender | undefined): boolean => gender === 'Female';
