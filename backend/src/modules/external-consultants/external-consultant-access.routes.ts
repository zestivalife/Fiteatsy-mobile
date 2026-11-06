import { Router } from 'express';
import type { Request } from 'express';
import { requireDelegatedAuthority } from '../auth/delegated-authority.middleware.js';
import type { DelegatedAuthority } from '../auth/delegated-authority.js';
import { getRegisteredClientProfileContextByAccountId, getConsultantWearableSummaryForClient, listConsultantReportSummariesForClient, listValidatedBiomarkerSummaryForClient } from '../consultants/consultants.repository.js';
import { getLatestAssessmentResult, getLatestDraftSession } from '../assessments/assessments.repository.js';
import { getFoodPreferenceProfile } from '../nutrition/food-preferences.service.js';
import { getReportFile } from '../reports/reports.store.js';
import { z } from 'zod';
import { CommonFoodApiError, resolveDelegatedCommonFoodOption } from '../nutrition/common-food-consultant.service.js';

export const externalConsultantAccessRouter = Router();
const authority = (req: Request) => (req as Request & { delegatedAuthority?: DelegatedAuthority }).delegatedAuthority;

const verifyTarget = (req: Request) => {
  const auth = authority(req);
  const userId = String(req.params.userId);
  if (!auth || auth.actor_type !== 'EXTERNAL_CONSULTANT' || auth.fiteatsy_user_id !== userId || !auth.connection_id || !auth.tenant_id) return null;
  return auth;
};

const mealHeadSchema=z.enum(['EARLY_MORNING','BREAKFAST','MID_MORNING','LUNCH','EVENING_SNACK','DINNER','BEDTIME']);
const governedOptionSchema=z.object({
  mealHead:mealHeadSchema,
  components:z.array(z.object({foodId:z.string().min(1),servingId:z.string().min(1),multiplier:z.number().positive()})).min(1).max(12),
  target:z.object({kcal:z.number().nonnegative(),protein:z.number().nonnegative(),kcalTolerance:z.number().positive(),proteinTolerance:z.number().positive()})
}).strict();

externalConsultantAccessRouter.post('/:userId/common-food/resolve-option', requireDelegatedAuthority('fiteatsy.external.diet.resolve', 'external_consultant_diet_option'), async (req, res, next) => {
  const auth = verifyTarget(req);
  if (!auth) return res.status(403).json({ error: 'DELEGATED_TARGET_MISMATCH', message: 'The delegated client target is invalid.' });
  if (!(auth.scopes ?? []).includes('DIET_PLANS')) return res.status(403).json({ error: 'DIET_PLAN_CONSENT_REQUIRED', message: 'Active Diet Plans consent is required.' });
  const parsed=governedOptionSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'INVALID_INPUT',details:parsed.error.flatten()});
  try{
    const option=await resolveDelegatedCommonFoodOption({accountId:String(req.params.userId),...parsed.data});
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({connectionId:auth.connection_id,option});
  }catch(error){
    if(error instanceof CommonFoodApiError)return res.status(error.statusCode).json({error:error.code,message:error.message});
    return next(error);
  }
});

externalConsultantAccessRouter.get('/:userId/health-context', requireDelegatedAuthority('fiteatsy.external.health.read', 'external_consultant_health'), async (req, res, next) => {
  const auth = verifyTarget(req);
  if (!auth) return res.status(403).json({ error: 'DELEGATED_TARGET_MISMATCH', message: 'The delegated client target is invalid.' });
  try {
    const context = await getRegisteredClientProfileContextByAccountId(String(req.params.userId));
    if (!context) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'The connected Fiteatsy client was not found.' });
    const scopes = new Set(auth.scopes ?? []);
    const owner = { accountId: context.accountId, clientId: context.internalClientId };
    const [reports, biomarkers, wearables, foodPreferences, completedAssessment, draftAssessment] = await Promise.all([
      scopes.has('HEALTH_SUMMARY') ? listConsultantReportSummariesForClient(context.internalClientId, context.accountId, 100) : Promise.resolve([]),
      scopes.has('BIOMARKERS') ? listValidatedBiomarkerSummaryForClient(context.internalClientId, context.accountId) : Promise.resolve([]),
      scopes.has('MEASUREMENTS') ? getConsultantWearableSummaryForClient(context.internalClientId, context.accountId) : Promise.resolve(null),
      scopes.has('PROFILE') ? getFoodPreferenceProfile(context.profile.client.id) : Promise.resolve(null),
      scopes.has('HEALTH_SUMMARY') ? getLatestAssessmentResult(owner) : Promise.resolve({ result: null, previousResult: null }),
      scopes.has('HEALTH_SUMMARY') ? getLatestDraftSession(owner) : Promise.resolve(null)
    ]);
    const latestAssessment = completedAssessment.result;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      connectionId: auth.connection_id,
      profile: scopes.has('PROFILE') ? context.profile : null,
      foodPreferences: scopes.has('PROFILE') ? foodPreferences : null,
      assessment: scopes.has('HEALTH_SUMMARY') ? {
        type: 'PSS10',
        status: latestAssessment ? 'COMPLETED' : draftAssessment ? 'DRAFT' : 'NOT_STARTED',
        completedAtISO: latestAssessment?.completedAtISO ?? null,
        instrumentVersion: latestAssessment?.instrumentVersion ?? draftAssessment?.instrumentVersion ?? null,
        result: latestAssessment
      } : null,
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
