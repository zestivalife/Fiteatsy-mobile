import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMARKER_CLINICAL_CALCULATION_VERSION,
  compareBiomarkerObservations,
  deriveBiomarkerClinicalStatus
} from '../../backend/src/modules/biomarkers/biomarker-clinical-semantics.js';
import type { ConsultantBiomarkerSummary } from '../../backend/src/modules/consultants/consultants.repository.js';
import { buildNutritionIntelligence } from '../../backend/src/modules/nutrition/nutrition.service.js';

const marker = (overrides: Partial<ConsultantBiomarkerSummary> & Pick<ConsultantBiomarkerSummary, 'biomarkerId' | 'name' | 'value' | 'unit' | 'referenceRange'>): ConsultantBiomarkerSummary => {
  const clinicalStatus = deriveBiomarkerClinicalStatus({
    value: overrides.value,
    unit: overrides.unit,
    referenceRange: overrides.referenceRange,
    validationStatus: overrides.validationStatus ?? 'VALIDATED'
  });
  return {
    biomarkerId: overrides.biomarkerId,
    name: overrides.name,
    canonicalMarkerName: overrides.canonicalMarkerName ?? overrides.name,
    rawMarkerName: overrides.rawMarkerName ?? overrides.name,
    sourceReportId: overrides.sourceReportId ?? 'report-current',
    value: overrides.value,
    unit: overrides.unit,
    validationStatus: overrides.validationStatus ?? 'VALIDATED',
    clinicalStatus,
    referenceRange: overrides.referenceRange,
    confidence: overrides.confidence ?? 0.99,
    testDate: overrides.testDate ?? '2026-08-28',
    comparisonStatus: overrides.comparisonStatus ?? 'UNKNOWN',
    previousValue: overrides.previousValue ?? null,
    previousUnit: overrides.previousUnit ?? null,
    previousReferenceRange: overrides.previousReferenceRange ?? null,
    previousClinicalStatus: overrides.previousClinicalStatus ?? null,
    previousSourceReportId: overrides.previousSourceReportId ?? null,
    previousTestDate: overrides.previousTestDate ?? null
  };
};

const intelligence = (biomarkers: ConsultantBiomarkerSummary[]) => buildNutritionIntelligence({
  goal: 'Better Energy',
  age: 34,
  gender: 'Female',
  weightKg: 64,
  bmi: 22,
  dietPreference: 'Mixed',
  activityLevel: 'moderate',
  sleepQuality: 'good',
  waterIntakeLiters: 2.5,
  hydrationTargetLiters: 2.5,
  proteinTargetGrams: 100,
  carbohydrateTargetGrams: 210,
  fatTargetGrams: 60,
  caloriesTarget: 1800,
  conditions: [],
  biomarkers,
  reportsCount: 1,
  lifestyleSummary: 'Synthetic QA profile',
  wearableConnected: false,
  wellnessScores: {
    overall: null,
    activity: null,
    sleep: null,
    recovery: null,
    nourishment: null,
    bodySupport: null
  },
  stressAssessment: null
});

test('clinical status is deterministic and validation/reference aware', () => {
  assert.equal(deriveBiomarkerClinicalStatus({ value: 180, unit: 'pg/mL', referenceRange: '200-900', validationStatus: 'validated' }), 'LOW');
  assert.equal(deriveBiomarkerClinicalStatus({ value: 310, unit: 'pg/mL', referenceRange: '200-900', validationStatus: 'validated' }), 'NORMAL');
  assert.equal(deriveBiomarkerClinicalStatus({ value: 910, unit: 'pg/mL', referenceRange: '200-900', validationStatus: 'validated' }), 'HIGH');
  assert.equal(deriveBiomarkerClinicalStatus({ value: 5.6, unit: '%', referenceRange: '<5.7', validationStatus: 'validated' }), 'NORMAL');
  assert.equal(deriveBiomarkerClinicalStatus({ value: 5.7, unit: '%', referenceRange: '<5.7', validationStatus: 'validated' }), 'HIGH');
  assert.equal(deriveBiomarkerClinicalStatus({ value: 310, unit: 'pg/mL', referenceRange: null, validationStatus: 'validated' }), 'UNKNOWN');
  assert.equal(deriveBiomarkerClinicalStatus({ value: 310, unit: 'pg/mL', referenceRange: '200-900', validationStatus: 'pending' }), 'UNKNOWN');
});

test('comparison semantics are range aware and reused independently of validation status', () => {
  assert.equal(compareBiomarkerObservations(
    { value: 310, unit: 'pg/mL', referenceRange: '200-900', clinicalStatus: 'NORMAL' },
    { value: 180, unit: 'pg/mL', referenceRange: '200-900', clinicalStatus: 'LOW' }
  ), 'IMPROVED');
  assert.equal(compareBiomarkerObservations(
    { value: 142, unit: 'mg/dL', referenceRange: '<130', clinicalStatus: 'HIGH' },
    { value: 128, unit: 'mg/dL', referenceRange: '<130', clinicalStatus: 'NORMAL' }
  ), 'NEEDS_ATTENTION');
  assert.equal(compareBiomarkerObservations(
    { value: 5.4, unit: '%', referenceRange: '<5.7', clinicalStatus: 'NORMAL' },
    { value: 5.6, unit: '%', referenceRange: '<5.7', clinicalStatus: 'NORMAL' }
  ), 'STABLE');
  assert.equal(compareBiomarkerObservations(
    { value: 310, unit: 'pmol/L', referenceRange: '200-900', clinicalStatus: 'NORMAL' },
    { value: 180, unit: 'pg/mL', referenceRange: '200-900', clinicalStatus: 'LOW' }
  ), 'INCOMPARABLE');
});

test('all-normal markers do not create false nutrition risk, abnormality, or biomarker guidance', () => {
  const normalMarkers = [
    marker({ biomarkerId: 'b12', name: 'Vitamin B12', value: 310, unit: 'pg/mL', referenceRange: '200-900' }),
    marker({ biomarkerId: 'vitamin-d', name: 'Vitamin D', value: 42, unit: 'ng/mL', referenceRange: '30-100' }),
    marker({ biomarkerId: 'hba1c', name: 'HbA1c', value: 5.4, unit: '%', referenceRange: '<5.7' }),
    marker({ biomarkerId: 'ldl', name: 'LDL Cholesterol', value: 110, unit: 'mg/dL', referenceRange: '<130' }),
    marker({ biomarkerId: 'haemoglobin', name: 'Haemoglobin', value: 14, unit: 'g/dL', referenceRange: '13.5-17.5' }),
    marker({ biomarkerId: 'creatinine', name: 'Creatinine', value: 0.9, unit: 'mg/dL', referenceRange: '0.7-1.3' })
  ];
  const result = intelligence(normalMarkers);

  assert.equal(result.riskLevel, 'low');
  assert.deepEqual(result.abnormalities, []);
  assert.deepEqual(result.deficiencies, []);
  assert.equal(result.observations.some((item) => item.sources.some((source) => source.startsWith('biomarkers.'))), false);
  assert.equal(result.recommendations.some((item) => item.sources.some((source) => source.startsWith('biomarkers.'))), false);
  assert.equal(result.biomarkerClinicalCalculationVersion, BIOMARKER_CLINICAL_CALCULATION_VERSION);
});

test('all-unknown markers stay Consultant-visible but produce no abnormal diet effect', () => {
  const result = intelligence([
    marker({ biomarkerId: 'b12', name: 'Vitamin B12', value: 310, unit: 'pg/mL', referenceRange: null }),
    marker({ biomarkerId: 'vitamin-d', name: 'Vitamin D', value: 42, unit: 'ng/mL', referenceRange: null }),
    marker({ biomarkerId: 'hba1c', name: 'HbA1c', value: 5.4, unit: '%', referenceRange: null }),
    marker({ biomarkerId: 'ldl', name: 'LDL Cholesterol', value: 110, unit: 'mg/dL', referenceRange: null }),
    marker({ biomarkerId: 'haemoglobin', name: 'Haemoglobin', value: 14, unit: 'g/dL', referenceRange: null }),
    marker({ biomarkerId: 'creatinine', name: 'Creatinine', value: 0.9, unit: 'mg/dL', referenceRange: null })
  ]);

  assert.equal(result.biomarkerSnapshot.length, 6);
  assert.equal(result.biomarkerSnapshot.every((item) => item.clinicalStatus === 'UNKNOWN'), true);
  assert.deepEqual(result.abnormalities, []);
  assert.deepEqual(result.deficiencies, []);
  assert.equal(result.observations.some((item) => item.sources.some((source) => source.startsWith('biomarkers.'))), false);
  assert.equal(result.recommendations.some((item) => item.sources.some((source) => source.startsWith('biomarkers.'))), false);
});

test('mixed and unknown markers affect only governed intelligence with traceable provenance', () => {
  const mixed = intelligence([
    marker({ biomarkerId: 'b12', name: 'Vitamin B12', rawMarkerName: 'B12', sourceReportId: 'report-a', value: 180, unit: 'pg/mL', referenceRange: '200-900' }),
    marker({ biomarkerId: 'hba1c', name: 'HbA1c', sourceReportId: 'report-a', value: 6.2, unit: '%', referenceRange: '<5.7' }),
    marker({ biomarkerId: 'haemoglobin', name: 'Haemoglobin', sourceReportId: 'report-b', value: 12.8, unit: 'g/dL', referenceRange: '13.5-17.5' }),
    marker({ biomarkerId: 'unknown', name: 'Unmapped Marker', sourceReportId: 'report-b', value: 9, unit: 'U/L', referenceRange: null })
  ]);

  assert.equal(mixed.riskLevel, 'low');
  assert.equal(mixed.abnormalities.length, 3);
  assert.equal(mixed.abnormalities.some((item) => item.includes('Unmapped Marker')), false);
  assert.equal(mixed.biomarkerSnapshot.find((item) => item.biomarkerId === 'unknown')?.clinicalStatus, 'UNKNOWN');
  assert.ok(mixed.recommendations.some((item) => item.sources.includes('biomarkers.b12.report.report-a')));
  assert.ok(mixed.consultantActions.some((item) => item.includes('Haemoglobin') && item.includes('report-b')));
  assert.equal(mixed.recommendations.some((item) => /prescribe a supplement dose|change medication|diagnosis:/i.test(item.detail)), false);
});

test('Plan A and Plan B preserve calories/macros while biomarkers change only governed guidance', () => {
  const planA = intelligence([]);
  const planB = intelligence([
    marker({ biomarkerId: 'b12', name: 'Vitamin B12', sourceReportId: 'report-a', value: 180, unit: 'pg/mL', referenceRange: '200-900' })
  ]);

  assert.deepEqual(planB.generationInputs, planA.generationInputs);
  assert.deepEqual(planB.mealTargets, planA.mealTargets);
  assert.equal(planA.recommendations.some((item) => item.sources.some((source) => source.startsWith('biomarkers.'))), false);
  assert.equal(planB.recommendations.some((item) => item.sources.includes('biomarkers.b12.report.report-a')), true);

  const planAAgain = intelligence([
    marker({ biomarkerId: 'b12', name: 'Vitamin B12', sourceReportId: 'report-b', value: 310, unit: 'pg/mL', referenceRange: '200-900' })
  ]);
  assert.equal(planAAgain.recommendations.some((item) => item.sources.some((source) => source.startsWith('biomarkers.b12.'))), false);
  assert.deepEqual(planAAgain.generationInputs, planA.generationInputs);
  assert.deepEqual(planAAgain.mealTargets, planA.mealTargets);
});

test('high LDL and abnormal creatinine remain review-only and never create food restrictions', () => {
  const baseline = intelligence([]);
  const result = intelligence([
    marker({ biomarkerId: 'ldl', name: 'LDL Cholesterol', sourceReportId: 'report-lipid', value: 142, unit: 'mg/dL', referenceRange: '<130' }),
    marker({ biomarkerId: 'creatinine', name: 'Creatinine', sourceReportId: 'report-renal', value: 1.6, unit: 'mg/dL', referenceRange: '0.7-1.3' })
  ]);

  assert.deepEqual(result.generationInputs, baseline.generationInputs);
  assert.deepEqual(result.mealTargets, baseline.mealTargets);
  assert.equal(result.recommendations.some((item) => item.sources.some((source) => /ldl|creatinine/i.test(source))), false);
  assert.ok(result.consultantActions.some((item) => item.includes('LDL Cholesterol') && item.includes('report-lipid')));
  assert.ok(result.consultantActions.some((item) => item.includes('Creatinine') && item.includes('no automated renal or hepatic food restriction')));
});
