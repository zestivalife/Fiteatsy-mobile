import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeReportBuffer } from '../../backend/src/modules/reports/reports.service.js';
import {
  sanitizeReportAnalysisForPublic,
  sanitizeReportErrorForPublic
} from '../../backend/src/modules/reports/report-response.js';
import { buildLabReportPdf } from '../helpers/reportFixtures.js';
import { reportExtractionEvaluationCases } from '../evaluation/report-extraction.dataset.js';

test('public report responses hide rejected biomarker values while preserving partial validation state', async () => {
  const evaluationCase = reportExtractionEvaluationCases.find((item) => item.id === 'unknown-decimal-shift-risk');
  assert.ok(evaluationCase, 'unknown decimal shift fixture must exist');

  const analysis = await analyzeReportBuffer(buildLabReportPdf(evaluationCase.lines), 'application/pdf');
  assert.equal(analysis.qualityGate.status, 'PARTIALLY_VALIDATED');
  assert.equal(analysis.qualityGate.canPublish, true);
  assert.equal(analysis.qualityGate.canScore, true);
  assert.ok(analysis.parameters.some((parameter) => parameter.canonicalName === 'HbA1c' && parameter.value === 77));
  assert.match(analysis.qualityGate.failedBiomarkers.join(' '), /77/);

  const publicAnalysis = sanitizeReportAnalysisForPublic(analysis);
  assert.equal(publicAnalysis.qualityGate.status, 'PARTIALLY_VALIDATED');
  assert.equal(publicAnalysis.qualityGate.canPublish, true);
  assert.equal(publicAnalysis.qualityGate.canScore, true);
  assert.equal(publicAnalysis.parameters.some((parameter) => parameter.canonicalName === 'HbA1c'), false);
  assert.ok(publicAnalysis.parameters.some((parameter) => parameter.canonicalName === 'Fasting Glucose'));
  assert.equal(publicAnalysis.qualityGate.evidenceTraceability.some((item) => item.biomarker_name === 'HbA1c'), false);
  assert.match(publicAnalysis.qualityGate.rejectedBiomarkers?.[0]?.reason ?? '', /needs review/i);
  assert.equal(JSON.stringify(publicAnalysis).includes('HbA1c value 77'), false);
});

test('public report responses keep needs-review biomarkers visible but hide invalid real-PDF fragments', async () => {
  const buffer = readFileSync(new URL('../../fixtures/real-reports/pdf_case_b.pdf', import.meta.url));
  const analysis = await analyzeReportBuffer(buffer, 'application/pdf');
  const publicAnalysis = sanitizeReportAnalysisForPublic(analysis);

  assert.equal(analysis.qualityGate.status, 'PARTIALLY_VALIDATED');
  assert.ok(publicAnalysis.parameters.some((parameter) => parameter.canonicalName === 'Fasting Glucose' && parameter.value === 88));
  assert.ok(publicAnalysis.parameters.some((parameter) => parameter.canonicalName === 'Vitamin D' && parameter.value === 29.2));
  assert.ok(publicAnalysis.parameters.some((parameter) => parameter.canonicalName === 'Vitamin B12' && parameter.value === 148));
  assert.ok(publicAnalysis.parameters.some((parameter) => parameter.canonicalName === 'Platelets'));
  assert.equal(publicAnalysis.parameters.some((parameter) => parameter.canonicalName === 'HbA1c'), false);
  assert.equal(publicAnalysis.parameters.some((parameter) => parameter.canonicalName === 'ALT'), false);
  assert.equal(publicAnalysis.qualityGate.evidenceTraceability.some((item) => item.validation_status === 'NEEDS_REVIEW'), true);
  assert.equal(JSON.stringify(publicAnalysis).includes('HbA1c value 1 c'), false);
  assert.equal(JSON.stringify(publicAnalysis).includes('ALT value 1 in'), false);
});

test('public report responses do not expose internal care-case transition diagnostics', () => {
  assert.equal(
    sanitizeReportErrorForPublic('Invalid care case transition from diet_published to blood_report_pending'),
    "We couldn't analyse this report. Please try again or choose another file."
  );
  assert.equal(sanitizeReportErrorForPublic('The uploaded document is unreadable.'), 'The uploaded document is unreadable.');
});
