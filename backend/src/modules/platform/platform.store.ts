import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import {
  CareCaseRecord,
  CareCaseStage,
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
  outsideFoodFrequency: row.outside_food_frequency == null ? null : String(row.outside_food_frequency),
  cookingAtHome: row.cooking_at_home == null ? null : String(row.cooking_at_home),
  whoCooks: row.who_cooks == null ? null : String(row.who_cooks),
  primaryConditions: toStringArray(row.primary_conditions),
  wellnessGoals: toStringArray(row.wellness_goals),
  assignedConsultantId: row.assigned_consultant_id == null ? null : String(row.assigned_consultant_id),
  assignedMentorId: row.assigned_mentor_id == null ? null : String(row.assigned_mentor_id),
  ...mapAuditFields(row)
});

const mapNutritionProfile = (row: Record<string, unknown>): NutritionProfileRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
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
  careCaseId: row.care_case_id == null ? null : String(row.care_case_id),
  channel: String(row.channel) as NotificationRecord['channel'],
  title: String(row.title),
  body: String(row.body),
  sentAtISO: toIso(row.sent_at),
  ...mapAuditFields(row)
});

const buildHealthProfileDefaults = (userId: string): HealthProfileRecord => ({
  id: crypto.randomUUID(),
  userId,
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
  outsideFoodFrequency: null,
  cookingAtHome: null,
  whoCooks: null,
  primaryConditions: [],
  wellnessGoals: [],
  assignedConsultantId: null,
  assignedMentorId: null,
  createdAtISO: nowIso(),
  updatedAtISO: nowIso(),
  deletedAtISO: null,
  version: 1,
  status: 'active'
});

export const getHealthProfileByUserId = async (userId: string) => {
  const result = await pool.query(
    `
      select *
      from health_profiles
      where user_id = $1
        and deleted_at is null
        and status = 'active'
      limit 1
    `,
    [userId]
  );
  if (result.rowCount === 0) return null;
  return mapHealthProfile(result.rows[0]);
};

export const createOrUpdateHealthProfile = async (
  userId: string,
  patch: Partial<Omit<HealthProfileRecord, 'id' | 'userId'>>
) => {
  const existing = await getHealthProfileByUserId(userId);
  const next = existing
    ? {
        ...existing,
        ...patch,
        updatedAtISO: nowIso()
      }
    : {
        ...buildHealthProfileDefaults(userId),
        ...patch
      };

  if (!existing) {
    const inserted = await pool.query(
      `
        insert into health_profiles (
          id, user_id, date_of_birth_iso, calculated_age, gender, height_cm, current_weight_kg, goal_weight_kg,
          waist_cm, hip_cm, neck_cm, body_fat_pct, occupation, working_hours_label, shift_type, activity_level,
          work_mode, travel_frequency, diet_type, regional_cuisine, foods_liked, foods_disliked, food_allergies,
          food_intolerances, current_supplements, current_medicines, wake_time, breakfast_time, lunch_time,
          dinner_time, sleep_time, meals_per_day, water_intake_liters, outside_food_frequency, cooking_at_home,
          who_cooks, primary_conditions, wellness_goals, assigned_consultant_id, assigned_mentor_id, status,
          version, created_at, updated_at, deleted_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21::jsonb, $22::jsonb, $23::jsonb,
          $24::jsonb, $25::jsonb, $26::jsonb, $27, $28, $29,
          $30, $31, $32, $33, $34, $35,
          $36, $37::jsonb, $38::jsonb, $39, $40, $41,
          1, $42, $42, null
        )
        returning *
      `,
      [
        next.id,
        next.userId,
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
    return mapHealthProfile(inserted.rows[0]);
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
      nowIso()
    ]
  );
  return mapHealthProfile(updated.rows[0]);
};

export const getNutritionProfileByUserId = async (userId: string) => {
  const result = await pool.query(
    `
      select *
      from nutrition_profiles
      where user_id = $1
        and deleted_at is null
        and status = 'active'
      limit 1
    `,
    [userId]
  );
  if (result.rowCount === 0) return null;
  return mapNutritionProfile(result.rows[0]);
};

export const saveNutritionProfile = async (
  userId: string,
  healthProfileId: string,
  payload: Omit<NutritionProfileRecord, 'id' | 'userId' | 'healthProfileId' | 'createdAtISO' | 'updatedAtISO' | 'deletedAtISO' | 'version' | 'status'>
) => {
  const existing = await getNutritionProfileByUserId(userId);
  const next = existing
    ? {
        ...existing,
        healthProfileId,
        ...payload,
        updatedAtISO: nowIso()
      }
    : {
        id: crypto.randomUUID(),
        userId,
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
          id, user_id, health_profile_id, completion_percent, readiness_score, ai_ready, missing_fields,
          section_scores, status, version, created_at, updated_at, deleted_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7::jsonb,
          $8::jsonb, $9, 1, $10, $10, null
        )
        returning *
      `,
      [
        next.id,
        next.userId,
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
      nowIso()
    ]
  );
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

export const getCareCaseByUserId = async (userId: string) => {
  const result = await pool.query(
    `
      select *
      from care_cases
      where user_id = $1
        and deleted_at is null
        and status = 'active'
      limit 1
    `,
    [userId]
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
  userId: string,
  healthProfileId: string,
  stage: CareCaseStage = 'new_client'
) => {
  const existing = await getCareCaseByUserId(userId);
  if (existing) return existing;

  const recoveryProgramId = await createRecoveryProgramIfMissing(healthProfileId, stage);
  const inserted = await pool.query(
    `
      insert into care_cases (
        id, user_id, health_profile_id, recovery_program_id, assigned_consultant_id, assigned_mentor_id,
        current_stage, previous_stage, last_transition_at, status, version, created_at, updated_at, deleted_at
      ) values (
        $1, $2, $3, $4, null, null,
        $5, null, $6, 'active', 1, $6, $6, null
      )
      returning *
    `,
    [crypto.randomUUID(), userId, healthProfileId, recoveryProgramId, stage, nowIso()]
  );
  return mapCareCase(inserted.rows[0]);
};

export const updateCareCase = async (careCaseId: string, patch: Partial<CareCaseRecord>) => {
  const existing = await getCareCaseById(careCaseId);
  if (!existing) return null;
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
      next.updatedAtISO
    ]
  );
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
        id, user_id, care_case_id, channel, title, body, sent_at,
        status, version, created_at, updated_at, deleted_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7,
        'active', 1, $8, $8, null
      )
      returning *
    `,
    [
      crypto.randomUUID(),
      input.userId,
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

export const listNotificationsForUser = async (userId: string) => {
  const result = await pool.query(
    `
      select *
      from notifications
      where user_id = $1
        and deleted_at is null
      order by created_at desc
    `,
    [userId]
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
