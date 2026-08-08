import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReportBuffer } from '../../backend/src/modules/reports/reports.service.js';
import { canonicalBiomarkerName } from '../../backend/src/modules/reports/report-governance.js';
import { buildLabReportPdf } from '../helpers/reportFixtures.js';
import { GroundTruthBiomarker, reportExtractionEvaluationCases } from './report-extraction.dataset.js';

const valueMatches = (actual: number, expected: number) => Math.abs(actual - expected) <= Math.max(0.01, Math.abs(expected) * 0.001);

const normalizeUnit = (unit: string) => unit.replace(/\s+/g, '').toLowerCase();

const evaluateGroundTruth = (
  extracted: Awaited<ReturnType<typeof analyzeReportBuffer>>['parameters'],
  groundTruth: GroundTruthBiomarker[]
) => {
  const extractedByName = new Map(extracted.map((item) => [canonicalBiomarkerName(item.name), item]));
  const missing: GroundTruthBiomarker[] = [];
  const mismatched: Array<{ expected: GroundTruthBiomarker; actual: (typeof extracted)[number] }> = [];

  for (const expected of groundTruth) {
    const actual = extractedByName.get(canonicalBiomarkerName(expected.name));
    if (!actual) {
      missing.push(expected);
      continue;
    }
    if (
      !valueMatches(actual.value, expected.value) ||
      normalizeUnit(actual.unit) !== normalizeUnit(expected.unit) ||
      actual.referenceRange !== expected.referenceRange
    ) {
      mismatched.push({ expected, actual });
    }
  }

  const falsePositiveCount = extracted.filter(
    (item) => !groundTruth.some((expected) => canonicalBiomarkerName(expected.name) === canonicalBiomarkerName(item.name))
  ).length;

  return {
    matched: groundTruth.length - missing.length - mismatched.length,
    missing,
    mismatched,
    falsePositiveCount
  };
};

test('medical report extraction evaluation harness measures labelled report accuracy and safety decisions', async () => {
  const results = [];

  for (const evaluationCase of reportExtractionEvaluationCases) {
    const analysis = await analyzeReportBuffer(buildLabReportPdf(evaluationCase.lines), 'application/pdf');
    const metrics = evaluateGroundTruth(analysis.parameters, evaluationCase.groundTruth);
    results.push({
      id: evaluationCase.id,
      lab: evaluationCase.lab,
      expected: evaluationCase.expectedDecision,
      actual: analysis.qualityGate.canPublish ? 'PUBLISHED' : analysis.qualityGate.status,
      metrics
    });

    assert.equal(
      analysis.qualityGate.canPublish ? 'PUBLISHED' : analysis.qualityGate.status,
      evaluationCase.expectedDecision,
      `${evaluationCase.id} final decision`
    );
    assert.equal(metrics.missing.length, 0, `${evaluationCase.id} missing biomarkers`);
    assert.equal(metrics.mismatched.length, 0, `${evaluationCase.id} mismatched biomarkers`);
  }

  const totalExpected = results.reduce(
    (sum, result) => sum + result.metrics.matched + result.metrics.missing.length + result.metrics.mismatched.length,
    0
  );
  const totalMatched = results.reduce((sum, result) => sum + result.metrics.matched, 0);
  const falsePositives = results.reduce((sum, result) => sum + result.metrics.falsePositiveCount, 0);
  const reviewRequired = results.filter((result) => result.actual !== 'PUBLISHED').length;

  assert.equal(totalMatched / totalExpected, 1, 'labelled biomarker accuracy');
  assert.equal(falsePositives, 0, 'false positives against labelled core biomarkers');
  assert.equal(reviewRequired, 1, 'review-required safety gate count');
});
