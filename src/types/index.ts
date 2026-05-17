export type WearableBrand = 'Apple' | 'Samsung' | 'Xiaomi' | 'Amazfit' | 'Other';

export type MoodSelection = '😂' | '😀' | '🙂' | '😐' | '☹️' | '😔';

export type HrvStatus = 'High' | 'Normal' | 'Low';
export type CoreChallenge = 'Stress' | 'Sleep' | 'Energy' | 'Focus';
export type CalendarProvider = 'Google' | 'Outlook' | 'None';
export type BurnoutRiskFlag = 'none' | 'watch' | 'alert';
export type NudgeType = 'break' | 'breathing' | 'hydration' | 'winddown' | 'weekly_insight';
export type NudgeAction = 'sent' | 'opened' | 'snoozed' | 'dismissed';
export type ThemeMode = 'dark' | 'light';
export type AssessmentGoal = 'Reduce Stress' | 'Try AI Therapy' | 'Cope With Trauma' | 'Become Better';
export type AssessmentGender = 'Male' | 'Female' | 'Prefer not to say';
export type AssessmentMood = 'Neutral' | 'Low' | 'Positive';
export type AssessmentHelpHistory = 'Yes' | 'No';
export type AssessmentPhysicalDistress = 'Yes' | 'No';
export type AssessmentSleepQuality = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Worst';

export type HealthCondition =
  | 'Diabetes'
  | 'Prediabetes'
  | 'Hypertension'
  | 'PCOS'
  | 'PCOD'
  | 'Thyroid'
  | 'Obesity'
  | 'High Cholesterol'
  | 'Fatty Liver'
  | 'Insulin Resistance'
  | 'Gut Health'
  | 'Anemia'
  | 'Vitamin Deficiency'
  | 'Kidney Care'
  | 'Hormonal Imbalance'
  | 'Inflammation'
  | 'Other';

export type SymptomTag =
  | 'Fatigue'
  | 'Cravings'
  | 'Bloating'
  | 'Poor Sleep'
  | 'Sugar Crashes'
  | 'Irregular Cycles'
  | 'Acne'
  | 'Hair Fall'
  | 'Digestive Discomfort'
  | 'High Hunger'
  | 'Low Mood'
  | 'Joint Pain';

export type HealthGoal =
  | 'Sugar Control'
  | 'Weight Loss'
  | 'Hormone Balance'
  | 'BP Control'
  | 'Gut Relief'
  | 'Better Energy'
  | 'Better Sleep'
  | 'Sustainable Habits';

export type AgeBracket = '18-24' | '25-34' | '35-44' | '45-54' | '55+';
export type WearablePreference = 'sync' | 'manual' | 'later';

export type OnboardingProfile = {
  name: string;
  ageBracket: AgeBracket;
  primaryConditions: HealthCondition[];
  symptomTags: SymptomTag[];
  healthGoals: HealthGoal[];
  wearablePreference: WearablePreference;
  careTrack: string;
  matchedDietitianName: string;
  matchedDietitianSpecialty: string;
  calendarProvider: CalendarProvider;
  calendarPermissionGranted: boolean;
  notificationPermissionGranted: boolean;
  createdAtISO: string;
  role?: string;
  workHours?: string;
  biggestChallenge?: CoreChallenge;
};

export type AssessmentProfile = {
  completedAtISO: string;
  goal: AssessmentGoal;
  gender: AssessmentGender;
  age: number;
  weightKg: number;
  mood: AssessmentMood;
  soughtHelpBefore: AssessmentHelpHistory;
  physicalDistress: AssessmentPhysicalDistress;
  sleepQuality: AssessmentSleepQuality;
  stressLevel: 1 | 2 | 3 | 4 | 5;
  voiceReflection: string;
};

export type DailyCheckIn = {
  dateISO: string;
  mood: 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3 | 4 | 5;
  sleepQuality: 1 | 2 | 3 | 4 | 5;
};

export type RiskSnapshot = {
  stressRisk: number;
  burnoutRisk: number;
  energyDeficit: number;
  burnoutFlag: BurnoutRiskFlag;
  anomalyDetected: boolean;
};

export type Nudge = {
  id: string;
  userId: string;
  type: NudgeType;
  title: string;
  body: string;
  actionLabel: string;
  actionMinutes: 1 | 2 | 5;
  scheduledAtISO: string;
};

export type DecisionLog = {
  id: string;
  createdAtISO: string;
  inputSummary: string;
  reasoning: string;
  outputSummary: string;
};

export type PriorityPlan = {
  priorityTitle: string;
  priorityAction: string;
  risk: RiskSnapshot;
  suggestedNudge: Nudge | null;
  smartPreview: string;
};

export type WearableDevice = {
  id: string;
  brand: WearableBrand;
  model: string;
  connected: boolean;
  battery: number;
  lastSyncISO: string;
};

export type WearableSyncPayload = {
  deviceId: string;
  brand: WearableBrand;
  model: string;
  provider: string;
  syncedAtISO: string;
  source: 'api' | 'mock';
  metrics: {
    heartRateAvg: number;
    sleepHours: number;
    hydrationLiters: number;
    focusMinutes: number;
    breathingMinutes: number;
    movementMinutes: number;
  };
  dataQuality: {
    confidence: number;
    isEstimated: boolean;
    warnings: string[];
  };
};

export type WellnessSnapshot = {
  focusMinutes: number;
  breathingMinutes: number;
  movementMinutes: number;
  hydrationLiters: number;
  hydrationGoalLiters: number;
  heartRateAvg: number;
  sleepHours: number;
  moodScore: number;
  recoveryScore: number;
  nourishmentScore: number;
  wellnessScore: number;
  hrvStatus: HrvStatus;
  stressScore: number;
};

export type MedicationType = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'drops' | 'powder';
export type MealRelation = 'before_meal' | 'after_meal' | 'with_meal' | 'empty_stomach';
export type MedicationStatus = 'active' | 'paused';
export type MedicationLogStatus = 'taken' | 'upcoming' | 'missed' | 'snoozed' | 'skipped';
export type ReminderSound = 'default' | 'soft' | 'bell' | 'medical_alert';

export type FrequencyPreset =
  | 'every_day'
  | 'alternate_days'
  | 'specific_weekdays'
  | 'every_x_days'
  | 'weekly'
  | 'monthly'
  | 'custom';

export type MedicationFrequencyRule = {
  preset: FrequencyPreset;
  intervalDays?: number;
  weekdays?: number[];
  monthlyDays?: number[];
  customRule?: string;
};

export type MedicationTimeSlot = {
  id: string;
  time24h: string;
  mealRelation: MealRelation;
};

export type MedicationDuration = {
  startDateISO: string;
  endDateISO: string | null;
  ongoing: boolean;
};

export type MedicationSchedule = {
  frequency: MedicationFrequencyRule;
  timeSlots: MedicationTimeSlot[];
  duration: MedicationDuration;
};

export type Medication = {
  id: string;
  name: string;
  type: MedicationType;
  dosage: string;
  schedule: MedicationSchedule;
  reminderSound: ReminderSound;
  status: MedicationStatus;
  createdAtISO: string;
  updatedAtISO: string;
  notificationIds: string[];
};

export type MedicationLog = {
  id: string;
  medicationId: string;
  scheduledForISO: string;
  status: MedicationLogStatus;
  actionedAtISO: string | null;
  snoozedUntilISO: string | null;
  note?: string;
};

export type CycleFlowIntensity = 'light' | 'medium' | 'heavy';
export type CycleSymptom =
  | 'cramps'
  | 'bloating'
  | 'headache'
  | 'acne'
  | 'fatigue'
  | 'breast_tenderness'
  | 'mood_swings';
export type CycleMood = 'happy' | 'low' | 'irritated' | 'calm' | 'anxious' | 'emotional';
export type CycleEnergy = 'high' | 'medium' | 'low';
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation_window' | 'luteal';
export type PredictionConfidence = 'high' | 'medium' | 'low';

export type CycleLog = {
  id: string;
  dateISO: string;
  periodStarted: boolean;
  periodEnded: boolean;
  flow: CycleFlowIntensity | null;
  symptoms: CycleSymptom[];
  mood: CycleMood | null;
  energy: CycleEnergy | null;
  notes: string;
  createdAtISO: string;
  updatedAtISO: string;
};

export type CyclePrediction = {
  predictedNextPeriodStartISO: string | null;
  predictedFertileStartISO: string | null;
  predictedFertileEndISO: string | null;
  predictedOvulationISO: string | null;
  averageCycleLengthDays: number;
  averagePeriodDurationDays: number;
  confidence: PredictionConfidence;
  basedOnCycleCount: number;
  consistencyScore: number;
};

export type CycleNotificationSettings = {
  enabled: boolean;
  reminderTime24h: string;
  notificationIds: string[];
};
