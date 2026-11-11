import { Router } from 'express';
import type { Request } from 'express';
import { requireDelegatedAuthority } from '../auth/delegated-authority.middleware.js';
import type { DelegatedAuthority } from '../auth/delegated-authority.js';
import { getRegisteredClientProfileContextByAccountId, getConsultantWearableSummaryForClient, listAssignedConsultantClientContexts, listConsultantReportSummariesForClient, listValidatedBiomarkerSummaryForClient } from '../consultants/consultants.repository.js';
import { getLatestAssessmentResult, getLatestDraftSession } from '../assessments/assessments.repository.js';
import { getFoodPreferenceProfile } from '../nutrition/food-preferences.service.js';
import { getReportFile } from '../reports/reports.store.js';
import { z } from 'zod';
import { nutritionPlanContentSchema } from '../nutrition/nutrition.routes.js';
import { getCareCaseByClientId } from '../platform/platform.store.js';
import { ExternalDietPlanFoodReferenceError, ingestExternalDietPlan, selectExternalDietPlan } from './external-diet-plan.store.js';
import { resolveConsultantApplicationIdentity } from './external-consultant-identity.repository.js';
import { CommonFoodApiError, generateDelegatedCommonFoodPlan, resolveDelegatedCommonFoodOption } from '../nutrition/common-food-consultant.service.js';
import { calculateHealthMetrics } from '../health/health-calculations.service.js';

export const externalConsultantAccessRouter = Router();
const authority = (req: Request) => (req as Request & { delegatedAuthority?: DelegatedAuthority }).delegatedAuthority;
const externalProfessionalIdPattern = /^ext_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const verifyTarget = (req: Request) => {
  const auth = authority(req);
  const userId = String(req.params.userId);
  if (!auth || auth.actor_type !== 'EXTERNAL_CONSULTANT' || auth.fiteatsy_user_id !== userId || !auth.connection_id || !auth.tenant_id) return null;
  return auth;
};

const mealHeadSchema = z.enum(['EARLY_MORNING', 'BREAKFAST', 'MID_MORNING', 'LUNCH', 'EVENING_SNACK', 'DINNER', 'BEDTIME']);
const governedOptionSchema = z.object({
  mealHead: mealHeadSchema,
  components: z.array(z.object({
    foodId: z.string().min(1),
    servingId: z.string().min(1),
    multiplier: z.number().positive(),
  })).min(1).max(12),
  target: z.object({
    kcal: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    kcalTolerance: z.number().positive(),
    proteinTolerance: z.number().positive(),
  }),
}).strict();

const governedGenerationSchema = z.object({
  mealHeads: z.array(mealHeadSchema).min(1).max(7),
  dailyTargets: z.object({
    calories: z.number().positive().max(10000),
    protein: z.number().nonnegative().max(1000),
    carbohydrate: z.number().nonnegative().max(2000).nullable().optional(),
    fat: z.number().nonnegative().max(1000).nullable().optional(),
    fibre: z.number().nonnegative().max(300).nullable().optional(),
  }).strict(),
}).strict();

const energyEstimateSchema = z.object({
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'very_active']),
  energyAdjustmentKcal: z.number().int().min(-2000).max(2000).default(0),
}).strict();

externalConsultantAccessRouter.post('/:userId/health-calculations/energy-estimate', requireDelegatedAuthority('fiteatsy.external.health.calculate', 'external_consultant_health_calculation'), async (req, res, next) => {
  const auth = verifyTarget(req);
  if (!auth) return res.status(403).json({ error: 'DELEGATED_TARGET_MISMATCH', message: 'The delegated client target is invalid.' });
  const scopes = new Set(auth.scopes ?? []);
  if (!scopes.has('PROFILE') || !scopes.has('MEASUREMENTS')) {
    return res.status(403).json({ error: 'HEALTH_CALCULATION_CONSENT_REQUIRED', message: 'Profile and Measurements consent are required for an energy estimate.' });
  }
  const parsed = energyEstimateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const context = await getRegisteredClientProfileContextByAccountId(String(req.params.userId));
    if (!context) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'The connected Fiteatsy client was not found.' });
    const calculatedAt = new Date().toISOString();
    const input = { ...context.calculationInput, activityLevel: parsed.data.activityLevel };
    const metrics = calculateHealthMetrics(input, calculatedAt);
    const adjustedDailyEnergy = metrics.tdee.status === 'AVAILABLE'
      ? metrics.tdee.value + parsed.data.energyAdjustmentKcal
      : null;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      connectionId: auth.connection_id,
      methodology: metrics.tdee.formulaVersion,
      calculatedAt,
      inputs: metrics.tdee.inputSnapshot,
      activityAssumption: parsed.data.activityLevel,
      energyAdjustmentKcal: parsed.data.energyAdjustmentKcal,
      bmr: metrics.bmr,
      tdee: metrics.tdee,
      adjustedDailyEnergy,
      unit: adjustedDailyEnergy == null ? null : 'kcal/day',
    });
  } catch (error) { return next(error); }
});

externalConsultantAccessRouter.post('/:userId/common-food/resolve-option', requireDelegatedAuthority('fiteatsy.external.diet.resolve', 'external_consultant_diet_option'), async (req, res, next) => {
  const auth = verifyTarget(req);
  if (!auth) return res.status(403).json({ error: 'DELEGATED_TARGET_MISMATCH', message: 'The delegated client target is invalid.' });
  if (!(auth.scopes ?? []).includes('DIET_PLANS')) return res.status(403).json({ error: 'DIET_PLAN_CONSENT_REQUIRED', message: 'Active Diet Plans consent is required.' });
  const parsed = governedOptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const option = await resolveDelegatedCommonFoodOption({ accountId: String(req.params.userId), ...parsed.data });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ connectionId: auth.connection_id, option });
  } catch (error) {
    if (error instanceof CommonFoodApiError) return res.status(error.statusCode).json({ error: error.code, message: error.message });
    return next(error);
  }
});

externalConsultantAccessRouter.post('/:userId/common-food/generate', requireDelegatedAuthority('fiteatsy.external.diet.generate', 'external_consultant_diet_generation'), async (req, res, next) => {
  const auth = verifyTarget(req);
  if (!auth) return res.status(403).json({ error: 'DELEGATED_TARGET_MISMATCH', message: 'The delegated client target is invalid.' });
  if (!(auth.scopes ?? []).includes('DIET_PLANS')) return res.status(403).json({ error: 'DIET_PLAN_CONSENT_REQUIRED', message: 'Active Diet Plans consent is required.' });
  const parsed = governedGenerationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await generateDelegatedCommonFoodPlan({ accountId: String(req.params.userId), ...parsed.data });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ connectionId: auth.connection_id, ...result });
  } catch (error) {
    if (error instanceof CommonFoodApiError) return res.status(error.statusCode).json({ error: error.code, message: error.message });
    return next(error);
  }
});

export const externalPlanPublicationSchema = z.object({
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

externalConsultantAccessRouter.get('/assignments/clients', requireDelegatedAuthority('fiteatsy.external.assignment.read', 'external_consultant_assignment_roster', 'EXTERNAL_CONSULTANT'), async (req, res, next) => {
  const auth = authority(req);
  if (!auth?.tenant_id || !externalProfessionalIdPattern.test(auth.sub)) {
    return res.status(403).json({ error: 'DELEGATED_ASSIGNMENT_ACTOR_INVALID', message: 'The delegated consultant identity is invalid.' });
  }
  try {
    const identity = await resolveConsultantApplicationIdentity(auth.sub.slice('ext_'.length), auth.sub);
    if (identity.status !== 'RESOLVED') {
      return res.status(403).json({ error: `CONSULTANT_IDENTITY_${identity.status}`, message: 'The delegated consultant identity is not active and unambiguous.' });
    }
    const clients = await listAssignedConsultantClientContexts(identity.applicationUserId);
    res.setHeader('Cache-Control', 'no-store, private');
    return res.status(200).json({
      clients: clients.map((client) => ({
        userId: client.accountId,
        clientId: client.publicClientId,
        displayName: client.name,
        email: client.email,
        mobile: client.mobileNumberMasked,
        assignmentState: 'ACTIVE'
      }))
    });
  } catch (error) {
    return next(error);
  }
});

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
    if (error instanceof ExternalDietPlanFoodReferenceError) {
      return res.status(422).json({
        error: 'UNVERIFIED_FOOD_REFERENCE',
        message: 'Replace foods that are no longer available in the verified catalogue, then try publishing again.',
        invalidFoods: error.invalidReferences.map(({ displayName, mealHead }) => ({ displayName, mealHead })),
      });
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
