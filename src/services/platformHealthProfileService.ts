import { AssessmentProfile, HealthProfileSyncDiagnostics, OnboardingProfile, SyncQueueItem } from '../types';
import { ApiClientError, apiFetch } from './apiClient';
import { enqueueSyncItem, getPendingSyncItems, getHealthProfileSyncDiagnostics, getSyncQueue, removeSyncQueueItem, updateHealthProfileSyncDiagnostics, updateSyncQueueItem } from './platformSyncService';
import { type StorageIdentity } from '../utils/identityScopedStorage';

export type PlatformHealthProfile = {
  id: string;
  userId: string;
  createdAtISO: string;
  updatedAtISO: string;
  dateOfBirthISO: string | null;
  calculatedAge: number | null;
  gender: OnboardingProfile['gender'] | null;
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
};

export type PlatformHealthProfileBundle = {
  profile: PlatformHealthProfile;
  nutrition: {
    completionPercent: number;
    readinessScore: number;
    aiReady: boolean;
    missingFields: string[];
  };
  reportCount?: number;
};

const positiveNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const nonEmptyArray = (value: string[] | null | undefined) =>
  Array.isArray(value) ? value.filter((item) => item.trim().length > 0) : undefined;

const compactPayload = (payload: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

const goalList = (profile: OnboardingProfile) =>
  Array.from(
    new Set(
      [
        profile.primaryGoal,
        profile.wellnessGoal,
        ...(profile.healthGoals ?? []),
        ...(profile.secondaryGoals ?? [])
      ].filter(Boolean)
    )
  );

const HEALTH_PROFILE_SYNC_MAX_ATTEMPTS = 5;
const HEALTH_PROFILE_SYNC_RETRY_DELAY_MS = 60_000;

const nextRetryAtISO = (attempts: number) => new Date(Date.now() + attempts * HEALTH_PROFILE_SYNC_RETRY_DELAY_MS).toISOString();

export const buildPlatformHealthProfilePayload = (
  onboarding: OnboardingProfile | null,
  assessment: AssessmentProfile | null
) => {
  if (!onboarding) return null;

  return compactPayload({
    dateOfBirthISO: onboarding.dateOfBirthISO,
    gender: onboarding.gender,
    heightCm: positiveNumber(assessment?.heightCm ?? onboarding.heightCm),
    currentWeightKg: positiveNumber(assessment?.weightKg ?? onboarding.currentWeightKg),
    goalWeightKg: positiveNumber(onboarding.goalWeightKg),
    waistCm: positiveNumber(onboarding.waistCm),
    hipCm: positiveNumber(onboarding.hipCm),
    neckCm: positiveNumber(onboarding.neckCm),
    bodyFatPct: positiveNumber(onboarding.bodyFatPct),
    occupation: onboarding.occupation,
    workingHoursLabel: onboarding.workingHoursLabel ?? onboarding.workHours,
    shiftType: onboarding.shiftType,
    activityLevel: onboarding.activityLevel,
    workMode: onboarding.workMode,
    travelFrequency: onboarding.travelFrequency,
    dietType: onboarding.dietType,
    regionalCuisine: onboarding.regionalCuisine,
    preferredCuisines: nonEmptyArray(onboarding.preferredCuisines),
    foodsLiked: nonEmptyArray(onboarding.foodsLiked),
    foodsDisliked: nonEmptyArray(onboarding.foodsDisliked),
    foodAllergies: nonEmptyArray(onboarding.foodAllergies),
    foodIntolerances: nonEmptyArray(onboarding.foodIntolerances),
    currentSupplements: nonEmptyArray(onboarding.currentSupplements),
    currentMedicines: nonEmptyArray(onboarding.currentMedicines),
    wakeTime: onboarding.wakeTime,
    breakfastTime: onboarding.breakfastTime,
    lunchTime: onboarding.lunchTime,
    dinnerTime: onboarding.dinnerTime,
    sleepTime: onboarding.sleepTime,
    mealsPerDay: positiveNumber(onboarding.mealsPerDay),
    waterIntakeLiters: positiveNumber(onboarding.waterIntakeLiters),
    sleepHours: positiveNumber(onboarding.sleepHours),
    sleepGoalHours: positiveNumber(onboarding.sleepGoalHours),
    sleepQualityLabel: onboarding.sleepQualityLabel,
    outsideFoodFrequency: onboarding.outsideFoodFrequency,
    cookingAtHome: onboarding.cookingAtHome,
    whoCooks: onboarding.whoCooks,
    smokingStatus: onboarding.smokingStatus,
    alcoholFrequency: onboarding.alcoholFrequency,
    exerciseFrequency: onboarding.exerciseFrequency,
    stressLevelLabel: onboarding.stressLevelLabel,
    primaryConditions: nonEmptyArray(onboarding.primaryConditions),
    previousConditions: nonEmptyArray(onboarding.previousConditions),
    familyHistoryConditions: nonEmptyArray(onboarding.familyHistoryConditions),
    wellnessGoals: goalList(onboarding),
    medicalNotes: onboarding.medicalNotes,
    pregnancyStatus: onboarding.pregnancyStatus,
    breastfeedingStatus: onboarding.breastfeedingStatus,
    pcosStatus: onboarding.pcosStatus,
    thyroidStatus: onboarding.thyroidStatus,
    diabetesStatus: onboarding.diabetesStatus,
    hypertensionStatus: onboarding.hypertensionStatus,
    cholesterolStatus: onboarding.cholesterolStatus,
    heartConditionStatus: onboarding.heartConditionStatus,
    previousSurgeries: nonEmptyArray(onboarding.previousSurgeries)
  });
};

const patchPlatformHealthProfile = (payload: Record<string, unknown>) =>
  apiFetch('/v1/platform/health-profile', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

const createHealthProfileSyncQueueItem = (payload: Record<string, unknown>): SyncQueueItem => {
  const nowISO = new Date().toISOString();
  return {
    id: `sync-health-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityType: 'health_profile',
    operation: 'patch',
    status: 'pending',
    attempts: 0,
    maxAttempts: HEALTH_PROFILE_SYNC_MAX_ATTEMPTS,
    nextAttemptAtISO: null,
    createdAtISO: nowISO,
    updatedAtISO: nowISO,
    payload: {
      patch: payload,
      queuedAtISO: nowISO
    },
    lastError: null
  };
};

export const queuePlatformHealthProfileSync = async (
  payload: Record<string, unknown>,
  identity?: StorageIdentity | null
) => {
  const existingQueue = await getSyncQueue(identity);
  const existingItem = existingQueue.find((item) => item.entityType === 'health_profile' && item.operation === 'patch');
  const queuedAtISO = new Date().toISOString();

  if (existingItem) {
    await updateSyncQueueItem(
      existingItem.id,
      (current) => ({
        ...current,
        status: 'pending',
        nextAttemptAtISO: null,
        updatedAtISO: queuedAtISO,
        payload: {
          patch: payload,
          queuedAtISO
        },
        lastError: null
      }),
      identity
    );
    await updateHealthProfileSyncDiagnostics(
      (current) => ({
        ...current,
        status: 'pending'
      }),
      identity
    );
    return { ...existingItem, payload: { patch: payload, queuedAtISO } };
  }

  const item = createHealthProfileSyncQueueItem(payload);
  await enqueueSyncItem(item, identity);
  await updateHealthProfileSyncDiagnostics(
    (current) => ({
      ...current,
      status: 'pending'
    }),
    identity
  );
  return item;
};

export const syncPlatformHealthProfile = async (
  onboarding: OnboardingProfile | null,
  assessment: AssessmentProfile | null,
  identity?: StorageIdentity | null
) => {
  const payload = buildPlatformHealthProfilePayload(onboarding, assessment);
  if (!payload) return null;

  const attemptedAt = new Date().toISOString();
  await updateHealthProfileSyncDiagnostics(
    (current) => ({
      ...current,
      status: current.status === 'failed' ? 'failed' : 'pending',
      lastAttemptAt: attemptedAt
    }),
    identity
  );

  try {
    const result = await patchPlatformHealthProfile(payload);
    await updateHealthProfileSyncDiagnostics(
      (current) => ({
        status: 'synced',
        lastAttemptAt: attemptedAt,
        lastSuccessAt: attemptedAt,
        retryCount: 0
      }),
      identity
    );
    return result;
  } catch (error) {
    await queuePlatformHealthProfileSync(payload, identity);
    await updateHealthProfileSyncDiagnostics(
      (current) => ({
        ...current,
        status: 'pending',
        lastAttemptAt: attemptedAt,
        retryCount: Math.max(current.retryCount, 1)
      }),
      identity
    );
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw error;
  }
};

export const processPendingHealthProfileSync = async (identity?: StorageIdentity | null) => {
  const queue = await getPendingSyncItems(identity);
  const healthProfileItems = queue
    .filter((item) => item.entityType === 'health_profile' && item.operation === 'patch')
    .sort((left, right) => new Date(left.createdAtISO).getTime() - new Date(right.createdAtISO).getTime());

  let processed = 0;
  for (const item of healthProfileItems) {
    const now = Date.now();
    if (item.nextAttemptAtISO && new Date(item.nextAttemptAtISO).getTime() > now) continue;
    const attemptedAt = new Date().toISOString();
    await updateSyncQueueItem(
      item.id,
      (current) => ({
        ...current,
        status: 'processing',
        updatedAtISO: attemptedAt,
        lastError: null
      }),
      identity
    );
    await updateHealthProfileSyncDiagnostics(
      (current) => ({
        ...current,
        status: 'pending',
        lastAttemptAt: attemptedAt,
        retryCount: Math.max(current.retryCount, item.attempts)
      }),
      identity
    );

    try {
      const queuePayload = item.payload as { patch: Record<string, unknown> };
      await patchPlatformHealthProfile(queuePayload.patch);
      await removeSyncQueueItem(item.id, identity);
      await updateHealthProfileSyncDiagnostics(
        () => ({
          status: 'synced',
          lastAttemptAt: attemptedAt,
          lastSuccessAt: attemptedAt,
          retryCount: 0
        }),
        identity
      );
      processed += 1;
    } catch (error) {
      const nextAttempts = item.attempts + 1;
      const nextStatus = nextAttempts >= item.maxAttempts ? 'failed' : 'pending';
      const nextAttemptAtISO = nextStatus === 'pending' ? nextRetryAtISO(nextAttempts) : null;
      await updateSyncQueueItem(
        item.id,
        (current) => ({
          ...current,
          status: nextStatus,
          attempts: nextAttempts,
          nextAttemptAtISO,
          updatedAtISO: attemptedAt,
          lastError: error instanceof Error ? error.message : 'health_profile_sync_failed'
        }),
        identity
      );
      await updateHealthProfileSyncDiagnostics(
        (current) => ({
          ...current,
          status: nextStatus === 'failed' ? 'failed' : 'pending',
          lastAttemptAt: attemptedAt,
          retryCount: nextAttempts
        }),
        identity
      );
    }
  }

  return processed;
};

export const getPlatformHealthProfileSyncDiagnostics = async (
  identity?: StorageIdentity | null
): Promise<HealthProfileSyncDiagnostics> => getHealthProfileSyncDiagnostics(identity);

export const getPlatformHealthProfile = (sessionToken?: string) =>
  apiFetch<PlatformHealthProfileBundle>('/v1/platform/health-profile', sessionToken ? {
    headers: { Authorization: `Bearer ${sessionToken}` }
  } : undefined);

const firstGoal = (profile: PlatformHealthProfile) =>
  profile.wellnessGoals.find(Boolean) as OnboardingProfile['primaryGoal'] | undefined;

export const mergePlatformProfileIntoOnboarding = (
  onboarding: OnboardingProfile,
  profile: PlatformHealthProfile
): OnboardingProfile => {
  const primaryGoal = firstGoal(profile) ?? onboarding.primaryGoal;
  return {
    ...onboarding,
    dateOfBirthISO: profile.dateOfBirthISO ?? onboarding.dateOfBirthISO,
    calculatedAge: profile.calculatedAge ?? onboarding.calculatedAge,
    age: profile.calculatedAge ?? onboarding.age,
    gender: profile.gender ?? onboarding.gender,
    heightCm: profile.heightCm ?? onboarding.heightCm,
    currentWeightKg: profile.currentWeightKg ?? onboarding.currentWeightKg,
    goalWeightKg: profile.goalWeightKg ?? onboarding.goalWeightKg,
    waistCm: profile.waistCm ?? onboarding.waistCm,
    hipCm: profile.hipCm ?? onboarding.hipCm,
    neckCm: profile.neckCm ?? onboarding.neckCm,
    bodyFatPct: profile.bodyFatPct ?? onboarding.bodyFatPct,
    occupation: profile.occupation ?? onboarding.occupation,
    workingHoursLabel: profile.workingHoursLabel ?? onboarding.workingHoursLabel,
    shiftType: profile.shiftType ?? onboarding.shiftType,
    activityLevel: profile.activityLevel ?? onboarding.activityLevel,
    workMode: profile.workMode ?? onboarding.workMode,
    travelFrequency: profile.travelFrequency ?? onboarding.travelFrequency,
    dietType: profile.dietType ?? onboarding.dietType,
    regionalCuisine: profile.regionalCuisine ?? onboarding.regionalCuisine,
    preferredCuisines: profile.preferredCuisines.length > 0 ? profile.preferredCuisines : onboarding.preferredCuisines,
    foodsLiked: profile.foodsLiked.length > 0 ? profile.foodsLiked : onboarding.foodsLiked,
    foodsDisliked: profile.foodsDisliked.length > 0 ? profile.foodsDisliked : onboarding.foodsDisliked,
    foodAllergies: profile.foodAllergies.length > 0 ? profile.foodAllergies : onboarding.foodAllergies,
    foodIntolerances: profile.foodIntolerances.length > 0 ? profile.foodIntolerances : onboarding.foodIntolerances,
    currentSupplements: profile.currentSupplements.length > 0 ? profile.currentSupplements : onboarding.currentSupplements,
    currentMedicines: profile.currentMedicines.length > 0 ? profile.currentMedicines : onboarding.currentMedicines,
    wakeTime: profile.wakeTime ?? onboarding.wakeTime,
    breakfastTime: profile.breakfastTime ?? onboarding.breakfastTime,
    lunchTime: profile.lunchTime ?? onboarding.lunchTime,
    dinnerTime: profile.dinnerTime ?? onboarding.dinnerTime,
    sleepTime: profile.sleepTime ?? onboarding.sleepTime,
    mealsPerDay: profile.mealsPerDay ?? onboarding.mealsPerDay,
    waterIntakeLiters: profile.waterIntakeLiters ?? onboarding.waterIntakeLiters,
    sleepHours: profile.sleepHours ?? onboarding.sleepHours,
    sleepGoalHours: profile.sleepGoalHours ?? onboarding.sleepGoalHours,
    sleepQualityLabel: profile.sleepQualityLabel ?? onboarding.sleepQualityLabel,
    outsideFoodFrequency: profile.outsideFoodFrequency ?? onboarding.outsideFoodFrequency,
    cookingAtHome: profile.cookingAtHome ?? onboarding.cookingAtHome,
    whoCooks: profile.whoCooks ?? onboarding.whoCooks,
    smokingStatus: profile.smokingStatus ?? onboarding.smokingStatus,
    alcoholFrequency: profile.alcoholFrequency ?? onboarding.alcoholFrequency,
    exerciseFrequency: profile.exerciseFrequency ?? onboarding.exerciseFrequency,
    stressLevelLabel: profile.stressLevelLabel ?? onboarding.stressLevelLabel,
    primaryConditions: profile.primaryConditions.length > 0 ? profile.primaryConditions as OnboardingProfile['primaryConditions'] : onboarding.primaryConditions,
    previousConditions: profile.previousConditions.length > 0 ? profile.previousConditions as OnboardingProfile['previousConditions'] : onboarding.previousConditions,
    familyHistoryConditions: profile.familyHistoryConditions.length > 0 ? profile.familyHistoryConditions as OnboardingProfile['familyHistoryConditions'] : onboarding.familyHistoryConditions,
    healthGoals: profile.wellnessGoals.length > 0 ? profile.wellnessGoals as OnboardingProfile['healthGoals'] : onboarding.healthGoals,
    primaryGoal,
    wellnessGoal: primaryGoal,
    medicalNotes: profile.medicalNotes ?? onboarding.medicalNotes,
    pregnancyStatus: profile.pregnancyStatus ?? onboarding.pregnancyStatus,
    breastfeedingStatus: profile.breastfeedingStatus ?? onboarding.breastfeedingStatus,
    pcosStatus: profile.pcosStatus ?? onboarding.pcosStatus,
    thyroidStatus: profile.thyroidStatus ?? onboarding.thyroidStatus,
    diabetesStatus: profile.diabetesStatus ?? onboarding.diabetesStatus,
    hypertensionStatus: profile.hypertensionStatus ?? onboarding.hypertensionStatus,
    cholesterolStatus: profile.cholesterolStatus ?? onboarding.cholesterolStatus,
    heartConditionStatus: profile.heartConditionStatus ?? onboarding.heartConditionStatus,
    previousSurgeries: profile.previousSurgeries.length > 0 ? profile.previousSurgeries : onboarding.previousSurgeries
  };
};
