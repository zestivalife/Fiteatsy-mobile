export type EntityStatus = 'active' | 'inactive' | 'archived' | 'deleted';

export type AuditFields = {
  createdAtISO: string;
  updatedAtISO: string;
  deletedAtISO: string | null;
  version: number;
  status: EntityStatus;
};

export type AuthUserSession = {
  userId: string;
  deviceId: string;
  sessionId: string;
};

export type ClientOwnershipContext = {
  accountId: string;
  clientId: string;
};

export type HealthProfileSectionKey =
  | 'basic_information'
  | 'body_composition'
  | 'lifestyle'
  | 'meal_behaviour'
  | 'food_preferences'
  | 'medical_history'
  | 'blood_reports';

export type HealthProfileRecord = AuditFields & {
  id: string;
  userId: string;
  clientId: string | null;
  dateOfBirthISO: string | null;
  calculatedAge: number | null;
  gender: string | null;
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
  sleepQualityLabel: string | null;
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
  cholesterolStatus: string | null;
  heartConditionStatus: string | null;
  previousSurgeries: string[];
  assignedConsultantId: string | null;
  assignedMentorId: string | null;
};

export type NutritionProfileRecord = AuditFields & {
  id: string;
  userId: string;
  clientId: string | null;
  healthProfileId: string;
  completionPercent: number;
  readinessScore: number;
  aiReady: boolean;
  missingFields: string[];
  sectionScores: Array<{
    section: HealthProfileSectionKey;
    completed: number;
    total: number;
    percent: number;
    missing: string[];
  }>;
};

export type CareCaseStage =
  | 'new_client'
  | 'health_profile_pending'
  | 'blood_report_pending'
  | 'ready_for_consultant'
  | 'consultant_review'
  | 'ai_draft_generated'
  | 'diet_published'
  | 'active_monitoring'
  | 'followup_due'
  | 'program_completed';

export type CareCaseRecord = AuditFields & {
  id: string;
  userId: string;
  clientId: string | null;
  healthProfileId: string;
  recoveryProgramId: string;
  assignedConsultantId: string | null;
  assignedMentorId: string | null;
  currentStage: CareCaseStage;
  previousStage: CareCaseStage | null;
  lastTransitionAtISO: string;
};

export type TimelineEventKind =
  | 'registration'
  | 'assessment_completed'
  | 'health_profile_updated'
  | 'blood_report_uploaded'
  | 'ocr_completed'
  | 'biomarkers_updated'
  | 'nutrition_profile_completed'
  | 'diet_published'
  | 'consultant_assigned'
  | 'ticket_created'
  | 'ticket_resolved'
  | 'stage_changed'
  | 'notification_sent';

export type TimelineEventRecord = AuditFields & {
  id: string;
  careCaseId: string;
  userId: string;
  kind: TimelineEventKind;
  title: string;
  detail: string;
  eventTimeISO: string;
  metadata: Record<string, unknown>;
};

export type HealthEventType = TimelineEventKind | 'medication_logged' | 'meal_logged' | 'water_logged' | 'sleep_logged' | 'exercise_logged' | 'cycle_updated' | 'mood_logged' | 'chat_sent' | 'voice_note_uploaded' | 'followup_completed' | 'stress_assessment_completed' | 'wellness_checkin_logged';

export type HealthEventRecord = AuditFields & {
  id: string;
  careCaseId: string;
  userId: string;
  type: HealthEventType;
  summary: string;
  payload: Record<string, unknown>;
  replayKey: string;
  eventTimeISO: string;
};

export type HealthTicketType =
  | 'new_client'
  | 'blood_report_review'
  | 'missing_health_profile'
  | 'medication_non_adherence'
  | 'low_recovery_score'
  | 'biomarker_alert'
  | 'followup_due'
  | 'mentor_escalation'
  | 'renewal_reminder';

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_for_client' | 'resolved' | 'dismissed';

export type HealthTicketRecord = AuditFields & {
  id: string;
  careCaseId: string;
  userId: string;
  type: HealthTicketType;
  priority: TicketPriority;
  ownerId: string | null;
  dueAtISO: string | null;
  ticketStatus: TicketStatus;
  resolution: string | null;
  timelineEventIds: string[];
};

export type NotificationChannel = 'push' | 'in_app' | 'email' | 'whatsapp';

export type NotificationRecord = AuditFields & {
  id: string;
  userId: string;
  clientId: string | null;
  careCaseId: string | null;
  channel: NotificationChannel;
  title: string;
  body: string;
  sentAtISO: string | null;
};

export type NutritionPlanLifecycle =
  | 'draft'
  | 'review_ready'
  | 'approved'
  | 'published'
  | 'archived';

export type NutritionMealSlot = {
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
  options: NutritionMealSlot[];
};

export type HydrationRhythmEntry = {
  slot: number;
  anchor: string;
  quantity: string;
  note: string;
};

export type SmartSubstitutionEntry = {
  foodGroup: string;
  usualChoice: string;
  alternative: string;
};

export type SupplementClinicalNote = {
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
  hydrationRhythm: HydrationRhythmEntry[];
  weeklySuccessGuide: string[];
  smartSubstitutions: SmartSubstitutionEntry[];
  supplementsAndClinicalNotes: SupplementClinicalNote[];
};

export type NutritionPlanSourceSnapshot = {
  bmi: number | null;
  weightKg: number | null;
  biomarkers: Array<{
    name: string;
    value: number;
    unit: string;
    status: string;
    referenceRange: string | null;
    testDate: string;
  }>;
  healthProfile: Record<string, unknown>;
  calorieTarget: number | null;
  proteinTargetGrams: number | null;
  hydrationTargetLiters: number | null;
  wellnessScores?: {
    nourishment: number | null;
    energyBalance: number | null;
    bodySupport: number | null;
    recovery: number | null;
    activePerformance: number | null;
    physicalWellnessIndex: number | null;
    stressResilience: number | null;
  };
  stressAssessment?: {
    scale: 'PSS-10';
    totalScore: number;
    stressPercent: number;
    resilienceScore: number;
    stressBand: 'low' | 'moderate' | 'high';
    calculatedAtISO: string;
  } | null;
  generatedAtISO: string;
};

export type NutritionIntelligence = {
  riskLevel: 'low' | 'needs_attention' | 'high';
  observations: Array<{
    title: string;
    detail: string;
    sources: string[];
  }>;
  recommendations: Array<{
    title: string;
    detail: string;
    sources: string[];
    requiresConsultantReview: boolean;
  }>;
  nutritionFocus: string[];
  foodRecommendations: string[];
  consultantActions: string[];
  clientSummary: {
    goal: string | null;
    age: number | null;
    gender: string | null;
    weightKg: number | null;
    bmi: number | null;
    activityLevel: string | null;
    sleepQuality: string | null;
    stressBand: 'low' | 'moderate' | 'high' | null;
    stressPercent: number | null;
    hydrationTargetLiters: number | null;
    waterIntakeLiters: number | null;
  };
  biomarkerSnapshot: Array<{
    name: string;
    value: number;
    unit: string;
    status: string;
    referenceRange: string | null;
    testDate: string;
  }>;
  abnormalities: string[];
  deficiencies: string[];
  wellnessScores: {
    nourishment: number | null;
    energyBalance: number | null;
    bodySupport: number | null;
    recovery: number | null;
    activePerformance: number | null;
    physicalWellnessIndex: number | null;
    stressResilience: number | null;
  };
  generationInputs: {
    caloriesTarget: number | null;
    proteinTargetGrams: number | null;
    carbohydrateTargetGrams: number | null;
    fatTargetGrams: number | null;
    hydrationTargetLiters: number | null;
    dietPreference: string | null;
    medicalConditions: string[];
    lifestyleSummary: string;
    wearableConnected: boolean;
  };
  mealTargets?: Record<string, NutritionMealTarget>;
};

export type DietPlanRecord = AuditFields & {
  id: string;
  careCaseId: string;
  userId: string;
  consultantId: string | null;
  currentVersionId: string | null;
  latestPublishedVersionId: string | null;
  planStatus: NutritionPlanLifecycle;
  readinessScore: number | null;
  templateVersion: string;
  approvedBy: string | null;
  approvedAtISO: string | null;
  publishedAtISO: string | null;
  archivedAtISO: string | null;
  sourceSnapshot: NutritionPlanSourceSnapshot;
};

export type DietPlanVersionRecord = AuditFields & {
  id: string;
  dietPlanId: string;
  versionNumber: number;
  generatedBy: string;
  content: NutritionPlanContent;
  sourceSnapshot: NutritionPlanSourceSnapshot;
  contentSummary: {
    calories: number | null;
    protein: number | null;
    hydration: number | null;
    focusAreas: string[];
  };
  lifecycleStatus: NutritionPlanLifecycle;
  reviewNotes: string | null;
  exportedDocPath: string | null;
  exportedPdfPath: string | null;
};

export type ReportPipelineProgress = {
  uploadPercent: number;
  ocrPercent: number;
  processingPercent: number;
  aiAnalysisPercent: number;
  completed: boolean;
};
