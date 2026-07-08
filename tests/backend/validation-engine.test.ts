import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertHealthProfile } from '../../backend/src/modules/platform/platform.service.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { createReportRecord } from '../../backend/src/modules/reports/reports.store.js';

test.beforeEach(() => {
  resetBackendStateForTests();
});

test('validation engine keeps incomplete profiles below AI readiness threshold', () => {
  const bundle = upsertHealthProfile('validation-incomplete', {
    gender: 'Female',
    heightCm: 160,
  });
  assert.equal(bundle.nutrition.aiReady, false);
  assert.ok(bundle.nutrition.missingFields.length > 0);
  assert.equal(bundle.careCase.currentStage, 'health_profile_pending');
});

test('validation engine upgrades complete profiles with reports into consultant workflow', () => {
  createReportRecord({
    userId: 'validation-ready',
    fileName: 'ready.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
  });
  const bundle = upsertHealthProfile('validation-ready', {
    dateOfBirthISO: '1988-04-19T00:00:00.000Z',
    gender: 'Male',
    heightCm: 174,
    currentWeightKg: 75,
    goalWeightKg: 70,
    waistCm: 86,
    hipCm: 94,
    neckCm: 37,
    bodyFatPct: 22,
    occupation: 'Manager',
    workingHoursLabel: '9-6',
    shiftType: 'day',
    activityLevel: 'moderate',
    workMode: 'office',
    travelFrequency: 'low',
    dietType: 'mixed',
    regionalCuisine: 'Indian',
    foodsLiked: ['idli'],
    foodsDisliked: ['cola'],
    foodAllergies: ['none'],
    foodIntolerances: ['none'],
    currentSupplements: ['vitamin D'],
    currentMedicines: ['metformin'],
    wakeTime: '06:30',
    breakfastTime: '08:00',
    lunchTime: '13:00',
    dinnerTime: '20:30',
    sleepTime: '22:45',
    mealsPerDay: 3,
    waterIntakeLiters: 2.8,
    outsideFoodFrequency: 'weekly',
    cookingAtHome: 'yes',
    whoCooks: 'family',
    primaryConditions: ['Prediabetes'],
    wellnessGoals: ['Sugar Control'],
  });
  assert.equal(bundle.nutrition.aiReady, true);
  assert.equal(bundle.careCase.currentStage, 'consultant_review');
});
