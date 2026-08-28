import fs from 'node:fs';
import path from 'node:path';

jest.mock('../src/services/apiClient', () => ({
  apiBaseUrl: 'http://localhost:4000',
  buildAuthorizationHeaders: () => ({ Authorization: 'Bearer test' })
}));

import { statusToReportProgress } from '../src/services/reportUploadService';

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
    expect(screenSource).toContain('Live status: {processingStatus}');
  });

  it.each([
    ['UPLOADED', 'uploaded', 30],
    ['PROCESSING', 'processing', 45],
    ['EXTRACTION_COMPLETED', 'extraction', 74],
    ['VALIDATION_COMPLETED', 'validation', 88],
    ['PUBLISHED', 'completed', 100],
    ['FAILED', 'failed', 100]
  ] as const)('maps %s from backend state without a timer-driven status', (status, stage, percent) => {
    expect(statusToReportProgress(status)).toMatchObject({ stage, percent });
  });
});
