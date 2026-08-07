import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExtractionGovernance,
  canonicalBiomarkerName,
  classifyDocument,
  CORE_BIOMARKERS
} from '../../backend/src/modules/reports/report-governance.js';
import { ParsedParameter } from '../../backend/src/modules/reports/reports.service.js';

const biomarkerFixtures: Record<string, { value: number; unit: string; referenceRange: string }> = {
  HbA1c: { value: 5.6, unit: '%', referenceRange: '4-5.6' },
  'Fasting Glucose': { value: 92, unit: 'mg/dL', referenceRange: '70-100' },
  Insulin: { value: 8, unit: 'µIU/mL', referenceRange: '2-25' },
  'HOMA-IR': { value: 1.8, unit: 'ratio', referenceRange: '0.5-2.9' },
  Triglycerides: { value: 120, unit: 'mg/dL', referenceRange: '40-150' },
  'HDL Cholesterol': { value: 52, unit: 'mg/dL', referenceRange: '40-80' },
  'LDL Cholesterol': { value: 98, unit: 'mg/dL', referenceRange: '0-130' },
  'Total Cholesterol': { value: 176, unit: 'mg/dL', referenceRange: '120-200' },
  Creatinine: { value: 0.9, unit: 'mg/dL', referenceRange: '0.6-1.3' },
  eGFR: { value: 98, unit: 'mL/min', referenceRange: '60-120' },
  Urea: { value: 28, unit: 'mg/dL', referenceRange: '15-40' },
  BUN: { value: 13, unit: 'mg/dL', referenceRange: '7-20' },
  'Uric Acid': { value: 4.8, unit: 'mg/dL', referenceRange: '2.4-6.0' },
  ALT: { value: 24, unit: 'U/L', referenceRange: '7-56' },
  AST: { value: 22, unit: 'U/L', referenceRange: '10-40' },
  GGT: { value: 18, unit: 'U/L', referenceRange: '9-48' },
  Bilirubin: { value: 0.7, unit: 'mg/dL', referenceRange: '0.1-1.2' },
  Albumin: { value: 4.4, unit: 'g/dL', referenceRange: '3.5-5.5' },
  'Non-HDL': { value: 124, unit: 'mg/dL', referenceRange: '0-160' },
  VLDL: { value: 24, unit: 'mg/dL', referenceRange: '5-40' },
  ApoB: { value: 82, unit: 'mg/dL', referenceRange: '50-110' },
  'Lipoprotein(a)': { value: 18, unit: 'mg/dL', referenceRange: '0-30' },
  'hs-CRP': { value: 1.2, unit: 'mg/L', referenceRange: '0-3' },
  'Vitamin B12': { value: 520, unit: 'pg/mL', referenceRange: '200-900' },
  'Vitamin D': { value: 38, unit: 'ng/mL', referenceRange: '30-100' },
  Ferritin: { value: 72, unit: 'ng/mL', referenceRange: '15-200' },
  Iron: { value: 86, unit: 'µg/dL', referenceRange: '50-170' },
  Hemoglobin: { value: 13.5, unit: 'g/dL', referenceRange: '12-16' },
  TSH: { value: 2.1, unit: 'mIU/L', referenceRange: '0.4-4.5' },
  'Free T4': { value: 1.2, unit: 'ng/dL', referenceRange: '0.8-1.8' },
  WBC: { value: 6.8, unit: '10^3/µL', referenceRange: '4-11' },
  Platelets: { value: 250, unit: '10^3/µL', referenceRange: '150-450' }
};

const parameter = (name: string, value?: number): ParsedParameter => {
  const canonicalName = canonicalBiomarkerName(name);
  const fixture = biomarkerFixtures[canonicalName] ?? { value: value ?? 10, unit: 'mg/dL', referenceRange: '1-100' };
  return {
    name,
    canonicalName,
    value: value ?? fixture.value,
    unit: fixture.unit,
    referenceRange: fixture.referenceRange,
    category: 'Metabolic',
    status: 'normal',
    pageNumber: 1,
    sectionName: 'Fixture',
    extractionMethod: 'test_fixture',
    extractionConfidence: 0.96
  };
};

test('report governance blocks scoring for incomplete extraction', () => {
  const parameters = [parameter('Glucose', 98)];
  const document = classifyDocument({
    text: 'Tiny Lab Glucose report',
    mimeType: 'application/pdf',
    parameterCount: parameters.length,
    labName: 'Tiny Lab'
  });
  const governance = buildExtractionGovernance('Tiny Lab Glucose report', parameters, document);

  assert.equal(governance.qualityGate.canScore, false);
  assert.equal(governance.qualityGate.canPublish, false);
  assert.equal(governance.qualityGate.status, 'INSUFFICIENT_DATA');
  assert.match(governance.qualityGate.reasons.join(' '), /minimum quality gate/);
});

test('report governance rejects clinically implausible extracted values', () => {
  const parameters = [
    parameter('HbA1c', 77),
    parameter('Glucose', 98),
    parameter('Total Cholesterol', 180),
    parameter('LDL', 120),
    parameter('HDL', 45),
    parameter('Triglycerides', 150),
    parameter('Creatinine', 0.9),
    parameter('Hemoglobin', 14),
    parameter('TSH', 2.4)
  ];
  parameters[0].unit = '%';
  parameters[0].referenceRange = '4-5.6';
  const document = classifyDocument({
    text: 'HealthLab Diagnostics HbA1c Glucose lipid kidney thyroid report',
    mimeType: 'application/pdf',
    parameterCount: parameters.length,
    labName: 'HealthLab Diagnostics'
  });
  const governance = buildExtractionGovernance('HealthLab Diagnostics HbA1c Glucose lipid kidney thyroid report', parameters, document);

  assert.equal(governance.qualityGate.canScore, false);
  assert.equal(governance.qualityGate.status, 'REVIEW_REQUIRED');
  assert.match(governance.qualityGate.failedBiomarkers.join(' '), /HbA1c value 77/);
});

test('report governance allows publishable multi-core clinical extraction', () => {
  const parameters = CORE_BIOMARKERS.map((name) => parameter(name));
  const document = classifyDocument({
    text: 'HealthLab Diagnostics blood serum lipid thyroid vitamin report',
    mimeType: 'application/pdf',
    parameterCount: parameters.length,
    labName: 'HealthLab Diagnostics'
  });
  const governance = buildExtractionGovernance('HealthLab Diagnostics blood serum lipid thyroid vitamin report', parameters, document);

  assert.equal(governance.qualityGate.canScore, true);
  assert.equal(governance.qualityGate.canPublish, true);
  assert.equal(governance.qualityGate.status, 'PUBLISHABLE');
  assert.equal(governance.qualityGate.coreBiomarkers, 22);
  assert.equal(governance.qualityGate.validatedCoreBiomarkers, 22);
  assert.equal(governance.qualityGate.tier1ExtractionConfidence, 0.96);
});

test('report governance does not block publish because secondary biomarkers need review', () => {
  const parameters = [
    ...CORE_BIOMARKERS.map((name) => parameter(name)),
    {
      ...parameter('Unknown Footer Parameter', 999999),
      unit: '',
      referenceRange: 'Not specified',
      extractionConfidence: 0.4
    }
  ];
  const document = classifyDocument({
    text: 'HealthLab Diagnostics full body laboratory table report',
    mimeType: 'application/pdf',
    parameterCount: parameters.length,
    labName: 'HealthLab Diagnostics'
  });
  const governance = buildExtractionGovernance('HealthLab Diagnostics full body laboratory table report', parameters, document);

  assert.equal(governance.qualityGate.canPublish, true);
  assert.equal(governance.qualityGate.status, 'PUBLISHABLE');
  assert.equal(governance.qualityGate.rejectedBiomarkers?.some((item) => item.tier === 3), true);
});

test('core biomarker dictionary normalizes common lab aliases', () => {
  assert.equal(canonicalBiomarkerName('Glycosylated Hemoglobin'), 'HbA1c');
  assert.equal(canonicalBiomarkerName('SGPT'), 'ALT');
  assert.equal(canonicalBiomarkerName('Cobalamin'), 'Vitamin B12');
  assert.equal(CORE_BIOMARKERS.length, 32);
});
