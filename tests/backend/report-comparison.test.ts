import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportComparison, sortAnalysableReports } from '../../backend/src/modules/reports/report-comparison.js';
import type { ReportAnalysisResult } from '../../backend/src/modules/reports/reports.service.js';
import type { ReportRecord } from '../../backend/src/modules/reports/reports.store.js';

const analysis = (parameters: ReportAnalysisResult['parameters'], reportDate: string): ReportAnalysisResult => ({
  reportDate,
  labName: 'QA Lab',
  parameters,
  score: 80,
  categoryScores: { Blood: 80, Metabolic: 80, Organs: 80, Thyroid: 80, Vitamins: 80 },
  summary: 'Synthetic QA report.',
  actionPlan: [],
  document: { documentType: 'lab_report', supported: true, labName: 'QA Lab', pageCount: 1, imageQuality: 'good', confidence: 1 },
  extractionAttempts: [],
  qualityGate: {
    status: 'PUBLISHABLE', canScore: true, canPublish: true, confidence: 1, extractionConfidence: 1,
    validationConfidence: 1, biomarkerCompleteness: 1, expectedBiomarkers: { min: 1, max: 20, basis: 'test' },
    detectedBiomarkers: parameters.length, validatedBiomarkers: parameters.length, coreBiomarkers: parameters.length,
    failedBiomarkers: [], missingCriticalBiomarkers: [], conflicts: [], evidenceTraceability: [],
    freshness: { label: reportDate, confidence: 1 }, reasons: []
  },
  healthAssessment: { markerLabel: 'Synthetic', confidenceLabel: 'High', healthAreas: [] }
});

const parameter = (name: string, value: number, status: 'normal' | 'low' | 'high', unit = 'mg/dL', referenceRange = '10-20') => ({
  name, canonicalName: name, canonicalBiomarkerId: name.toLowerCase(), value, unit, referenceRange, status,
  category: 'Metabolic' as const
});

const report = (id: string, reportDate: string, parameters: ReportAnalysisResult['parameters'], status: ReportRecord['status'] = 'PUBLISHED'): ReportRecord => ({
  id, userId: 'account-a', clientId: 'client-a', reportType: 'lab_report', storageObjectRef: `test://${id}`,
  fileName: `${id}.pdf`, mimeType: 'application/pdf', fileSize: 10, status,
  createdAtISO: `${reportDate}T10:00:00.000Z`, updatedAtISO: `${reportDate}T10:00:00.000Z`, reportDate,
  labName: 'QA Lab', analysis: analysis(parameters, reportDate), analysisAttempts: [], analysisVersion: 1, feedback: []
});

test('canonical comparison classifies range movement without naïve numeric direction', () => {
  const previous = report('previous', '2026-06-02', [
    parameter('Vitamin B12', 8, 'low'),
    parameter('LDL', 15, 'normal'),
    parameter('HbA1c', 14, 'normal'),
    parameter('Ferritin', 25, 'high')
  ]);
  const latest = report('latest', '2026-08-27', [
    parameter('Vitamin B12', 12, 'normal'),
    parameter('LDL', 24, 'high'),
    parameter('HbA1c', 13, 'normal'),
    parameter('Ferritin', 23, 'high')
  ]);

  const projection = buildReportComparison(latest, previous);
  assert.equal(projection.summary.improvedCount, 2);
  assert.equal(projection.summary.needsAttentionCount, 1);
  assert.equal(projection.summary.stableCount, 1);
  assert.equal(projection.summary.comparableCount, 4);
  assert.equal(projection.improved.some((item) => item.displayName === 'Vitamin B12'), true);
  assert.equal(projection.needsAttention[0].displayName, 'LDL');
});

test('persisted B12 aliases resolve symmetrically through the canonical biomarker authority', () => {
  const variants = ['B12', 'b12', ' Vitamin B12 ', 'vitamin b12', 'Vitamin-B12'];
  for (const previousName of variants) {
    const previous = report('previous', '2026-06-02', [parameter(previousName, 180, 'low', 'pg/mL', '200-900')]);
    const latest = report('latest', '2026-08-27', [parameter('Vitamin B12', 310, 'normal', 'pg/mL', '200-900')]);
    const projection = buildReportComparison(latest, previous);

    assert.equal(projection.summary.improvedCount, 1, previousName);
    assert.equal(projection.summary.incomparableCount, 0, previousName);
    assert.equal(projection.improved[0]?.biomarkerId, 'vitamin b12', previousName);
  }

  const previous = report('previous', '2026-06-02', [parameter('Vitamin B12', 310, 'normal', 'pg/mL', '200-900')]);
  const latest = report('latest', '2026-08-27', [parameter('B12', 180, 'low', 'pg/mL', '200-900')]);
  const reverse = buildReportComparison(latest, previous);
  assert.equal(reverse.summary.needsAttentionCount, 1);
  assert.equal(reverse.summary.incomparableCount, 0);
});

test('B12 alias matching preserves unit safety, missing-marker safety, and same-name controls', () => {
  for (const name of ['B12', 'Vitamin B12']) {
    const previous = report('previous', '2026-06-02', [parameter(name, 180, 'low', 'pg/mL', '200-900')]);
    const latest = report('latest', '2026-08-27', [parameter(name, 310, 'normal', 'pg/mL', '200-900')]);
    const projection = buildReportComparison(latest, previous);
    assert.equal(projection.summary.improvedCount, 1, name);
  }

  const incompatible = buildReportComparison(
    report('latest', '2026-08-27', [parameter('Vitamin B12', 310, 'normal', 'pmol/L', '200-900')]),
    report('previous', '2026-06-02', [parameter('B12', 180, 'low', 'pg/mL', '200-900')])
  );
  assert.equal(incompatible.summary.comparableCount, 0);
  assert.equal(incompatible.summary.incomparableCount, 1);

  const missing = buildReportComparison(
    report('latest', '2026-08-27', [parameter('Ferritin', 30, 'normal', 'ng/mL', '20-300')]),
    report('previous', '2026-06-02', [parameter('B12', 180, 'low', 'pg/mL', '200-900')])
  );
  assert.equal(missing.summary.comparableCount, 0);
  assert.equal(missing.summary.incomparableCount, 2);
});

test('duplicate aliases in one report collapse to one canonical comparison identity', () => {
  const previous = report('previous', '2026-06-02', [
    parameter('B12', 180, 'low', 'pg/mL', '200-900'),
    parameter('Vitamin B12', 180, 'low', 'pg/mL', '200-900')
  ]);
  const latest = report('latest', '2026-08-27', [parameter('Vitamin B12', 310, 'normal', 'pg/mL', '200-900')]);
  const projection = buildReportComparison(latest, previous);

  assert.equal(projection.summary.comparableCount, 1);
  assert.equal(projection.summary.improvedCount, 1);
  assert.equal(projection.summary.incomparableCount, 0);
});

test('missing markers and incompatible units remain incomparable and out of positive/attention counts', () => {
  const previous = report('previous', '2026-06-02', [parameter('Vitamin B12', 8, 'low', 'pg/mL')]);
  const latest = report('latest', '2026-08-27', [
    parameter('Vitamin B12', 12, 'normal', 'pmol/L'),
    parameter('LDL', 24, 'high')
  ]);
  const projection = buildReportComparison(latest, previous);
  assert.equal(projection.summary.comparableCount, 0);
  assert.equal(projection.summary.incomparableCount, 2);
  assert.equal(projection.improved.length, 0);
  assert.equal(projection.needsAttention.length, 0);
});

test('latest pair selection uses report date and ignores failed or processing reports', () => {
  const reports = [
    report('failed', '2026-08-29', [parameter('A', 12, 'normal')], 'FAILED'),
    report('latest', '2026-08-27', [parameter('A', 12, 'normal')]),
    report('processing', '2026-08-28', [parameter('A', 12, 'normal')], 'PROCESSING'),
    report('previous', '2026-06-02', [parameter('A', 11, 'normal')])
  ];
  assert.deepEqual(sortAnalysableReports(reports).map((item) => item.id), ['latest', 'previous']);
});

test('comparison rejects cross-client and same-report pairs', () => {
  const previous = report('previous', '2026-06-02', [parameter('A', 11, 'normal')]);
  const latest = report('latest', '2026-08-27', [parameter('A', 12, 'normal')]);
  assert.throws(() => buildReportComparison(latest, latest), /SAME_REPORT/);
  assert.throws(() => buildReportComparison({ ...latest, clientId: 'client-b' }, previous), /OWNER_MISMATCH/);
});
