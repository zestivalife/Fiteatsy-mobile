import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('report re-analysis intelligence layer', () => {
  it('keeps standard extraction as default and exposes advanced recovery as user-triggered reanalysis', () => {
    const routes = read('backend/src/modules/reports/reports.routes.ts');
    const service = read('backend/src/modules/reports/reports.service.ts');
    const mobileService = read('src/services/reportUploadService.ts');
    const reportsScreen = read('src/screens/home/ReportsScreen.tsx');

    expect(routes).toContain('input.analyzer ?? analyzeReportBuffer');
    expect(routes).toContain("analysisMode: 'advanced_reanalysis'");
    expect(routes).toContain('analyzeReportBufferAdvanced');
    expect(routes).not.toContain('REANALYZE_NOT_AVAILABLE');
    expect(routes).toContain('requiresAdvancedReanalysis');
    expect(routes).toContain('REANALYSIS_STAGE');
    const attachIndex = routes.indexOf('const saved = await input.attach()');
    const persistIndex = routes.indexOf('const intelligence = await input.persist(selectedAnalysis)');
    const finalizeIndex = routes.indexOf('const completed = await input.finalize');
    expect(attachIndex).toBeGreaterThanOrEqual(0);
    expect(attachIndex).toBeLessThan(persistIndex);
    expect(persistIndex).toBeLessThan(finalizeIndex);
    expect(service).toContain('document_intelligence_layout_recovery');
    expect(service).toContain('describeAiProviderError');
    expect(mobileService).toContain('export const reanalyzeReport');
    expect(reportsScreen).toContain('Some information could not be confidently analysed.');
    expect(reportsScreen).toContain('Re-analyse Report');
  });

  it('persists original upload files and appends attempt summaries for traceability', () => {
    const migration = read('backend/src/db/migrations/0012_report_reanalysis_intelligence.sql');
    const metadataMigration = read('backend/src/db/migrations/0013_report_file_storage_metadata.sql');
    const store = read('backend/src/modules/reports/reports.store.ts');

    expect(migration).toContain('analysis_attempts jsonb');
    expect(migration).toContain('create table if not exists health_report_files');
    expect(metadataMigration).toContain('add column if not exists file_size bigint');
    expect(store).toContain('saveReportFile');
    expect(store).toContain('getReportFile');
    expect(store).toContain('analysis_attempts = (');
    expect(store).toContain("jsonb_array_elements(coalesce(health_reports.analysis_attempts, '[]'::jsonb))");
    expect(store).toContain(') || jsonb_build_array(');
    expect(store).toContain('compareAnalysisQuality');
    expect(store).toContain("'selected', $10::boolean");
  });
});
