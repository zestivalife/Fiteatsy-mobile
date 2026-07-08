import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignConsultant,
  getHealthProfileBundle,
  requestMissingInformation,
  syncReportPipelineToPlatform,
  upsertHealthProfile,
} from '../../backend/src/modules/platform/platform.service.js';
import { createReportRecord } from '../../backend/src/modules/reports/reports.store.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';

test.beforeEach(() => {
  resetBackendStateForTests();
});

test('service layer upserts health profile and derives completion bundle', () => {
  const bundle = upsertHealthProfile('svc-user', {
    dateOfBirthISO: '1991-05-20T00:00:00.000Z',
    gender: 'Male',
    heightCm: 172,
    currentWeightKg: 78,
    foodsLiked: ['dal'],
    currentMedicines: ['none'],
    wakeTime: '06:00',
    breakfastTime: '08:00',
    lunchTime: '13:00',
    dinnerTime: '20:00',
    sleepTime: '22:30',
    mealsPerDay: 3,
    waterIntakeLiters: 2.5,
    outsideFoodFrequency: 'weekly',
    cookingAtHome: 'yes',
    whoCooks: 'self',
    dietType: 'veg',
    regionalCuisine: 'Indian',
    foodsDisliked: ['soda'],
    foodAllergies: ['none'],
    foodIntolerances: ['none'],
    currentSupplements: ['omega-3'],
    primaryConditions: ['Prediabetes'],
    wellnessGoals: ['Sugar Control'],
    occupation: 'Engineer',
    workingHoursLabel: '9-6',
    shiftType: 'day',
    activityLevel: 'moderate',
    workMode: 'hybrid',
    travelFrequency: 'low',
    goalWeightKg: 72,
    waistCm: 90,
    hipCm: 98,
    neckCm: 38,
    bodyFatPct: 26,
  });
  assert.equal(bundle.profile.calculatedAge !== null, true);
  assert.equal(bundle.careCase.currentStage, 'blood_report_pending');
  assert.ok(bundle.nutrition.completionPercent >= 90);
});

test('service layer creates missing information ticket and notification', () => {
  upsertHealthProfile('missing-user', {});
  const result = requestMissingInformation('missing-user', ['dateOfBirthISO', 'blood_reports'], 'consultant-1');
  assert.equal(result.requestedFields.length, 2);
  const bundle = getHealthProfileBundle('missing-user');
  assert.ok(bundle);
  assert.equal(bundle?.careCase.currentStage, 'health_profile_pending');
});

test('service layer syncs report pipeline milestones into care case timeline', () => {
  upsertHealthProfile('report-user', {
    dateOfBirthISO: '1990-01-01T00:00:00.000Z',
    gender: 'Female',
    heightCm: 160,
    currentWeightKg: 60,
  });
  createReportRecord({
    userId: 'report-user',
    fileName: 'baseline.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
  });
  const sync = syncReportPipelineToPlatform(
    'report-user',
    'rep_fake',
    'analysis_completed',
    'AI validation completed for baseline.pdf'
  );
  assert.ok(sync);
  const bundle = getHealthProfileBundle('report-user');
  assert.ok(bundle);
  assert.equal(bundle?.careCase.currentStage, 'ready_for_consultant');
  assert.ok((bundle?.reportCount ?? 0) > 0);
});

test('service layer assigns consultant to care case', () => {
  const bundle = upsertHealthProfile('assign-user', {});
  const updated = assignConsultant(bundle.careCase.id, 'consultant-42', 'mentor-11');
  assert.equal(updated?.assignedConsultantId, 'consultant-42');
  assert.equal(updated?.assignedMentorId, 'mentor-11');
});
