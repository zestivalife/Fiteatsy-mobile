import { Router } from 'express';
import { requireDelegatedAuthority } from '../auth/delegated-authority.middleware.js';
import { getRegisteredClientProfileContextByAccountId, getConsultantWearableSummaryForClient, listConsultantReportSummariesForClient, listValidatedBiomarkerSummaryForClient } from '../consultants/consultants.repository.js';
import { getReportFile } from '../reports/reports.store.js';
export const externalConsultantAccessRouter = Router();
const authority = (req) => req.delegatedAuthority;
const verifyTarget = (req) => {
    const auth = authority(req);
    const userId = String(req.params.userId);
    if (!auth || auth.actor_type !== 'EXTERNAL_CONSULTANT' || auth.fiteatsy_user_id !== userId || !auth.connection_id || !auth.tenant_id)
        return null;
    return auth;
};
externalConsultantAccessRouter.get('/:userId/health-context', requireDelegatedAuthority('fiteatsy.external.health.read', 'external_consultant_health'), async (req, res, next) => {
    const auth = verifyTarget(req);
    if (!auth)
        return res.status(403).json({ error: 'DELEGATED_TARGET_MISMATCH', message: 'The delegated client target is invalid.' });
    try {
        const context = await getRegisteredClientProfileContextByAccountId(String(req.params.userId));
        if (!context)
            return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'The connected Fiteatsy client was not found.' });
        const scopes = new Set(auth.scopes ?? []);
        const [reports, biomarkers, wearables] = await Promise.all([
            scopes.has('HEALTH_SUMMARY') ? listConsultantReportSummariesForClient(context.internalClientId, context.accountId, 100) : Promise.resolve([]),
            scopes.has('BIOMARKERS') ? listValidatedBiomarkerSummaryForClient(context.internalClientId, context.accountId) : Promise.resolve([]),
            scopes.has('MEASUREMENTS') ? getConsultantWearableSummaryForClient(context.internalClientId, context.accountId) : Promise.resolve(null)
        ]);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
            connectionId: auth.connection_id,
            profile: scopes.has('PROFILE') ? context.profile : null,
            measurements: scopes.has('MEASUREMENTS') ? context.calculationInput : null,
            reports,
            biomarkers,
            wearables,
            generatedAt: new Date().toISOString()
        });
    }
    catch (error) {
        return next(error);
    }
});
externalConsultantAccessRouter.get('/:userId/reports/:reportId/file', requireDelegatedAuthority('fiteatsy.external.report.read', 'external_consultant_report'), async (req, res, next) => {
    const auth = verifyTarget(req);
    if (!auth || !(auth.scopes ?? []).includes('HEALTH_SUMMARY'))
        return res.status(403).json({ error: 'REPORT_ACCESS_DENIED', message: 'Report access was not consented.' });
    try {
        const context = await getRegisteredClientProfileContextByAccountId(String(req.params.userId));
        if (!context)
            return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'The connected Fiteatsy client was not found.' });
        const file = await getReportFile(String(req.params.reportId), { userId: context.accountId, clientId: context.internalClientId });
        if (!file)
            return res.status(404).json({ error: 'REPORT_FILE_NOT_FOUND', message: 'The report file was not found.' });
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Length', String(file.fileSize));
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
        return res.status(200).send(file.content);
    }
    catch (error) {
        return next(error);
    }
});
