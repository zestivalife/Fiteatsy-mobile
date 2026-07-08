import crypto from 'node:crypto';
import {
  CareCaseRecord,
  CareCaseStage,
  HealthEventRecord,
  HealthProfileRecord,
  HealthTicketRecord,
  NotificationRecord,
  NutritionProfileRecord,
  TimelineEventRecord,
} from './platform.types.js';

const nowIso = () => new Date().toISOString();

function baseAudit() {
  return {
    createdAtISO: nowIso(),
    updatedAtISO: nowIso(),
    deletedAtISO: null,
    version: 1,
    status: 'active' as const,
  };
}

function nextVersion<T extends { version: number; updatedAtISO: string }>(entity: T) {
  entity.version += 1;
  entity.updatedAtISO = nowIso();
  return entity;
}

const healthProfiles = new Map<string, HealthProfileRecord>();
const nutritionProfiles = new Map<string, NutritionProfileRecord>();
const careCases = new Map<string, CareCaseRecord>();
const timelineEvents = new Map<string, TimelineEventRecord>();
const healthEvents = new Map<string, HealthEventRecord>();
const healthTickets = new Map<string, HealthTicketRecord>();
const notifications = new Map<string, NotificationRecord>();

export const createOrUpdateHealthProfile = (
  userId: string,
  patch: Partial<Omit<HealthProfileRecord, 'id' | 'userId'>>
) => {
  const existing = Array.from(healthProfiles.values()).find((item) => item.userId === userId);
  if (existing) {
    Object.assign(existing, patch);
    nextVersion(existing);
    healthProfiles.set(existing.id, existing);
    return existing;
  }

  const created: HealthProfileRecord = {
    id: `hp_${crypto.randomUUID()}`,
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
    ...baseAudit(),
    ...patch,
  };
  healthProfiles.set(created.id, created);
  return created;
};

export const getHealthProfileByUserId = (userId: string) =>
  Array.from(healthProfiles.values()).find((item) => item.userId === userId) ?? null;

export const saveNutritionProfile = (
  userId: string,
  healthProfileId: string,
  payload: Omit<NutritionProfileRecord, 'id' | 'userId' | 'healthProfileId' | keyof ReturnType<typeof baseAudit>>
) => {
  const existing = Array.from(nutritionProfiles.values()).find((item) => item.userId === userId);
  if (existing) {
    Object.assign(existing, payload);
    nextVersion(existing);
    nutritionProfiles.set(existing.id, existing);
    return existing;
  }

  const created: NutritionProfileRecord = {
    id: `np_${crypto.randomUUID()}`,
    userId,
    healthProfileId,
    ...baseAudit(),
    ...payload,
  };
  nutritionProfiles.set(created.id, created);
  return created;
};

export const getNutritionProfileByUserId = (userId: string) =>
  Array.from(nutritionProfiles.values()).find((item) => item.userId === userId) ?? null;

export const createCareCaseIfMissing = (
  userId: string,
  healthProfileId: string,
  stage: CareCaseStage = 'new_client'
) => {
  const existing = Array.from(careCases.values()).find((item) => item.userId === userId);
  if (existing) return existing;
  const created: CareCaseRecord = {
    id: `cc_${crypto.randomUUID()}`,
    userId,
    healthProfileId,
    recoveryProgramId: `rp_${crypto.randomUUID()}`,
    assignedConsultantId: null,
    assignedMentorId: null,
    currentStage: stage,
    previousStage: null,
    lastTransitionAtISO: nowIso(),
    ...baseAudit(),
  };
  careCases.set(created.id, created);
  return created;
};

export const getCareCaseByUserId = (userId: string) =>
  Array.from(careCases.values()).find((item) => item.userId === userId) ?? null;

export const getCareCaseById = (careCaseId: string) => careCases.get(careCaseId) ?? null;

export const updateCareCase = (careCaseId: string, patch: Partial<CareCaseRecord>) => {
  const record = careCases.get(careCaseId);
  if (!record) return null;
  Object.assign(record, patch);
  nextVersion(record);
  careCases.set(careCaseId, record);
  return record;
};

export const addTimelineEvent = (
  input: Omit<TimelineEventRecord, 'id' | keyof ReturnType<typeof baseAudit>>
) => {
  const record: TimelineEventRecord = {
    id: `tle_${crypto.randomUUID()}`,
    ...baseAudit(),
    ...input,
  };
  timelineEvents.set(record.id, record);
  return record;
};

export const listTimelineEvents = (careCaseId: string) =>
  Array.from(timelineEvents.values())
    .filter((item) => item.careCaseId === careCaseId)
    .sort((a, b) => (a.eventTimeISO < b.eventTimeISO ? 1 : -1));

export const addHealthEvent = (
  input: Omit<HealthEventRecord, 'id' | keyof ReturnType<typeof baseAudit>>
) => {
  const record: HealthEventRecord = {
    id: `hev_${crypto.randomUUID()}`,
    ...baseAudit(),
    ...input,
  };
  healthEvents.set(record.id, record);
  return record;
};

export const listHealthEvents = (careCaseId: string) =>
  Array.from(healthEvents.values())
    .filter((item) => item.careCaseId === careCaseId)
    .sort((a, b) => (a.eventTimeISO < b.eventTimeISO ? 1 : -1));

export const createHealthTicket = (
  input: Omit<HealthTicketRecord, 'id' | keyof ReturnType<typeof baseAudit>>
) => {
  const record: HealthTicketRecord = {
    id: `htk_${crypto.randomUUID()}`,
    ...baseAudit(),
    ...input,
  };
  healthTickets.set(record.id, record);
  return record;
};

export const listHealthTickets = (careCaseId: string) =>
  Array.from(healthTickets.values())
    .filter((item) => item.careCaseId === careCaseId)
    .sort((a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1));

export const updateHealthTicket = (ticketId: string, patch: Partial<HealthTicketRecord>) => {
  const record = healthTickets.get(ticketId);
  if (!record) return null;
  Object.assign(record, patch);
  nextVersion(record);
  healthTickets.set(ticketId, record);
  return record;
};

export const createNotificationRecord = (
  input: Omit<NotificationRecord, 'id' | keyof ReturnType<typeof baseAudit>>
) => {
  const record: NotificationRecord = {
    id: `ntf_${crypto.randomUUID()}`,
    ...baseAudit(),
    ...input,
  };
  notifications.set(record.id, record);
  return record;
};

export const listNotificationsForUser = (userId: string) =>
  Array.from(notifications.values())
    .filter((item) => item.userId === userId)
    .sort((a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1));

export const resetPlatformStoreForTests = () => {
  healthProfiles.clear();
  nutritionProfiles.clear();
  careCases.clear();
  timelineEvents.clear();
  healthEvents.clear();
  healthTickets.clear();
  notifications.clear();
};
