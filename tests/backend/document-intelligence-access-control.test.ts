import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdvancedAnalysisNotAllowedError,
  analyzeReportBuffer,
  analyzeReportBufferAdvanced,
  assertAdvancedAnalysisAllowed
} from '../../backend/src/modules/reports/reports.service.js';

test('standard image upload does not invoke OpenAI vision or advanced document intelligence', async () => {
  const analysis = await analyzeReportBuffer(Buffer.from('not-a-real-image'), 'image/jpeg');

  assert.equal(analysis.parameters.length, 0);
  assert.equal(analysis.extractionAttempts[0]?.strategy, 'standard_image_upload_no_ai');
  assert.equal(analysis.extractionAttempts[0]?.rescanRecommended, true);
  assert.match(analysis.extractionAttempts[0]?.notes.join(' ') ?? '', /avoids OpenAI Vision/i);
});

test('advanced document intelligence is blocked unless triggered by user re-analysis', async () => {
  assert.doesNotThrow(() => assertAdvancedAnalysisAllowed('USER_REANALYZE'));

  assert.throws(
    () => assertAdvancedAnalysisAllowed('BACKGROUND_SYNC'),
    (error) => error instanceof AdvancedAnalysisNotAllowedError && error.code === 'ADVANCED_ANALYSIS_NOT_ALLOWED'
  );

  await assert.rejects(
    () =>
      analyzeReportBufferAdvanced(Buffer.from('not-a-pdf'), 'application/pdf', {
        analysisTrigger: 'UPLOAD'
      }),
    (error) => error instanceof AdvancedAnalysisNotAllowedError && error.code === 'ADVANCED_ANALYSIS_NOT_ALLOWED'
  );
});
