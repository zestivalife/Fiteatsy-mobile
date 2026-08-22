import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveOnboardingGate } from '../src/utils/onboardingGate';
import type { PlatformHealthProfile } from '../src/services/platformHealthProfileService';

const profile = (overrides: Partial<PlatformHealthProfile> = {}): PlatformHealthProfile => ({
  id: 'profile-test', userId: 'user-test', createdAtISO: '2026-01-01T00:00:00.000Z', updatedAtISO: '2026-01-01T00:00:00.000Z',
  dateOfBirthISO: '1996-01-01T00:00:00.000Z', calculatedAge: 30, gender: 'Prefer not to say', heightCm: 170, currentWeightKg: 68,
  goalWeightKg: null, waistCm: null, hipCm: null, neckCm: null, bodyFatPct: null, occupation: null, workingHoursLabel: null,
  shiftType: null, activityLevel: null, workMode: null, travelFrequency: null, dietType: null, regionalCuisine: null,
  preferredCuisines: [], foodsLiked: [], foodsDisliked: [], foodAllergies: [], foodIntolerances: [], currentSupplements: [],
  currentMedicines: [], wakeTime: null, breakfastTime: null, lunchTime: null, dinnerTime: null, sleepTime: null, mealsPerDay: null,
  waterIntakeLiters: null, sleepHours: null, sleepGoalHours: null, sleepQualityLabel: null, outsideFoodFrequency: null,
  cookingAtHome: null, whoCooks: null, smokingStatus: null, alcoholFrequency: null, exerciseFrequency: null, stressLevelLabel: null,
  primaryConditions: [], previousConditions: [], familyHistoryConditions: [], wellnessGoals: [], medicalNotes: null, pregnancyStatus: null,
  breastfeedingStatus: null, pcosStatus: null, thyroidStatus: null, diabetesStatus: null, hypertensionStatus: null,
  cholesterolStatus: null, heartConditionStatus: null, previousSurgeries: [], ...overrides
});

test('new users start onboarding', () => {
  assert.deepEqual(deriveOnboardingGate(null), { status: 'NOT_STARTED', resumeStep: 'basics' });
});

test('completed backend profile goes Home even when optional fields are missing', () => {
  assert.deepEqual(deriveOnboardingGate(profile({ dietType: null, preferredCuisines: [], sleepHours: null })), {
    status: 'COMPLETED', resumeStep: null
  });
});

test('incomplete backend profile resumes the first required step', () => {
  assert.deepEqual(deriveOnboardingGate(profile({ dateOfBirthISO: null })), { status: 'IN_PROGRESS', resumeStep: 'basics' });
  assert.deepEqual(deriveOnboardingGate(profile({ heightCm: null })), { status: 'IN_PROGRESS', resumeStep: 'assessment' });
  assert.deepEqual(deriveOnboardingGate(profile({ currentWeightKg: null })), { status: 'IN_PROGRESS', resumeStep: 'assessment' });
});

test('PSS, medication, and wearable state are not part of the onboarding gate', () => {
  assert.deepEqual(deriveOnboardingGate(profile()), { status: 'COMPLETED', resumeStep: null });
});
