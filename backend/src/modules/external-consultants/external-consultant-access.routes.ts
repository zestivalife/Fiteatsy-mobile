import { Router } from 'express';
import type { Request } from 'express';
import { requireDelegatedAuthority } from '../auth/delegated-authority.middleware.js';
import type { DelegatedAuthority } from '../auth/delegated-authority.js';
import { getRegisteredClientProfileContextByAccountId, getConsultantWearableSummaryForClient, listAssignedExternalConsultantClientReferences, listConsultantReportSummariesForClient, listValidatedBiomarkerSummaryForClient } from '../consultants/consultants.repository.js';
import { getReportFile } from '../reports/reports.store.js';

export const externalConsultantAccessRouter = Router();
const authority = (req: Request) => (req as Request & { delegatedAuthority?: DelegatedAuthority }).delegatedAuthority;
const externalProfessionalIdPattern = /^ext_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const verifyTarget = (req: Request) => {
  const auth = authority(req);
  const userId = String(req.params.userId);
  if (!auth || auth.actor_type !== 'EXTERNAL_CONSULTANT' || auth.fiteatsy_user_id !== userId || !auth.connection_id || !auth.tenant_id) return null;
  return auth;
};

externalConsultantAccessRouter.get('/assignments/clients', requireDelegatedAuthority('fiteatsy.external.assignment.read', 'external_consultant_assignment_roster', 'EXTERNAL_CONSULTANT'), async (req, res, next) => {
  const auth = authority(req);
  if (!auth?.tenant_id || !externalProfessionalIdPattern.test(auth.sub)) {
    return res.status(403).json({ error: 'DELEGATED_ASSIGNMENT_ACTOR_INVALID', message: 'The delegated consultant identity is invalid.' });
  }
  try {
    // Zestiva and Fiteatsy tenant identifiers are separate namespaces. The
    // repository therefore enforces the Fiteatsy tenant boundary using the
    // professional's active membership and the assignment/client tenant.
    const clients = await listAssignedExternalConsultantClientReferences(auth.sub);
    res.setHeader('Cache-Control', 'no-store, private');
    return res.status(200).json({
      clients: clients.map((client) => ({
        userId: client.accountId,
        clientId: client.publicClientId,
        displayName: client.name,
        assignmentState: 'ACTIVE'
      }))
    });
  } catch (error) { return next(error); }
});

externalConsultantAccessRouter.get('/:userId/health-context', requireDelegatedAuthority('fiteatsy.external.health.read', 'external_consultant_health'), async (req, res, next) => {
  const auth = verifyTarget(req);
  if (!auth) return res.status(403).json({ error: 'DELEGATED_TARGET_MISMATCH', message: 'The delegated client target is invalid.' });
  try {
    const context = await getRegisteredClientProfileContextByAccountId(String(req.params.userId));
    if (!context) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'The connected Fiteatsy client was not found.' });
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
  } catch (error) { return next(error); }
});

externalConsultantAccessRouter.get('/:userId/reports/:reportId/file', requireDelegatedAuthority('fiteatsy.external.report.read', 'external_consultant_report'), async (req, res, next) => {
  const auth = verifyTarget(req);
  if (!auth || !(auth.scopes ?? []).includes('HEALTH_SUMMARY')) return res.status(403).json({ error: 'REPORT_ACCESS_DENIED', message: 'Report access was not consented.' });
  try {
    const context = await getRegisteredClientProfileContextByAccountId(String(req.params.userId));
    if (!context) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'The connected Fiteatsy client was not found.' });
    const file = await getReportFile(String(req.params.reportId), { userId: context.accountId, clientId: context.internalClientId });
    if (!file) return res.status(404).json({ error: 'REPORT_FILE_NOT_FOUND', message: 'The report file was not found.' });
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.fileSize));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    return res.status(200).send(file.content);
  } catch (error) { return next(error); }
});
