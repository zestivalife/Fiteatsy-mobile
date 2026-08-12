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

export type HealthEventType = TimelineEventKind | 'medication_logged' | 'meal_logged' | 'water_logged' | 'sleep_logged' | 'exercise_logged' | 'cycle_updated' | 'mood_logged' | 'chat_sent' | 'voice_note_uploaded' | 'followup_completed';

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

export type ReportPipelineProgress = {
  uploadPercent: number;
  ocrPercent: number;
  processingPercent: number;
  aiAnalysisPercent: number;
  completed: boolean;
};
