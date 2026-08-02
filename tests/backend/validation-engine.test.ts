import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertHealthProfile } from '../../backend/src/modules/platform/platform.service.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { createReportRecord } from '../../backend/src/modules/reports/reports.store.js';
import { resolveVerifiedAccountIdentity } from '../../backend/src/modules/auth/auth.repository.js';
import { ClientOwnershipContext } from '../../backend/src/modules/platform/platform.types.js';

test.beforeEach(async () => {
  await resetBackendStateForTests();
});

const createOwner = async (label: string): Promise<ClientOwnershipContext> => {
  const { user, client } = await resolveVerifiedAccountIdentity({
    name: `${label} User`,
    email: `${label}@example.com`,
    mobileNumber: `+9198768${label.replace(/\D/g, '').padStart(5, '0').slice(-5)}`
  });
  return { accountId: user.id, clientId: client.id };
};

test('validation engine keeps incomplete profiles below AI readiness threshold', async () => {
  const owner = await createOwner('validation-incomplete-001');
  const bundle = await upsertHealthProfile(owner, {
    gender: 'Female',
    heightCm: 160,
  });
  assert.equal(bundle.nutrition.aiReady, false);
  assert.ok(bundle.nutrition.missingFields.length > 0);
  assert.equal(bundle.careCase.currentStage, 'health_profile_pending');
});

test('validation engine upgrades complete profiles with reports into consultant workflow', async () => {
  const owner = await createOwner('validation-ready-002');
  createReportRecord({
    userId: owner.accountId,
    fileName: 'ready.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
  });
  const bundle = await upsertHealthProfile(owner, {
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
