import { pathToFileURL } from 'node:url';
import { purgeDeletedReportsPastRecoveryWindow } from '../modules/reports/reports.store.js';
const retentionDays = Number(process.env.REPORT_DELETE_RECOVERY_DAYS ?? 30);
const dayMs = 24 * 60 * 60 * 1000;
export const purgeDeletedReports = async () => {
    const result = await purgeDeletedReportsPastRecoveryWindow(Number.isFinite(retentionDays) ? retentionDays : 30);
    console.log('[ReportRetention] purge complete', result);
};
export const scheduleDeletedReportPurge = () => {
    const runSafely = () => {
        void purgeDeletedReports().catch((error) => {
            console.error('[ReportRetention] purge failed', error);
        });
    };
    runSafely();
    const timer = setInterval(runSafely, dayMs);
    timer.unref?.();
    return timer;
};
const isDirectRun = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    purgeDeletedReports().catch((error) => {
        console.error('[ReportRetention] purge failed', error);
        process.exitCode = 1;
    });
}
