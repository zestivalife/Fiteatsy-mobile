import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHealthMetrics, HEALTH_CALCULATION_FORMULA_VERSION } from '../../backend/src/modules/health/health-calculations.service.js';

test('calculates deterministic available health metrics from complete body inputs', () => {
  const calculatedAt = '2026-08-11T00:00:00.000Z';
  const metrics = calculateHealthMetrics(
    {
      age: 35,
      gender: 'Female',
      heightCm: 162,
      weightKg: 68,
      waistCm: 82,
      hipCm: 98,
      neckCm: 33,
      activityLevel: 'Moderate',
      oneRepMaxInput: {
        weightKg: 50,
        reps: 8
      }
    },
    calculatedAt
  );

  assert.equal(metrics.bmi.status, 'AVAILABLE');
  assert.equal(metrics.bmi.value, 25.9);
  assert.equal(metrics.bmi.category, 'Overweight');
  assert.equal(metrics.bmi.formulaVersion, HEALTH_CALCULATION_FORMULA_VERSION);
  assert.equal(metrics.bmi.calculatedAt, calculatedAt);

  assert.equal(metrics.bmr.status, 'AVAILABLE');
  assert.equal(metrics.bmr.value, 1357);

  assert.equal(metrics.tdee.status, 'AVAILABLE');
  assert.equal(metrics.tdee.value, 2103);
  assert.equal(metrics.tdee.values?.activityMultiplier, 1.55);

  assert.equal(metrics.targetHeartRate.status, 'AVAILABLE');
  assert.deepEqual(metrics.targetHeartRate.values, {
    maxHeartRate: 185,
    minTarget: 93,
    maxTarget: 157
  });

  assert.equal(metrics.bodyFat.status, 'AVAILABLE');
  assert.equal(metrics.bodyFat.unit, '%');

  assert.equal(metrics.oneRepMax.status, 'AVAILABLE');
  assert.equal(metrics.oneRepMax.value, 63.3);
});

test('returns NOT_AVAILABLE instead of fallback values when inputs are missing', () => {
  const metrics = calculateHealthMetrics({
    age: null,
    gender: null,
    heightCm: null,
    weightKg: null,
    waistCm: null,
    hipCm: null,
    neckCm: null,
    activityLevel: null
  });

  assert.equal(metrics.bmi.status, 'NOT_AVAILABLE');
  assert.equal(metrics.bmi.value, null);
  assert.equal(metrics.bmr.status, 'NOT_AVAILABLE');
  assert.equal(metrics.tdee.status, 'NOT_AVAILABLE');
  assert.equal(metrics.targetHeartRate.status, 'NOT_AVAILABLE');
  assert.equal(metrics.bodyFat.status, 'NOT_AVAILABLE');
  assert.equal(metrics.oneRepMax.status, 'NOT_AVAILABLE');
});

test('normalizes common onboarding activity labels without duplicating route logic', () => {
  const baseInput = {
    age: 40,
    gender: 'Male',
    heightCm: 175,
    weightKg: 82,
    waistCm: null,
    hipCm: null,
    neckCm: null,
    oneRepMaxInput: undefined
  };

  assert.equal(calculateHealthMetrics({ ...baseInput, activityLevel: 'Sedentary' }).tdee.value, 2063);
  assert.equal(calculateHealthMetrics({ ...baseInput, activityLevel: 'Light' }).tdee.value, 2364);
  assert.equal(calculateHealthMetrics({ ...baseInput, activityLevel: 'Moderate' }).tdee.value, 2664);
  assert.equal(calculateHealthMetrics({ ...baseInput, activityLevel: 'Very Active' }).tdee.value, 2965);
});
