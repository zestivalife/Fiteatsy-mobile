import crypto from 'node:crypto';
const nowIso = () => new Date().toISOString();
function baseAudit() {
    return {
        createdAtISO: nowIso(),
        updatedAtISO: nowIso(),
        deletedAtISO: null,
        version: 1,
        status: 'active',
    };
}
function nextVersion(entity) {
    entity.version += 1;
    entity.updatedAtISO = nowIso();
    return entity;
}
const healthProfiles = new Map();
const nutritionProfiles = new Map();
const careCases = new Map();
const timelineEvents = new Map();
const healthEvents = new Map();
const healthTickets = new Map();
const notifications = new Map();
export const createOrUpdateHealthProfile = (userId, patch) => {
    const existing = Array.from(healthProfiles.values()).find((item) => item.userId === userId);
    if (existing) {
        Object.assign(existing, patch);
        nextVersion(existing);
        healthProfiles.set(existing.id, existing);
        return existing;
    }
    const created = {
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
export const getHealthProfileByUserId = (userId) => Array.from(healthProfiles.values()).find((item) => item.userId === userId) ?? null;
export const saveNutritionProfile = (userId, healthProfileId, payload) => {
    const existing = Array.from(nutritionProfiles.values()).find((item) => item.userId === userId);
    if (existing) {
        Object.assign(existing, payload);
        nextVersion(existing);
        nutritionProfiles.set(existing.id, existing);
        return existing;
    }
    const created = {
        id: `np_${crypto.randomUUID()}`,
        userId,
        healthProfileId,
        ...baseAudit(),
        ...payload,
    };
    nutritionProfiles.set(created.id, created);
    return created;
};
export const getNutritionProfileByUserId = (userId) => Array.from(nutritionProfiles.values()).find((item) => item.userId === userId) ?? null;
export const createCareCaseIfMissing = (userId, healthProfileId, stage = 'new_client') => {
    const existing = Array.from(careCases.values()).find((item) => item.userId === userId);
    if (existing)
        return existing;
    const created = {
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
export const getCareCaseByUserId = (userId) => Array.from(careCases.values()).find((item) => item.userId === userId) ?? null;
export const getCareCaseById = (careCaseId) => careCases.get(careCaseId) ?? null;
export const updateCareCase = (careCaseId, patch) => {
    const record = careCases.get(careCaseId);
    if (!record)
        return null;
    Object.assign(record, patch);
    nextVersion(record);
    careCases.set(careCaseId, record);
    return record;
};
export const addTimelineEvent = (input) => {
    const record = {
        id: `tle_${crypto.randomUUID()}`,
        ...baseAudit(),
        ...input,
    };
    timelineEvents.set(record.id, record);
    return record;
};
export const listTimelineEvents = (careCaseId) => Array.from(timelineEvents.values())
    .filter((item) => item.careCaseId === careCaseId)
    .sort((a, b) => (a.eventTimeISO < b.eventTimeISO ? 1 : -1));
export const addHealthEvent = (input) => {
    const record = {
        id: `hev_${crypto.randomUUID()}`,
        ...baseAudit(),
        ...input,
    };
    healthEvents.set(record.id, record);
    return record;
};
export const listHealthEvents = (careCaseId) => Array.from(healthEvents.values())
    .filter((item) => item.careCaseId === careCaseId)
    .sort((a, b) => (a.eventTimeISO < b.eventTimeISO ? 1 : -1));
export const createHealthTicket = (input) => {
    const record = {
        id: `htk_${crypto.randomUUID()}`,
        ...baseAudit(),
        ...input,
    };
    healthTickets.set(record.id, record);
    return record;
};
export const listHealthTickets = (careCaseId) => Array.from(healthTickets.values())
    .filter((item) => item.careCaseId === careCaseId)
    .sort((a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1));
export const updateHealthTicket = (ticketId, patch) => {
    const record = healthTickets.get(ticketId);
    if (!record)
        return null;
    Object.assign(record, patch);
    nextVersion(record);
    healthTickets.set(ticketId, record);
    return record;
};
export const createNotificationRecord = (input) => {
    const record = {
        id: `ntf_${crypto.randomUUID()}`,
        ...baseAudit(),
        ...input,
    };
    notifications.set(record.id, record);
    return record;
};
export const listNotificationsForUser = (userId) => Array.from(notifications.values())
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
