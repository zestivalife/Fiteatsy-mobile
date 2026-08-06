import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExtractionGovernance,
  canonicalBiomarkerName,
  classifyDocument,
  CORE_BIOMARKERS
} from '../../backend/src/modules/reports/report-governance.js';
import { ParsedParameter } from '../../backend/src/modules/reports/reports.service.js';

const parameter = (name: string, value = 10): ParsedParameter => ({
  name,
  canonicalName: canonicalBiomarkerName(name),
  value,
  unit: 'mg/dL',
  referenceRange: '1-100',
  category: 'Metabolic',
  status: 'normal',
  pageNumber: 1,
  sectionName: 'Fixture',
  extractionConfidence: 0.94
});

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
  assert.equal(governance.qualityGate.status, 'REVIEW_REQUIRED');
  assert.match(governance.qualityGate.reasons.join(' '), /minimum quality gate/);
});

test('report governance allows publishable multi-core clinical extraction', () => {
  const parameters = [
    'HbA1c',
    'Glucose',
    'Total Cholesterol',
    'LDL',
    'HDL',
    'Triglycerides',
    'Creatinine',
    'Urea',
    'Uric Acid',
    'ALT',
    'AST',
    'Vitamin B12',
    'Vitamin D',
    'Hemoglobin',
    'TSH',
    'Platelets'
  ].map((name, index) => parameter(name, 10 + index));
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
  assert.equal(governance.qualityGate.coreBiomarkers >= 10, true);
});

test('core biomarker dictionary normalizes common lab aliases', () => {
  assert.equal(canonicalBiomarkerName('Glycosylated Hemoglobin'), 'HbA1c');
  assert.equal(canonicalBiomarkerName('SGPT'), 'ALT');
  assert.equal(canonicalBiomarkerName('Cobalamin'), 'Vitamin B12');
  assert.equal(CORE_BIOMARKERS.length, 32);
});
