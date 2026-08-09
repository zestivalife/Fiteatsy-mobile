import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Report deletion governance', () => {
  const routes = readFileSync(join(process.cwd(), 'backend/src/modules/reports/reports.routes.ts'), 'utf8');
  const store = readFileSync(join(process.cwd(), 'backend/src/modules/reports/reports.store.ts'), 'utf8');
  const biomarkers = readFileSync(join(process.cwd(), 'backend/src/modules/biomarkers/biomarkers.repository.ts'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/services/reportUploadService.ts'), 'utf8');
  const screen = readFileSync(join(process.cwd(), 'src/screens/home/ReportsScreen.tsx'), 'utf8');
  const migration = readFileSync(join(process.cwd(), 'backend/src/db/migrations/0011_report_soft_delete_governance.sql'), 'utf8');
  const server = readFileSync(join(process.cwd(), 'backend/src/server.ts'), 'utf8');
  const purgeJob = readFileSync(join(process.cwd(), 'backend/src/jobs/purge-deleted-reports.ts'), 'utf8');

  it('soft deletes single reports and records a 30 day recovery state', () => {
    expect(migration).toContain("'DELETED'");
    expect(migration).toContain('deleted_by');
    expect(store).toContain("set processing_status = 'DELETED', deleted_at = now(), deleted_by = $4");
    expect(routes).toContain('recoveryWindowDays: 30');
  });

  it('scopes delete-all to authenticated ownership and rejects caller supplied ids', () => {
    expect(routes).toContain("reportsRouter.delete('/all'");
    expect(routes).toContain('Array.isArray(req.body?.reportIds) || Array.isArray(req.body?.ids)');
    expect(store).toContain('where user_id = $1');
    expect(store).toContain('and client_id = $2');
  });

  it('excludes deleted report observations from biomarker history and recomputes scores after deletion', () => {
    expect(biomarkers).toContain('left join health_reports hr on hr.id = bo.source_report_id');
    expect(biomarkers).toContain("hr.processing_status <> 'DELETED'");
    expect(routes).toContain('recomputeOwnerHealthScores(owner)');
    expect(routes).toContain('clearHealthScoresForOwner(owner)');
  });

  it('uses API-backed mobile deletion with typed bulk confirmation', () => {
    expect(service).toContain('deleteAnalyzedReport');
    expect(service).toContain('deleteAllAnalyzedReports');
    expect(screen).toContain("Type DELETE to confirm");
    expect(screen).toContain("deleteAllConfirmation.trim().toUpperCase() !== 'DELETE'");
    expect(screen).not.toContain('onDelete={() => setReports((prev) => prev.filter((r) => r.id !== report.id))}');
  });

  it('schedules hard deletion only after the recovery window', () => {
    expect(purgeJob).toContain('REPORT_DELETE_RECOVERY_DAYS ?? 30');
    expect(purgeJob).toContain('purgeDeletedReportsPastRecoveryWindow');
    expect(purgeJob).toContain('setInterval(runSafely, dayMs)');
    expect(server).toContain('scheduleDeletedReportPurge()');
  });
});
