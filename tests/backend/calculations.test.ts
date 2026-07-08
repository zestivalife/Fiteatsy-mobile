import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAgeFromDob,
  calculateBmi,
  calculateNutritionProfileCompletion,
  calculateWaistToHeightRatio,
} from '../../backend/src/modules/platform/platform.calculations.js';
import type { HealthProfileRecord } from '../../backend/src/modules/platform/platform.types.js';

const baseProfile = (): HealthProfileRecord => ({
  id: 'hp_test',
  userId: 'user-test',
  dateOfBirthISO: '1990-06-15T00:00:00.000Z',
  calculatedAge: 34,
  gender: 'Female',
  heightCm: 165,
  currentWeightKg: 62,
  goalWeightKg: 58,
  waistCm: 76,
  hipCm: 96,
  neckCm: 32,
  bodyFatPct: 24,
  occupation: 'Designer',
  workingHoursLabel: '9-6',
  shiftType: 'day',
  activityLevel: 'moderate',
  workMode: 'hybrid',
  travelFrequency: 'low',
  dietType: 'vegetarian',
  regionalCuisine: 'North Indian',
  foodsLiked: ['dal'],
  foodsDisliked: ['soda'],
  foodAllergies: ['peanut'],
  foodIntolerances: ['lactose'],
  currentSupplements: ['omega-3'],
  currentMedicines: ['none'],
  wakeTime: '06:30',
  breakfastTime: '08:00',
  lunchTime: '13:00',
  dinnerTime: '20:00',
  sleepTime: '22:30',
  mealsPerDay: 3,
  waterIntakeLiters: 2.5,
  outsideFoodFrequency: 'weekly',
  cookingAtHome: 'yes',
  whoCooks: 'self',
  primaryConditions: ['Vitamin Deficiency'],
  wellnessGoals: ['Better Energy'],
  assignedConsultantId: null,
  assignedMentorId: null,
  createdAtISO: '2026-07-01T00:00:00.000Z',
  updatedAtISO: '2026-07-01T00:00:00.000Z',
  deletedAtISO: null,
  version: 1,
  status: 'active',
});

test('calculateAgeFromDob returns null for invalid or missing dates', () => {
  assert.equal(calculateAgeFromDob(null), null);
  assert.equal(calculateAgeFromDob('not-a-date'), null);
});

test('calculateBmi and waist-to-height ratio return rounded metrics', () => {
  assert.equal(calculateBmi(170, 68), 23.5);
  assert.equal(calculateWaistToHeightRatio(85, 170), 0.5);
});

test('nutrition profile completion computes readiness and AI gate', () => {
  const profile = baseProfile();
  const completion = calculateNutritionProfileCompletion(profile, 1);
  assert.equal(completion.aiReady, true);
  assert.ok(completion.completionPercent >= 90);
  assert.ok(completion.readinessScore >= 75);
  assert.equal(completion.missingFields.length, 0);
});

test('nutrition profile completion exposes missing fields for incomplete data', () => {
  const profile = baseProfile();
  profile.dateOfBirthISO = null;
  profile.calculatedAge = null;
  profile.heightCm = null;
  profile.currentWeightKg = null;
  profile.foodsLiked = [];
  profile.currentMedicines = [];
  const completion = calculateNutritionProfileCompletion(profile, 0);
  assert.equal(completion.aiReady, false);
  assert.ok(completion.readinessScore < 75);
  assert.ok(completion.missingFields.includes('Date of Birth'));
  assert.ok(completion.missingFields.includes('Current Weight'));
  assert.ok(completion.missingFields.includes('Blood Reports'));
});
