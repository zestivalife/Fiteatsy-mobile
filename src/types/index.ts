export type WearableBrand = 'Apple' | 'Samsung' | 'Xiaomi' | 'Amazfit' | 'GoBOLT' | 'Other';

export type MoodSelection = '😂' | '😀' | '🙂' | '😐' | '☹️' | '😔';

export type HrvStatus = 'High' | 'Normal' | 'Low' | 'Unavailable';
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
  | 'Weight Gain'
  | 'Muscle Building'
  | 'Diabetes Management'
  | 'PCOS Management'
  | 'General Wellness'
  | 'Fitness Improvement'
  | 'Recovery'
  | 'Hormone Balance'
  | 'BP Control'
  | 'Gut Relief'
  | 'Better Energy'
  | 'Better Sleep'
  | 'Sustainable Habits';

export type AgeBracket = '18-24' | '25-34' | '35-44' | '45-54' | '55+';
export type WearablePreference = 'sync' | 'manual' | 'later';

export type ConsultantAvailability = 'available_today' | 'next_24h' | 'this_week' | 'awaiting_schedule' | 'reassigning';
export type HealthProfileVerificationState = 'self_reported' | 'verified' | 'consultant_verified' | 'lab_verified' | 'calculated';
export type HealthProfileSectionKey = 'basic' | 'body' | 'lifestyle' | 'nutrition' | 'medical' | 'reports' | 'sharing';

export type ConsultantProfile = {
  id: string;
  fullName: string;
  profilePhotoUrl: string | null;
  availability: ConsultantAvailability;
  specialization: string;
  lastConsultationISO: string | null;
  nextAppointmentISO: string | null;
  chatEnabled: boolean;
  callEnabled: boolean;
  whatsappNumber: string | null;
  email: string | null;
  assignedAtISO: string | null;
  status: 'pending_assignment' | 'assigned' | 'reassigned';
};

export type ConsultantAssignmentHistoryEntry = {
  id: string;
  consultantId: string;
  consultantName: string;
  assignedAtISO: string;
  assignedBy: string;
  unassignedAtISO?: string | null;
  reason?: string;
};

export type OnboardingProfile = {
  name: string;
  dateOfBirthISO: string;
  calculatedAge: number;
  age?: number;
  gender: AssessmentGender;
  heightCm?: number;
  currentWeightKg?: number;
  goalWeightKg?: number;
  waistCm?: number;
  hipCm?: number;
  neckCm?: number;
  bodyFatPct?: number;
  occupation?: string;
  workingHoursLabel?: string;
  shiftType?: string;
  activityLevel?: string;
  workMode?: string;
  travelFrequency?: string;
  occupationMode?: string;
  dietType?: string;
  regionalCuisine?: string;
  preferredCuisines?: string[];
  foodsLiked?: string[];
  foodsDisliked?: string[];
  foodAllergies?: string[];
  foodIntolerances?: string[];
  currentSupplements?: string[];
  currentMedicines?: string[];
  mealTimingPreference?: string;
  cookingConfidence?: string;
  wakeTime?: string;
  breakfastTime?: string;
  lunchTime?: string;
  dinnerTime?: string;
  sleepTime?: string;
  mealsPerDay?: number;
  waterIntakeLiters?: number;
  sleepHours?: number;
  sleepGoalHours?: number;
  sleepQualityLabel?: string;
  outsideFoodFrequency?: string;
  cookingAtHome?: string;
  whoCooks?: string;
  smokingStatus?: string;
  alcoholFrequency?: string;
  exerciseFrequency?: string;
  stressLevelLabel?: string;
  wellnessGoal?: HealthGoal;
  ageBracket: AgeBracket;
  primaryConditions: HealthCondition[];
  previousConditions?: HealthCondition[];
  familyHistoryConditions?: HealthCondition[];
  symptomTags: SymptomTag[];
  healthGoals: HealthGoal[];
  primaryGoal?: HealthGoal;
  secondaryGoals: HealthGoal[];
  medicalNotes?: string;
  pregnancyStatus?: string;
  breastfeedingStatus?: string;
  pcosStatus?: string;
  thyroidStatus?: string;
  diabetesStatus?: string;
  hypertensionStatus?: string;
  cholesterolStatus?: string;
  heartConditionStatus?: string;
  previousSurgeries?: string[];
  wearablePreference: WearablePreference;
  careTrack: string;
  assignedConsultantId: string | null;
  assignedConsultant: ConsultantProfile | null;
  consultantSharedReportIds?: string[];
  shareMeasurementsWithConsultant?: boolean;
  shareNutritionWithConsultant?: boolean;
  shareMedicationWithConsultant?: boolean;
  shareLifestyleWithConsultant?: boolean;
  healthProfileSectionUpdatedAt?: Partial<Record<HealthProfileSectionKey, string>>;
  matchedDietitianName?: string;
  matchedDietitianSpecialty?: string;
  calendarProvider: CalendarProvider;
  calendarPermissionGranted: boolean;
  notificationPermissionGranted: boolean;
  createdAtISO: string;
  role?: string;
  workHours?: string;
  biggestChallenge?: CoreChallenge;
};

export type HealthProfile = OnboardingProfile;

export type AssessmentProfile = {
  completedAtISO: string;
  goal: AssessmentGoal;
  gender?: AssessmentGender;
  age?: number;
  heightCm: number;
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
    heartRateAvg: number | null;
    sleepHours: number | null;
    hydrationLiters: number | null;
    focusMinutes: number | null;
    breathingMinutes: number | null;
    movementMinutes: number | null;
    hrvMs?: number | null;
    caloriesKcal?: number | null;
    workoutMinutes?: number | null;
    stressScore?: number | null;
    cyclePhase?: string | null;
    spo2Pct?: number | null;
    respiratoryRateBrpm?: number | null;
  };
  dataQuality: {
    confidence: number;
    isEstimated: boolean;
    warnings: string[];
    connectedMetrics?: Partial<
      Record<
        | 'sleep'
        | 'steps'
        | 'heart_rate'
        | 'hrv'
        | 'calories'
        | 'workouts'
        | 'stress'
        | 'cycle'
        | 'spo2'
        | 'respiratory_rate',
        'synced' | 'missing' | 'unsupported' | 'estimated' | 'no_permission' | 'no_recent_data' | 'unavailable'
      >
    >;
    normalizedDomains?: {
      Activity: number | null;
      Sleep: number | null;
      Recovery: number | null;
      Calm: number | null;
      Cycle: number | null;
      Nutrition: number | null;
    };
  };
  observations?: HealthObservationDraft[];
};

export type HealthObservationDraft = {
  metricType: string;
  value: number;
  unit: string;
  measuredAtISO: string;
  sourceProvider: string;
  sourceRecordId?: string;
  syncKey?: string;
  qualityStatus?: 'accepted' | 'estimated';
  sourceMetadata?: {
    recordType?: string;
    sourceApplication?: string;
    startAtISO?: string;
    endAtISO?: string;
    originalValue?: number;
    originalUnit?: string;
    device?: {
      manufacturer?: string;
      model?: string;
      type?: number;
    };
    recordingMethod?: number;
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
  availability: 'available' | 'not_synced' | 'unavailable';
  lastUpdatedISO: string | null;
  source: string | null;
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

export type FamilyRelationshipType = 'parent' | 'child' | 'spouse' | 'caregiver' | 'family_member';
export type FamilyRole = 'primary_user' | 'connected_member';
export type FamilyConnectionStatus = 'pending_outgoing' | 'pending_incoming' | 'connected' | 'rejected' | 'disconnected';
export type FamilyVisibilityLevel = 'basic_support' | 'wellness_support';
export type FamilyShareType =
  | 'medication_adherence'
  | 'wellness_checkins'
  | 'activity_consistency'
  | 'sleep_summary'
  | 'emergency_alerts'
  | 'appointment_reminders'
  | 'uploaded_reports'
  | 'wellness_trends';

export type FamilyPermissions = Record<FamilyShareType, boolean>;

export type FamilyInvite = {
  code: string;
  createdAtISO: string;
  expiresAtISO: string;
  createdByUserId: string;
  usedByUserId: string | null;
  revoked: boolean;
};

export type FamilyConnection = {
  id: string;
  memberName: string;
  relationship: FamilyRelationshipType;
  role: FamilyRole;
  status: FamilyConnectionStatus;
  inviteCode: string | null;
  permissions: FamilyPermissions;
  visibilityLevel?: FamilyVisibilityLevel;
  contactMethod?: 'phone' | 'whatsapp';
  contactValue?: string;
  sharingPaused: boolean;
  timezone: string;
  lastCheckInISO: string | null;
  createdAtISO: string;
  updatedAtISO: string;
};

export type FamilyWellnessSummary = {
  connectionId: string;
  summaryDateISO: string;
  medicationAdherence: 'completed_today' | 'partially_completed' | 'needs_attention' | 'unknown';
  wellnessActivity: 'active' | 'steady' | 'quiet' | 'unknown';
  sleepSummary: 'normal' | 'needs_rest' | 'unknown';
  checkInStatus: 'recent' | 'pending' | 'overdue';
  trendLabel: string;
};

export type FamilyEmergencyEvent = {
  id: string;
  connectionId: string;
  type: 'sos' | 'check_in_ping' | 'call_request' | 'support_nudge';
  message: string;
  createdAtISO: string;
  delivery: 'sent' | 'failed';
};

export type PlatformEntityStatus = 'active' | 'inactive' | 'paused' | 'archived' | 'deleted';

export type CareCaseStatus = 'draft' | 'active' | 'monitoring' | 'paused' | 'closed';

export type NutritionMealOption = {
  id?: string;
  slot: number;
  meal: string;
  portion: string;
  prepNote: string;
  approxKcal: number | null;
  proteinGrams: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  fibreGrams?: number | null;
  matchClassification?: 'best_match' | 'good_match' | 'acceptable' | 'outside_target';
  sourceType?: 'verified_library' | 'consultant_custom' | 'template_variant' | 'generated_template';
  recommendationReason?: string | null;
  cuisineTags?: string[];
  dietaryTags?: string[];
  isApproved?: boolean;
  components?: NutritionMealComponent[];
};

export type NutritionMealTarget = {
  calories: number | null;
  proteinGrams: number | null;
  caloriesBand: {
    min: number | null;
    max: number | null;
  };
  proteinBand: {
    min: number | null;
    max: number | null;
  };
  allocationBasis: string;
};

export type NutritionMealRecommendationSet = {
  key: string;
  label: string;
  description?: string | null;
  optionIds: string[];
};

export type NutritionMealComponent = {
  id?: string;
  foodId?: string | null;
  componentName: string;
  quantity: number | null;
  quantityUnit: string;
  householdLabel?: string | null;
  canonicalGrams?: number | null;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  fibreGrams?: number | null;
  locked?: boolean;
};

export type NutritionMealSection = {
  window: string;
  focus: string;
  target?: NutritionMealTarget;
  recommendationSets?: NutritionMealRecommendationSet[];
  options: NutritionMealOption[];
};

export type NutritionHydrationRhythmEntry = {
  slot: number;
  anchor: string;
  quantity: string;
  note: string;
};

export type NutritionSubstitution = {
  foodGroup: string;
  usualChoice: string;
  alternative: string;
};

export type NutritionClinicalNote = {
  supplement: string;
  dose: string;
  timing: string;
  duration: string;
  note: string;
};

export type NutritionPlanContent = {
  nutritionSnapshot: {
    client: string;
    age: number | null;
    gender: string | null;
    goals: string[];
    healthConditions: string[];
    dietPreference: string | null;
    allergies: string[];
    lifestyleSummary: string;
    personalisedPlanFocus: string;
    programmeName: string;
    preparedBy: string;
  };
  dailyTargets: {
    calories: number | null;
    protein: number | null;
    hydration: number | null;
    movement: string;
  };
  mealPlan: {
    earlyMorning: NutritionMealSection;
    breakfast: NutritionMealSection;
    midMorningSnack: NutritionMealSection;
    lunch: NutritionMealSection;
    eveningSnack: NutritionMealSection;
    dinner: NutritionMealSection;
    bedtimeNutrition: NutritionMealSection;
  };
  hydrationRhythm: NutritionHydrationRhythmEntry[];
  weeklySuccessGuide: string[];
  smartSubstitutions: NutritionSubstitution[];
  supplementsAndClinicalNotes: NutritionClinicalNote[];
  optionalGuidance?: {
    schemaVersion: 1;
    generatedBy: string;
    generatedAtISO: string;
    updatedBy: string;
    updatedAtISO: string;
    reviewedBy: string | null;
    reviewedAtISO: string | null;
    whatCanIEatNow: NutritionGuidanceItem[];
    eatingOut: Record<'northIndian' | 'southIndian' | 'chinese' | 'continental' | 'fastFood', NutritionGuidanceItem[]>;
    cravings: Record<'sweet' | 'salty' | 'crunchy' | 'spicy', NutritionGuidanceItem[]>;
  };
};

export type NutritionGuidanceItem = {
  id: string;
  foodId: string | null;
  name: string;
  servingLabel: string;
  quantity: number | null;
  unit: string | null;
  nutrition: { calories: number; protein: number; carbs: number; fat: number; fibre: number };
  category: 'what_can_i_eat_now' | 'eating_out' | 'craving';
  cuisineTags: string[];
  cravingTags: string[];
  mealTags: string[];
  timeWindowTags: string[];
  dietaryTags: string[];
  restrictionTags: string[];
  reason: string;
  planMembership: boolean;
  clinicallyReviewed: boolean;
  displayOrder: number;
  enabled: boolean;
  source: 'published_plan' | 'verified_catalogue';
};

export type PublishedNutritionPlan = {
  plan: {
    id: string;
    templateVersion: string;
    planStatus: 'draft' | 'review_ready' | 'approved' | 'published' | 'archived';
    publishedAtISO: string | null;
    approvedAtISO: string | null;
  };
  version: {
    id: string;
    versionNumber: number;
    lifecycleStatus: 'draft' | 'review_ready' | 'approved' | 'published' | 'archived';
    exportedDocPath?: string | null;
    exportedPdfPath?: string | null;
    contentSummary: {
      calories: number | null;
      protein: number | null;
      hydration: number | null;
      focusAreas: string[];
    };
    content: NutritionPlanContent;
  };
  today: {
    todaysMeals: Array<{
      key: string;
      label: string;
      window: string;
      focus: string;
      target: NutritionMealTarget | null;
      primaryMeal: string | null;
      portion: string | null;
      note: string | null;
      kcal: number | null;
      proteinGrams: number | null;
      recommendationSets: NutritionMealRecommendationSet[];
      options: NutritionMealOption[];
    }>;
    consultantNotes: string[];
    hydrationRhythm: NutritionHydrationRhythmEntry[];
    substitutions: NutritionSubstitution[];
    weeklySuccessGuide: string[];
    dailyTargets: {
      calories: number | null;
      protein: number | null;
      hydration: number | null;
      movement: string;
    };
  };
};

export type NutritionMealConsumptionResult = {
  ok: boolean;
  consumedAtISO: string;
  mealKey: string;
  mealLabel: string;
};

export type RecoveryProgramRef = {
  id: string;
  title: string;
  consultantId: string | null;
  mentorId: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAtISO: string;
  updatedAtISO: string;
};

export type CareCaseRef = {
  id: string;
  userId: string;
  healthProfileId: string;
  recoveryProgramId: string;
  title: string;
  status: CareCaseStatus;
  consultantAssignment: {
    consultantId: string | null;
    mentorId: string | null;
    assignedAtISO: string | null;
  };
  assignmentHistory: ConsultantAssignmentHistoryEntry[];
  createdAtISO: string;
  updatedAtISO: string;
  provisional: boolean;
};

export type HealthEventType =
  | 'profile_created'
  | 'profile_updated'
  | 'assessment_completed'
  | 'daily_check_in_submitted'
  | 'wearable_synced'
  | 'medication_added'
  | 'medication_updated'
  | 'medication_taken'
  | 'medication_skipped'
  | 'medication_snoozed'
  | 'cycle_logged'
  | 'family_ping_sent'
  | 'family_sos_triggered';

export type HealthEventSource =
  | 'mobile.onboarding'
  | 'mobile.assessment'
  | 'mobile.tracker'
  | 'mobile.wearable'
  | 'mobile.medication'
  | 'mobile.cycle'
  | 'mobile.family';

export type HealthEventDraft = {
  id: string;
  eventType: HealthEventType;
  eventSource: HealthEventSource;
  userId: string;
  careCaseId: string;
  occurredAtISO: string;
  eventPayload: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high';
  shouldCreateTimelineEntry: boolean;
  shouldEvaluateTicket: boolean;
  schemaVersion: number;
};

export type SyncQueueStatus = 'pending' | 'processing' | 'failed' | 'completed';

export type HealthProfileSyncPayload = {
  patch: Record<string, unknown>;
  queuedAtISO: string;
};

export type HealthProfileSyncDiagnostics = {
  status: 'pending' | 'synced' | 'failed';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  retryCount: number;
};

export type SyncQueueItem = {
  id: string;
  entityType: 'health_event' | 'health_profile';
  operation: 'enqueue' | 'patch';
  status: SyncQueueStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAtISO: string | null;
  createdAtISO: string;
  updatedAtISO: string;
  payload: HealthEventDraft | HealthProfileSyncPayload;
  lastError: string | null;
};

export type TimelineItemType =
  | 'assessment'
  | 'report'
  | 'medication'
  | 'cycle'
  | 'wearable_sync'
  | 'ticket'
  | 'note'
  | 'session'
  | 'family';

export type TimelineItem = {
  id: string;
  careCaseId: string;
  type: TimelineItemType;
  title: string;
  occurredAtISO: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type HealthTicketRef = {
  id: string;
  careCaseId: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  dueDateISO: string | null;
};

export type AttachmentRef = {
  id: string;
  careCaseId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending_upload' | 'uploaded' | 'processing' | 'failed';
  uploadedAtISO: string | null;
  signedUrl?: string | null;
};

export type DeviceSession = {
  id: string;
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  createdAtISO: string;
  lastActiveAtISO: string;
  status: 'active' | 'revoked';
};
