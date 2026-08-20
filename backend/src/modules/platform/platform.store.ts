import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { syncLegacyProfessionalAssignment } from '../professional-assignments/professional-assignments.repository.js';
import {
  CareCaseRecord,
  CareCaseStage,
  ClientOwnershipContext,
  HealthEventRecord,
  HealthProfileRecord,
  HealthTicketRecord,
  NotificationRecord,
  NutritionProfileRecord,
  TimelineEventRecord
} from './platform.types.js';

const nowIso = () => new Date().toISOString();

const toIso = (value: unknown) => {
  if (value == null) return null;
  return new Date(String(value)).toISOString();
};

const toNumberOrNull = (value: unknown) => {
  if (value == null) return null;
  return Number(value);
};

const toStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
};

const toRecord = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const mapAuditFields = (row: Record<string, unknown>) => ({
  createdAtISO: new Date(String(row.created_at)).toISOString(),
  updatedAtISO: new Date(String(row.updated_at)).toISOString(),
  deletedAtISO: toIso(row.deleted_at),
  version: Number(row.version),
  status: String(row.status) as HealthProfileRecord['status']
});

const mapHealthProfile = (row: Record<string, unknown>): HealthProfileRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  clientId: row.client_id == null ? null : String(row.client_id),
  dateOfBirthISO: toIso(row.date_of_birth_iso),
  calculatedAge: row.calculated_age == null ? null : Number(row.calculated_age),
  gender: row.gender == null ? null : String(row.gender),
  heightCm: toNumberOrNull(row.height_cm),
  currentWeightKg: toNumberOrNull(row.current_weight_kg),
  goalWeightKg: toNumberOrNull(row.goal_weight_kg),
  waistCm: toNumberOrNull(row.waist_cm),
  hipCm: toNumberOrNull(row.hip_cm),
  neckCm: toNumberOrNull(row.neck_cm),
  bodyFatPct: toNumberOrNull(row.body_fat_pct),
  occupation: row.occupation == null ? null : String(row.occupation),
  workingHoursLabel: row.working_hours_label == null ? null : String(row.working_hours_label),
  shiftType: row.shift_type == null ? null : String(row.shift_type),
  activityLevel: row.activity_level == null ? null : String(row.activity_level),
  workMode: row.work_mode == null ? null : String(row.work_mode),
  travelFrequency: row.travel_frequency == null ? null : String(row.travel_frequency),
  dietType: row.diet_type == null ? null : String(row.diet_type),
  regionalCuisine: row.regional_cuisine == null ? null : String(row.regional_cuisine),
  preferredCuisines: toStringArray(row.preferred_cuisines),
  foodsLiked: toStringArray(row.foods_liked),
  foodsDisliked: toStringArray(row.foods_disliked),
  foodAllergies: toStringArray(row.food_allergies),
  foodIntolerances: toStringArray(row.food_intolerances),
  currentSupplements: toStringArray(row.current_supplements),
  currentMedicines: toStringArray(row.current_medicines),
  wakeTime: row.wake_time == null ? null : String(row.wake_time),
  breakfastTime: row.breakfast_time == null ? null : String(row.breakfast_time),
  lunchTime: row.lunch_time == null ? null : String(row.lunch_time),
  dinnerTime: row.dinner_time == null ? null : String(row.dinner_time),
  sleepTime: row.sleep_time == null ? null : String(row.sleep_time),
  mealsPerDay: row.meals_per_day == null ? null : Number(row.meals_per_day),
  waterIntakeLiters: toNumberOrNull(row.water_intake_liters),
  sleepHours: toNumberOrNull(row.sleep_hours),
  sleepGoalHours: toNumberOrNull(row.sleep_goal_hours),
  sleepQualityLabel: row.sleep_quality_label == null ? null : String(row.sleep_quality_label),
  outsideFoodFrequency: row.outside_food_frequency == null ? null : String(row.outside_food_frequency),
  cookingAtHome: row.cooking_at_home == null ? null : String(row.cooking_at_home),
  whoCooks: row.who_cooks == null ? null : String(row.who_cooks),
  smokingStatus: row.smoking_status == null ? null : String(row.smoking_status),
  alcoholFrequency: row.alcohol_frequency == null ? null : String(row.alcohol_frequency),
  exerciseFrequency: row.exercise_frequency == null ? null : String(row.exercise_frequency),
  stressLevelLabel: row.stress_level_label == null ? null : String(row.stress_level_label),
  primaryConditions: toStringArray(row.primary_conditions),
  previousConditions: toStringArray(row.previous_conditions),
  familyHistoryConditions: toStringArray(row.family_history_conditions),
  wellnessGoals: toStringArray(row.wellness_goals),
  medicalNotes: row.medical_notes == null ? null : String(row.medical_notes),
  pregnancyStatus: row.pregnancy_status == null ? null : String(row.pregnancy_status),
  breastfeedingStatus: row.breastfeeding_status == null ? null : String(row.breastfeeding_status),
  pcosStatus: row.pcos_status == null ? null : String(row.pcos_status),
  thyroidStatus: row.thyroid_status == null ? null : String(row.thyroid_status),
  diabetesStatus: row.diabetes_status == null ? null : String(row.diabetes_status),
  hypertensionStatus: row.hypertension_status == null ? null : String(row.hypertension_status),
  cholesterolStatus: row.cholesterol_status == null ? null : String(row.cholesterol_status),
  heartConditionStatus: row.heart_condition_status == null ? null : String(row.heart_condition_status),
  previousSurgeries: toStringArray(row.previous_surgeries),
  assignedConsultantId: row.assigned_consultant_id == null ? null : String(row.assigned_consultant_id),
  assignedMentorId: row.assigned_mentor_id == null ? null : String(row.assigned_mentor_id),
  ...mapAuditFields(row)
});

const mapNutritionProfile = (row: Record<string, unknown>): NutritionProfileRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  clientId: row.client_id == null ? null : String(row.client_id),
  healthProfileId: String(row.health_profile_id),
  completionPercent: Number(row.completion_percent),
  readinessScore: Number(row.readiness_score),
  aiReady: Boolean(row.ai_ready),
  missingFields: toStringArray(row.missing_fields),
  sectionScores: Array.isArray(row.section_scores)
    ? (row.section_scores as NutritionProfileRecord['sectionScores'])
    : [],
  ...mapAuditFields(row)
});

const mapCareCase = (row: Record<string, unknown>): CareCaseRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  clientId: row.client_id == null ? null : String(row.client_id),
  healthProfileId: String(row.health_profile_id),
  recoveryProgramId: String(row.recovery_program_id),
  assignedConsultantId: row.assigned_consultant_id == null ? null : String(row.assigned_consultant_id),
  assignedMentorId: row.assigned_mentor_id == null ? null : String(row.assigned_mentor_id),
  currentStage: String(row.current_stage) as CareCaseStage,
  previousStage: row.previous_stage == null ? null : (String(row.previous_stage) as CareCaseStage),
  lastTransitionAtISO: new Date(String(row.last_transition_at)).toISOString(),
  ...mapAuditFields(row)
});

const mapTimelineEvent = (row: Record<string, unknown>): TimelineEventRecord => ({
  id: String(row.id),
  careCaseId: String(row.care_case_id),
  userId: String(row.user_id),
  kind: String(row.kind) as TimelineEventRecord['kind'],
  title: String(row.title),
  detail: String(row.detail),
  eventTimeISO: new Date(String(row.event_time)).toISOString(),
  metadata: toRecord(row.metadata),
  ...mapAuditFields(row)
});

const mapHealthEvent = (row: Record<string, unknown>): HealthEventRecord => ({
  id: String(row.id),
  careCaseId: String(row.care_case_id),
  userId: String(row.user_id),
  type: String(row.event_type) as HealthEventRecord['type'],
  summary: String(row.summary),
  payload: toRecord(row.payload),
  replayKey: String(row.replay_key),
  eventTimeISO: new Date(String(row.event_time)).toISOString(),
  ...mapAuditFields(row)
});

const mapHealthTicket = (row: Record<string, unknown>): HealthTicketRecord => ({
  id: String(row.id),
  careCaseId: String(row.care_case_id),
  userId: String(row.user_id),
  type: String(row.ticket_type) as HealthTicketRecord['type'],
  priority: String(row.priority) as HealthTicketRecord['priority'],
  ownerId: row.owner_id == null ? null : String(row.owner_id),
  dueAtISO: toIso(row.due_at),
  ticketStatus: String(row.ticket_status) as HealthTicketRecord['ticketStatus'],
  resolution: row.resolution == null ? null : String(row.resolution),
  timelineEventIds: toStringArray(row.timeline_event_ids),
  ...mapAuditFields(row)
});

const mapNotification = (row: Record<string, unknown>): NotificationRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  clientId: row.client_id == null ? null : String(row.client_id),
  careCaseId: row.care_case_id == null ? null : String(row.care_case_id),
  channel: String(row.channel) as NotificationRecord['channel'],
  title: String(row.title),
  body: String(row.body),
  sentAtISO: toIso(row.sent_at),
  ...mapAuditFields(row)
});

const buildHealthProfileDefaults = (owner: ClientOwnershipContext): HealthProfileRecord => ({
  id: crypto.randomUUID(),
  userId: owner.accountId,
  clientId: owner.clientId,
  dateOfBirthISO: null,
  calculatedAge: null,
  gender: null,
  heightCm: null,
  currentWeightKg: null,
  goalWeightKg: null,
  waistCm: null,
  hipCm: null,
  neckCm: null,
  bodyFatPct: null,
  occupation: null,
  workingHoursLabel: null,
  shiftType: null,
  activityLevel: null,
  workMode: null,
  travelFrequency: null,
  dietType: null,
  regionalCuisine: null,
  preferredCuisines: [],
  foodsLiked: [],
  foodsDisliked: [],
  foodAllergies: [],
  foodIntolerances: [],
  currentSupplements: [],
  currentMedicines: [],
  wakeTime: null,
  breakfastTime: null,
  lunchTime: null,
  dinnerTime: null,
  sleepTime: null,
  mealsPerDay: null,
  waterIntakeLiters: null,
  sleepHours: null,
  sleepGoalHours: null,
  sleepQualityLabel: null,
  outsideFoodFrequency: null,
  cookingAtHome: null,
  whoCooks: null,
  smokingStatus: null,
  alcoholFrequency: null,
  exerciseFrequency: null,
  stressLevelLabel: null,
  primaryConditions: [],
  previousConditions: [],
  familyHistoryConditions: [],
  wellnessGoals: [],
  medicalNotes: null,
  pregnancyStatus: null,
  breastfeedingStatus: null,
  pcosStatus: null,
  thyroidStatus: null,
  diabetesStatus: null,
  hypertensionStatus: null,
  cholesterolStatus: null,
  heartConditionStatus: null,
  previousSurgeries: [],
  assignedConsultantId: null,
  assignedMentorId: null,
  createdAtISO: nowIso(),
  updatedAtISO: nowIso(),
  deletedAtISO: null,
  version: 1,
  status: 'active'
});

export const getHealthProfileByClientId = async (clientId: string) => {
  const result = await pool.query(
    `
      select *
      from health_profiles
      where client_id = $1
        and deleted_at is null
        and status = 'active'
      limit 1
    `,
    [clientId]
  );
  if (result.rowCount === 0) return null;
  return mapHealthProfile(result.rows[0]);
};

export const createOrUpdateHealthProfile = async (
  owner: ClientOwnershipContext,
  patch: Partial<Omit<HealthProfileRecord, 'id' | 'userId' | 'clientId'>>
) => {
  const existing = await getHealthProfileByClientId(owner.clientId);
  const next = existing
    ? {
        ...existing,
        ...patch,
        updatedAtISO: nowIso()
      }
    : {
        ...buildHealthProfileDefaults(owner),
        ...patch
      };

  if (!existing) {
    const inserted = await pool.query(
      `
        insert into health_profiles (
          id, user_id, client_id, date_of_birth_iso, calculated_age, gender, height_cm, current_weight_kg, goal_weight_kg,
          waist_cm, hip_cm, neck_cm, body_fat_pct, occupation, working_hours_label, shift_type, activity_level,
          work_mode, travel_frequency, diet_type, regional_cuisine, foods_liked, foods_disliked, food_allergies,
          food_intolerances, current_supplements, current_medicines, wake_time, breakfast_time, lunch_time,
          dinner_time, sleep_time, meals_per_day, water_intake_liters, outside_food_frequency, cooking_at_home,
          who_cooks, primary_conditions, wellness_goals, assigned_consultant_id, assigned_mentor_id, status,
          version, created_at, updated_at, deleted_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22::jsonb, $23::jsonb, $24::jsonb,
          $25::jsonb, $26::jsonb, $27::jsonb, $28, $29, $30,
          $31, $32, $33, $34, $35, $36,
          $37, $38::jsonb, $39::jsonb, $40, $41, $42,
          1, $43, $43, null
        )
        returning *
      `,
      [
        next.id,
        next.userId,
        next.clientId,
        next.dateOfBirthISO,
        next.calculatedAge,
        next.gender,
        next.heightCm,
        next.currentWeightKg,
        next.goalWeightKg,
        next.waistCm,
        next.hipCm,
        next.neckCm,
        next.bodyFatPct,
        next.occupation,
        next.workingHoursLabel,
        next.shiftType,
        next.activityLevel,
        next.workMode,
        next.travelFrequency,
        next.dietType,
        next.regionalCuisine,
        JSON.stringify(next.foodsLiked),
        JSON.stringify(next.foodsDisliked),
        JSON.stringify(next.foodAllergies),
        JSON.stringify(next.foodIntolerances),
        JSON.stringify(next.currentSupplements),
        JSON.stringify(next.currentMedicines),
        next.wakeTime,
        next.breakfastTime,
        next.lunchTime,
        next.dinnerTime,
        next.sleepTime,
        next.mealsPerDay,
        next.waterIntakeLiters,
        next.outsideFoodFrequency,
        next.cookingAtHome,
        next.whoCooks,
        JSON.stringify(next.primaryConditions),
        JSON.stringify(next.wellnessGoals),
        next.assignedConsultantId,
        next.assignedMentorId,
        next.status,
        next.createdAtISO
      ]
    );
    return saveHealthProfileProgressiveFields(inserted.rows[0].id, owner.clientId, next);
  }

  const updated = await pool.query(
    `
      update health_profiles
      set
        date_of_birth_iso = $2,
        calculated_age = $3,
        gender = $4,
        height_cm = $5,
        current_weight_kg = $6,
        goal_weight_kg = $7,
        waist_cm = $8,
        hip_cm = $9,
        neck_cm = $10,
        body_fat_pct = $11,
        occupation = $12,
        working_hours_label = $13,
        shift_type = $14,
        activity_level = $15,
        work_mode = $16,
        travel_frequency = $17,
        diet_type = $18,
        regional_cuisine = $19,
        foods_liked = $20::jsonb,
        foods_disliked = $21::jsonb,
        food_allergies = $22::jsonb,
        food_intolerances = $23::jsonb,
        current_supplements = $24::jsonb,
        current_medicines = $25::jsonb,
        wake_time = $26,
        breakfast_time = $27,
        lunch_time = $28,
        dinner_time = $29,
        sleep_time = $30,
        meals_per_day = $31,
        water_intake_liters = $32,
        outside_food_frequency = $33,
        cooking_at_home = $34,
        who_cooks = $35,
        primary_conditions = $36::jsonb,
        wellness_goals = $37::jsonb,
        assigned_consultant_id = $38,
        assigned_mentor_id = $39,
        status = $40,
        updated_at = $41,
        version = version + 1
      where id = $1
        and client_id = $42
      returning *
    `,
    [
      next.id,
      next.dateOfBirthISO,
      next.calculatedAge,
      next.gender,
      next.heightCm,
      next.currentWeightKg,
      next.goalWeightKg,
      next.waistCm,
      next.hipCm,
      next.neckCm,
      next.bodyFatPct,
      next.occupation,
      next.workingHoursLabel,
      next.shiftType,
      next.activityLevel,
      next.workMode,
      next.travelFrequency,
      next.dietType,
      next.regionalCuisine,
      JSON.stringify(next.foodsLiked),
      JSON.stringify(next.foodsDisliked),
      JSON.stringify(next.foodAllergies),
      JSON.stringify(next.foodIntolerances),
      JSON.stringify(next.currentSupplements),
      JSON.stringify(next.currentMedicines),
      next.wakeTime,
      next.breakfastTime,
      next.lunchTime,
      next.dinnerTime,
      next.sleepTime,
      next.mealsPerDay,
      next.waterIntakeLiters,
      next.outsideFoodFrequency,
      next.cookingAtHome,
      next.whoCooks,
      JSON.stringify(next.primaryConditions),
      JSON.stringify(next.wellnessGoals),
      next.assignedConsultantId,
      next.assignedMentorId,
      next.status,
      nowIso(),
      owner.clientId
    ]
  );
  if (updated.rowCount === 0) {
    throw new Error('Health profile ownership mismatch.');
  }
  await syncLegacyProfessionalAssignment({ clientUserId: owner.accountId, professionalUserId: next.assignedConsultantId ?? null, professionalType: 'CONSULTANT', actorUserId: owner.accountId });
  await syncLegacyProfessionalAssignment({ clientUserId: owner.accountId, professionalUserId: next.assignedMentorId ?? null, professionalType: 'MENTOR', actorUserId: owner.accountId });
  return saveHealthProfileProgressiveFields(updated.rows[0].id, owner.clientId, next);
};

const saveHealthProfileProgressiveFields = async (
  profileId: string,
  clientId: string,
  next: HealthProfileRecord
) => {
  const updated = await pool.query(
    `
      update health_profiles
      set
        preferred_cuisines = $3::jsonb,
        sleep_hours = $4,
        sleep_goal_hours = $5,
        smoking_status = $6,
        alcohol_frequency = $7,
        exercise_frequency = $8,
        stress_level_label = $9,
        previous_conditions = $10::jsonb,
        family_history_conditions = $11::jsonb,
        medical_notes = $12,
        pregnancy_status = $13,
        breastfeeding_status = $14,
        pcos_status = $15,
        thyroid_status = $16,
        diabetes_status = $17,
        hypertension_status = $18,
        sleep_quality_label = $19,
        cholesterol_status = $20,
        heart_condition_status = $21,
        previous_surgeries = $22::jsonb,
        updated_at = $23
      where id = $1
        and client_id = $2
      returning *
    `,
    [
      profileId,
      clientId,
      JSON.stringify(next.preferredCuisines),
      next.sleepHours,
      next.sleepGoalHours,
      next.smokingStatus,
      next.alcoholFrequency,
      next.exerciseFrequency,
      next.stressLevelLabel,
      JSON.stringify(next.previousConditions),
      JSON.stringify(next.familyHistoryConditions),
      next.medicalNotes,
      next.pregnancyStatus,
      next.breastfeedingStatus,
      next.pcosStatus,
      next.thyroidStatus,
      next.diabetesStatus,
      next.hypertensionStatus,
      next.sleepQualityLabel,
      next.cholesterolStatus,
      next.heartConditionStatus,
      JSON.stringify(next.previousSurgeries),
      nowIso(),
    ]
  );
  if (updated.rowCount === 0) {
    throw new Error('Health profile ownership mismatch.');
  }
  return mapHealthProfile(updated.rows[0]);
};

export const getNutritionProfileByClientId = async (clientId: string) => {
  const result = await pool.query(
    `
      select *
      from nutrition_profiles
      where client_id = $1
        and deleted_at is null
        and status = 'active'
      limit 1
    `,
    [clientId]
  );
  if (result.rowCount === 0) return null;
  return mapNutritionProfile(result.rows[0]);
};

export const saveNutritionProfile = async (
  owner: ClientOwnershipContext,
  healthProfileId: string,
  payload: Omit<NutritionProfileRecord, 'id' | 'userId' | 'clientId' | 'healthProfileId' | 'createdAtISO' | 'updatedAtISO' | 'deletedAtISO' | 'version' | 'status'>
) => {
  const existing = await getNutritionProfileByClientId(owner.clientId);
  const next = existing
    ? {
        ...existing,
        healthProfileId,
        ...payload,
        updatedAtISO: nowIso()
      }
    : {
        id: crypto.randomUUID(),
        userId: owner.accountId,
        clientId: owner.clientId,
        healthProfileId,
        ...payload,
        createdAtISO: nowIso(),
        updatedAtISO: nowIso(),
        deletedAtISO: null,
        version: 1,
        status: 'active' as const
      };

  if (!existing) {
    const inserted = await pool.query(
      `
        insert into nutrition_profiles (
          id, user_id, client_id, health_profile_id, completion_percent, readiness_score, ai_ready, missing_fields,
          section_scores, status, version, created_at, updated_at, deleted_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
          $9::jsonb, $10, 1, $11, $11, null
        )
        returning *
      `,
      [
        next.id,
        next.userId,
        next.clientId,
        next.healthProfileId,
        next.completionPercent,
        next.readinessScore,
        next.aiReady,
        JSON.stringify(next.missingFields),
        JSON.stringify(next.sectionScores),
        next.status,
        next.createdAtISO
      ]
    );
    return mapNutritionProfile(inserted.rows[0]);
  }

  const updated = await pool.query(
    `
      update nutrition_profiles
      set
        health_profile_id = $2,
        completion_percent = $3,
        readiness_score = $4,
        ai_ready = $5,
        missing_fields = $6::jsonb,
        section_scores = $7::jsonb,
        status = $8,
        updated_at = $9,
        version = version + 1
      where id = $1
        and client_id = $10
      returning *
    `,
    [
      next.id,
      next.healthProfileId,
      next.completionPercent,
      next.readinessScore,
      next.aiReady,
      JSON.stringify(next.missingFields),
      JSON.stringify(next.sectionScores),
      next.status,
      nowIso(),
      owner.clientId
    ]
  );
  if (updated.rowCount === 0) {
    throw new Error('Nutrition profile ownership mismatch.');
  }
  return mapNutritionProfile(updated.rows[0]);
};

const getRecoveryProgramByHealthProfileId = async (healthProfileId: string) => {
  const result = await pool.query(
    `
      select *
      from recovery_programs
      where health_profile_id = $1
        and deleted_at is null
        and status = 'active'
      limit 1
    `,
    [healthProfileId]
  );
  if (result.rowCount === 0) return null;
  return result.rows[0];
};

const createRecoveryProgramIfMissing = async (healthProfileId: string, stage: CareCaseStage) => {
  const existing = await getRecoveryProgramByHealthProfileId(healthProfileId);
  if (existing) return String(existing.id);
  const inserted = await pool.query(
    `
      insert into recovery_programs (
        id, health_profile_id, consultant_id, mentor_id, current_phase, status, version, created_at, updated_at, deleted_at
      ) values ($1, $2, null, null, $3, 'active', 1, $4, $4, null)
      returning id
    `,
    [crypto.randomUUID(), healthProfileId, stage, nowIso()]
  );
  return String(inserted.rows[0].id);
};

export const getCareCaseByClientId = async (clientId: string) => {
  const result = await pool.query(
    `
      select *
      from care_cases
      where client_id = $1
        and deleted_at is null
        and status = 'active'
      limit 1
    `,
    [clientId]
  );
  if (result.rowCount === 0) return null;
  return mapCareCase(result.rows[0]);
};

export const getCareCaseById = async (careCaseId: string) => {
  const result = await pool.query(
    `
      select *
      from care_cases
      where id = $1
        and deleted_at is null
      limit 1
    `,
    [careCaseId]
  );
  if (result.rowCount === 0) return null;
  return mapCareCase(result.rows[0]);
};

export const createCareCaseIfMissing = async (
  owner: ClientOwnershipContext,
  healthProfileId: string,
  stage: CareCaseStage = 'new_client'
) => {
  const existing = await getCareCaseByClientId(owner.clientId);
  if (existing) return existing;

  const recoveryProgramId = await createRecoveryProgramIfMissing(healthProfileId, stage);
  const inserted = await pool.query(
    `
      insert into care_cases (
        id, user_id, client_id, health_profile_id, recovery_program_id, assigned_consultant_id, assigned_mentor_id,
        current_stage, previous_stage, last_transition_at, status, version, created_at, updated_at, deleted_at
      ) values (
        $1, $2, $3, $4, $5, null, null,
        $6, null, $7, 'active', 1, $7, $7, null
      )
      returning *
    `,
    [crypto.randomUUID(), owner.accountId, owner.clientId, healthProfileId, recoveryProgramId, stage, nowIso()]
  );
  return mapCareCase(inserted.rows[0]);
};

export const updateCareCase = async (careCaseId: string, clientId: string, patch: Partial<CareCaseRecord>) => {
  const existing = await getCareCaseById(careCaseId);
  if (!existing || existing.clientId !== clientId) return null;
  const next = {
    ...existing,
    ...patch,
    updatedAtISO: nowIso()
  };
  const updated = await pool.query(
    `
      update care_cases
      set
        health_profile_id = $2,
        recovery_program_id = $3,
        assigned_consultant_id = $4,
        assigned_mentor_id = $5,
        current_stage = $6,
        previous_stage = $7,
        last_transition_at = $8,
        status = $9,
        updated_at = $10,
        version = version + 1
      where id = $1
        and client_id = $11
      returning *
    `,
    [
      next.id,
      next.healthProfileId,
      next.recoveryProgramId,
      next.assignedConsultantId,
      next.assignedMentorId,
      next.currentStage,
      next.previousStage,
      next.lastTransitionAtISO,
      next.status,
      next.updatedAtISO,
      clientId
    ]
  );
  if (updated.rowCount === 0) return null;
  await syncLegacyProfessionalAssignment({ clientUserId: existing.userId, professionalUserId: next.assignedConsultantId ?? null, professionalType: 'CONSULTANT', actorUserId: existing.userId });
  await syncLegacyProfessionalAssignment({ clientUserId: existing.userId, professionalUserId: next.assignedMentorId ?? null, professionalType: 'MENTOR', actorUserId: existing.userId });
  return mapCareCase(updated.rows[0]);
};

export const addTimelineEvent = async (input: Omit<TimelineEventRecord, 'id' | 'createdAtISO' | 'updatedAtISO' | 'deletedAtISO' | 'version' | 'status'>) => {
  const createdAtISO = nowIso();
  const inserted = await pool.query(
    `
      insert into timeline_events (
        id, care_case_id, user_id, kind, title, detail, event_time, metadata,
        status, version, created_at, updated_at, deleted_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
        'active', 1, $9, $9, null
      )
      returning *
    `,
    [
      crypto.randomUUID(),
      input.careCaseId,
      input.userId,
      input.kind,
      input.title,
      input.detail,
      input.eventTimeISO,
      JSON.stringify(input.metadata),
      createdAtISO
    ]
  );
  return mapTimelineEvent(inserted.rows[0]);
};

export const listTimelineEvents = async (careCaseId: string) => {
  const result = await pool.query(
    `
      select *
      from timeline_events
      where care_case_id = $1
        and deleted_at is null
      order by event_time desc, created_at desc
    `,
    [careCaseId]
  );
  return result.rows.map((row) => mapTimelineEvent(row));
};

export const addHealthEvent = async (input: Omit<HealthEventRecord, 'id' | 'createdAtISO' | 'updatedAtISO' | 'deletedAtISO' | 'version' | 'status'>) => {
  const createdAtISO = nowIso();
  try {
    const inserted = await pool.query(
      `
        insert into health_events (
          id, care_case_id, user_id, event_type, summary, payload, replay_key, event_time,
          status, version, created_at, updated_at, deleted_at
        ) values (
          $1, $2, $3, $4, $5, $6::jsonb, $7, $8,
          'active', 1, $9, $9, null
        )
        returning *
      `,
      [
        crypto.randomUUID(),
        input.careCaseId,
        input.userId,
        input.type,
        input.summary,
        JSON.stringify(input.payload),
        input.replayKey,
        input.eventTimeISO,
        createdAtISO
      ]
    );
    return mapHealthEvent(inserted.rows[0]);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === '23505') {
      const existing = await pool.query(
        `
          select *
          from health_events
          where replay_key = $1
            and deleted_at is null
          limit 1
        `,
        [input.replayKey],
      );
      if ((existing.rowCount ?? 0) > 0) {
        return mapHealthEvent(existing.rows[0]);
      }
    }
    throw error;
  }
};

export const listHealthEvents = async (careCaseId: string) => {
  const result = await pool.query(
    `
      select *
      from health_events
      where care_case_id = $1
        and deleted_at is null
      order by event_time desc, created_at desc
    `,
    [careCaseId]
  );
  return result.rows.map((row) => mapHealthEvent(row));
};

export const createHealthTicket = async (input: Omit<HealthTicketRecord, 'id' | 'createdAtISO' | 'updatedAtISO' | 'deletedAtISO' | 'version' | 'status'>) => {
  const createdAtISO = nowIso();
  const inserted = await pool.query(
    `
      insert into health_tickets (
        id, care_case_id, user_id, ticket_type, priority, owner_id, due_at, ticket_status,
        resolution, timeline_event_ids, status, version, created_at, updated_at, deleted_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10::jsonb, 'active', 1, $11, $11, null
      )
      returning *
    `,
    [
      crypto.randomUUID(),
      input.careCaseId,
      input.userId,
      input.type,
      input.priority,
      input.ownerId,
      input.dueAtISO,
      input.ticketStatus,
      input.resolution,
      JSON.stringify(input.timelineEventIds),
      createdAtISO
    ]
  );
  return mapHealthTicket(inserted.rows[0]);
};

export const listHealthTickets = async (careCaseId: string) => {
  const result = await pool.query(
    `
      select *
      from health_tickets
      where care_case_id = $1
        and deleted_at is null
      order by created_at desc
    `,
    [careCaseId]
  );
  return result.rows.map((row) => mapHealthTicket(row));
};

export const updateHealthTicket = async (ticketId: string, patch: Partial<HealthTicketRecord>) => {
  const result = await pool.query(
    `
      select *
      from health_tickets
      where id = $1
        and deleted_at is null
      limit 1
    `,
    [ticketId]
  );
  if (result.rowCount === 0) return null;
  const existing = mapHealthTicket(result.rows[0]);
  const next = {
    ...existing,
    ...patch,
    updatedAtISO: nowIso()
  };
  const updated = await pool.query(
    `
      update health_tickets
      set
        owner_id = $2,
        due_at = $3,
        ticket_status = $4,
        resolution = $5,
        timeline_event_ids = $6::jsonb,
        status = $7,
        updated_at = $8,
        version = version + 1
      where id = $1
      returning *
    `,
    [
      next.id,
      next.ownerId,
      next.dueAtISO,
      next.ticketStatus,
      next.resolution,
      JSON.stringify(next.timelineEventIds),
      next.status,
      next.updatedAtISO
    ]
  );
  return mapHealthTicket(updated.rows[0]);
};

export const createNotificationRecord = async (input: Omit<NotificationRecord, 'id' | 'createdAtISO' | 'updatedAtISO' | 'deletedAtISO' | 'version' | 'status'>) => {
  const createdAtISO = nowIso();
  const inserted = await pool.query(
    `
      insert into notifications (
        id, user_id, client_id, care_case_id, channel, title, body, sent_at,
        status, version, created_at, updated_at, deleted_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        'active', 1, $9, $9, null
      )
      returning *
    `,
    [
      crypto.randomUUID(),
      input.userId,
      input.clientId,
      input.careCaseId,
      input.channel,
      input.title,
      input.body,
      input.sentAtISO,
      createdAtISO
    ]
  );
  return mapNotification(inserted.rows[0]);
};

export const listNotificationsForClient = async (clientId: string) => {
  const result = await pool.query(
    `
      select *
      from notifications
      where client_id = $1
        and deleted_at is null
      order by created_at desc
    `,
    [clientId]
  );
  return result.rows.map((row) => mapNotification(row));
};

export const resetPlatformStoreForTests = async () => {
  await pool.query(`
    truncate table
      notifications,
      health_tickets,
      health_events,
      timeline_events,
      nutrition_profiles,
      care_cases,
      recovery_programs,
      health_profiles
    restart identity cascade
  `);
};
