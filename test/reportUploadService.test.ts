jest.mock('../src/services/apiClient', () => ({
  apiBaseUrl: 'http://localhost:4000',
  buildAuthorizationHeaders: jest.fn(() => ({ Authorization: 'Bearer test-token' }))
}));

import { uploadAndAnalyzeReport } from '../src/services/reportUploadService';

describe('reportUploadService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  it('returns parsed response when upload succeeds', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: async () =>
        JSON.stringify({
          reportId: 'rep_1',
          status: 'UPLOADED',
          message: 'Report uploaded successfully. Processing health information...'
        })
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          reportId: 'rep_1',
          status: 'PUBLISHED'
        })
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'rep_1',
          status: 'PUBLISHED',
          analysis: {
            reportDate: '15 Mar 2026',
            labName: 'Dr. Lal PathLabs',
            parameters: [],
            score: 78,
            categoryScores: { Blood: 80, Metabolic: 70, Organs: 75, Thyroid: 74, Vitamins: 73 },
            summary: 'ok',
            actionPlan: []
          }
        })
    });

    const response = await uploadAndAnalyzeReport({
      fileUri: 'file:///tmp/report.pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf'
    });

    expect(response.labName).toBe('Dr. Lal PathLabs');
    expect(response.score).toBe(78);
  });

  it('maps timeout/abort errors to actionable message', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

    await expect(
      uploadAndAnalyzeReport({
        fileUri: 'file:///tmp/report.pdf',
        fileName: 'report.pdf',
        mimeType: 'application/pdf'
      })
    ).rejects.toThrow('Analysis timed out');
  });

  it('maps unreachable backend to actionable network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    await expect(
      uploadAndAnalyzeReport({
        fileUri: 'file:///tmp/report.pdf',
        fileName: 'report.pdf',
        mimeType: 'application/pdf'
      })
    ).rejects.toThrow('Could not reach analysis server');
  });
});
