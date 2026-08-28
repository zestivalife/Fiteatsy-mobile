import fs from 'node:fs';
import path from 'node:path';

jest.mock('../src/services/apiClient', () => ({
  apiBaseUrl: 'http://localhost:4000',
  buildAuthorizationHeaders: () => ({ Authorization: 'Bearer test' })
}));

import { statusToReportPresentation } from '../src/services/reportUploadService';

const screenSource = fs.readFileSync(
  path.join(process.cwd(), 'src/screens/home/ReportsScreen.tsx'),
  'utf8'
);

describe('Reports V2 interaction recovery contract', () => {
  it('keeps upload and processing surfaces on the canonical dark presentation', () => {
    expect(screenSource).toContain('backgroundColor: colors.cardRaised');
    expect(screenSource).toContain('backgroundColor: colors.bgPrimary');
    expect(screenSource).not.toContain("backgroundColor: '#FFFFFF',\n    borderTopLeftRadius");
  });

  it('supports a repeatable upload-sheet lifecycle and real disabled state', () => {
    expect(screenSource).toContain('const openUploadSheet = () =>');
    expect(screenSource).toContain('const closeUploadSheet = () =>');
    expect(screenSource).toContain('disabled={!selectedUpload || uploadBusy || analysisLaunching}');
    expect(screenSource).toContain('setProcessingIntent(null);');
  });

  it('reconciles a non-terminal backend job after navigation or restart', () => {
    expect(screenSource).toContain("setProcessingIntent('resume')");
    expect(screenSource).toContain('waitForReportAnalysis({');
    expect(screenSource).toContain('processingStatus ? <Text style={styles.processingStatusText}>Status: {processingStatus}</Text> : null');
    expect(screenSource).not.toContain('failSafeTimeout');
    expect(screenSource).not.toContain('Analysis is taking too long');
    expect(screenSource).toContain("pollError.message !== 'REQUEST_TIMEOUT'");
  });

  it.each([
    ['UPLOADED', 'uploaded', 'Report uploaded'],
    ['PROCESSING', 'processing', 'Analysing your report'],
    ['DOCUMENT_ANALYSIS_COMPLETED', 'processing', 'Reading complete'],
    ['EXTRACTION_COMPLETED', 'extraction', 'Health markers extracted'],
    ['VALIDATION_PENDING', 'validation', 'Validating results'],
    ['VALIDATION_COMPLETED', 'validation', 'Results validated'],
    ['PRIORITIZATION_COMPLETED', 'validation', 'Preparing insights'],
    ['SCORE_GENERATED', 'validation', 'Finalising health insights'],
    ['PUBLISHED', 'completed', 'Report analysis completed.'],
    ['FAILED', 'failed', 'Processing failed because the backend could not complete analysis.'],
    ['FUTURE_BACKEND_STATUS', 'processing', 'Analysing your report']
  ] as const)('maps %s to truthful backend-derived presentation', (status, stage, message) => {
    const presentation = statusToReportPresentation(status);
    expect(presentation).toMatchObject({ stage, message });
    expect(presentation).not.toHaveProperty('percent');
  });

  it('does not render fabricated percentages, stage checklists, or time estimates', () => {
    expect(screenSource).not.toContain('% complete');
    expect(screenSource).not.toContain('processingPercent');
    expect(screenSource).not.toContain('processingStep');
    expect(screenSource).not.toContain('preparingProgress');
    expect(screenSource).not.toContain('stepText.map');
    expect(screenSource).not.toContain('~2 min');
    expect(screenSource).not.toContain('15–45 seconds');
    expect(screenSource).toContain('Analysis time can vary depending on the report.');
  });
});
