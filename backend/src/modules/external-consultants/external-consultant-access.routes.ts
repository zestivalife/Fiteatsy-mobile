import { Router } from 'express';
import type { Request } from 'express';
import { requireDelegatedAuthority } from '../auth/delegated-authority.middleware.js';
import type { DelegatedAuthority } from '../auth/delegated-authority.js';
import { getRegisteredClientProfileContextByAccountId, getConsultantWearableSummaryForClient, listConsultantReportSummariesForClient, listValidatedBiomarkerSummaryForClient } from '../consultants/consultants.repository.js';
import { getReportFile } from '../reports/reports.store.js';
import { z } from 'zod';
import { nutritionPlanContentSchema } from '../nutrition/nutrition.routes.js';
import { getCareCaseByClientId } from '../platform/platform.store.js';
import { ingestExternalDietPlan, selectExternalDietPlan } from './external-diet-plan.store.js';

export const externalConsultantAccessRouter = Router();
const authority = (req: Request) => (req as Request & { delegatedAuthority?: DelegatedAuthority }).delegatedAuthority;

const verifyTarget = (req: Request) => {
  const auth = authority(req);
  const userId = String(req.params.userId);
  if (!auth || auth.actor_type !== 'EXTERNAL_CONSULTANT' || auth.fiteatsy_user_id !== userId || !auth.connection_id || !auth.tenant_id) return null;
  return auth;
};

const externalPlanPublicationSchema = z.object({
  externalPlanId: z.string().trim().min(1).max(200),
  externalVersion: z.string().trim().min(1).max(200),
  consultantId: z.string().trim().min(1).max(200),
  consultantName: z.string().trim().min(1).max(200),
  practiceName: z.string().trim().min(1).max(200),
  publishedAtISO: z.string().datetime(),
  content: nutritionPlanContentSchema.superRefine((content, ctx) => {
    for (const [mealKey, section] of Object.entries(content.mealPlan)) {
      for (const [optionIndex, option] of section.options.entries()) {
        if (!option.components?.length || option.components.some((component) => !component.foodId)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mealPlan', mealKey, 'options', optionIndex, 'components'], message: 'Published meal options must reference verified catalogue foods.' });
        }
      }
    }
  }),
});

const externalPlanSelectionSchema = z.object({ externalPlanId: z.string().trim().min(1).max(200) });

externalConsultantAccessRouter.post('/:userId/diet-plans', requireDelegatedAuthority('fiteatsy.external.diet.write', 'external_consultant_diet_plan'), async (req, res, next) => {
  const auth = verifyTarget(req);
  if (!auth || !(auth.scopes ?? []).includes('DIET_PLANS')) return res.status(403).json({ error: 'DIET_PLAN_ACCESS_DENIED', message: 'Diet-plan access was not consented.' });
  const parsed = externalPlanPublicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_DIET_PLAN', details: parsed.error.flatten() });
  try {
    const context = await getRegisteredClientProfileContextByAccountId(String(req.params.userId));
    if (!context) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'The connected Fiteatsy client was not found.' });
    const careCase = await getCareCaseByClientId(context.internalClientId);
    if (!careCase) return res.status(409).json({ error: 'CARE_CASE_NOT_FOUND', message: 'The client does not have an active care case.' });
    const result = await ingestExternalDietPlan({
      ...parsed.data, userId: context.accountId, careCaseId: careCase.id,
      connectionId: auth.connection_id!, tenantId: auth.tenant_id!,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'EXTERNAL_DIET_PLAN_UNVERIFIED_FOOD_REFERENCE') {
      return res.status(422).json({ error: 'UNVERIFIED_FOOD_REFERENCE', message: 'Every external meal component must use an active verified Fiteatsy food.' });
    }
    return next(error);
  }
});

externalConsultantAccessRouter.put('/:userId/diet-plans/active', requireDelegatedAuthority('fiteatsy.external.diet.select', 'external_consultant_diet_plan_selection'), async (req, res, next) => {
  const auth = verifyTarget(req);
  if (!auth || !(auth.scopes ?? []).includes('DIET_PLANS')) return res.status(403).json({ error: 'DIET_PLAN_ACCESS_DENIED', message: 'Diet-plan access was not consented.' });
  const parsed = externalPlanSelectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_DIET_PLAN_SELECTION', details: parsed.error.flatten() });
  try {
    const context = await getRegisteredClientProfileContextByAccountId(String(req.params.userId));
    if (!context) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'The connected Fiteatsy client was not found.' });
    const careCase = await getCareCaseByClientId(context.internalClientId);
    if (!careCase) return res.status(409).json({ error: 'CARE_CASE_NOT_FOUND', message: 'The client does not have an active care case.' });
    const selected = await selectExternalDietPlan({ userId: context.accountId, careCaseId: careCase.id, connectionId: auth.connection_id!, externalPlanId: parsed.data.externalPlanId });
    if (!selected) return res.status(404).json({ error: 'DIET_PLAN_NOT_FOUND', message: 'The published external diet plan was not found.' });
    return res.status(200).json(selected);
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
