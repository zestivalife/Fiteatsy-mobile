import { type Response, Router } from 'express';
import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import type { NutritionPlanContent } from '../platform/platform.types.js';
import { canAccessConsultantClientApi } from '../consultants/consultants.service.js';
import {
  approveConsultantDietPlan,
  canAccessConsultantNutritionClient,
  generateConsultantDietPlanDraft,
  getSeniorConsultantDietPlanReviewQueue,
  getConsultantLatestDietPlan,
  getConsultantNutritionIntelligence,
  getPublishedDietPlanForClient,
  getDietPlanDeliveryStatusForClient,
  getClientNutritionExperience,
  getClientNutritionPattern,
  logClientNutritionEvent,
  logClientNutritionWater,
  NutritionPlanWorkflowError,
  publishConsultantDietPlan,
  requestConsultantDietPlanChanges,
  submitConsultantDietPlanForReview,
  updateConsultantDietPlanDraft,
  exportConsultantDietPlanDocument,
  logNutritionMealConsumption,
} from './nutrition.service.js';
import { getFoodPreferenceProfile, listVerifiedFoodCatalogue, updateFoodPreferenceProfile } from './food-preferences.service.js';

const mealOptionSchema = z.object({
  id: z.string().optional(),
  slot: z.number().int().min(1),
  meal: z.string(),
  portion: z.string(),
  prepNote: z.string(),
  approxKcal: z.number().nullable(),
  proteinGrams: z.number().nullable(),
  carbsGrams: z.number().nullable().optional(),
  fatGrams: z.number().nullable().optional(),
  fibreGrams: z.number().nullable().optional(),
  matchClassification: z.enum(['best_match', 'good_match', 'acceptable', 'outside_target']).optional(),
  sourceType: z.enum(['verified_library', 'consultant_custom', 'template_variant', 'generated_template']).optional(),
  recommendationReason: z.string().nullable().optional(),
  cuisineTags: z.array(z.string()).optional(),
  dietaryTags: z.array(z.string()).optional(),
  isApproved: z.boolean().optional(),
  components: z.array(
    z.object({
      id: z.string().optional(),
      foodId: z.string().nullable().optional(),
      componentName: z.string(),
      quantity: z.number().nullable(),
      quantityUnit: z.string(),
      householdLabel: z.string().nullable().optional(),
      canonicalGrams: z.number().nullable().optional(),
      calories: z.number().nullable(),
      proteinGrams: z.number().nullable(),
      carbsGrams: z.number().nullable().optional(),
      fatGrams: z.number().nullable().optional(),
      fibreGrams: z.number().nullable().optional(),
      locked: z.boolean().optional(),
    }),
  ).optional(),
});

const mealTargetSchema = z.object({
  calories: z.number().nullable(),
  proteinGrams: z.number().nullable(),
  caloriesBand: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
  }),
  proteinBand: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
  }),
  allocationBasis: z.string(),
});

const recommendationSetSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().nullable().optional(),
  optionIds: z.array(z.string()),
});

const mealSectionSchema = z.object({
  window: z.string(),
  focus: z.string(),
  target: mealTargetSchema.optional(),
  recommendationSets: z.array(recommendationSetSchema).optional(),
  options: z.array(mealOptionSchema),
  availableOptions: z.array(mealOptionSchema).optional(),
});

const hydrationRhythmEntrySchema = z.object({
  slot: z.number().int().min(1),
  anchor: z.string(),
  quantity: z.string(),
  note: z.string(),
});

const substitutionSchema = z.object({
  foodGroup: z.string(),
  usualChoice: z.string(),
  alternative: z.string(),
});

const supplementSchema = z.object({
  supplement: z.string(),
  dose: z.string(),
  timing: z.string(),
  duration: z.string(),
  note: z.string(),
});

const nutritionPlanContentSchema: z.ZodType<NutritionPlanContent> = z.object({
  nutritionSnapshot: z.object({
    client: z.string(),
    age: z.number().nullable(),
    gender: z.string().nullable(),
    goals: z.array(z.string()),
    healthConditions: z.array(z.string()),
    dietPreference: z.string().nullable(),
    allergies: z.array(z.string()),
    lifestyleSummary: z.string(),
    personalisedPlanFocus: z.string(),
    programmeName: z.string(),
    preparedBy: z.string(),
  }),
  dailyTargets: z.object({
    calories: z.number().nullable(),
    protein: z.number().nullable(),
    carbohydrates: z.number().nullable().optional(),
    fat: z.number().nullable().optional(),
    fibre: z.number().nullable().optional(),
    hydration: z.number().nullable(),
    movement: z.string(),
  }),
  mealPlan: z.object({
    earlyMorning: mealSectionSchema,
    breakfast: mealSectionSchema,
    midMorningSnack: mealSectionSchema,
    lunch: mealSectionSchema,
    eveningSnack: mealSectionSchema,
    dinner: mealSectionSchema,
    bedtimeNutrition: mealSectionSchema,
  }),
  hydrationRhythm: z.array(hydrationRhythmEntrySchema),
  weeklySuccessGuide: z.array(z.string()),
  smartSubstitutions: z.array(substitutionSchema),
  supplementsAndClinicalNotes: z.array(supplementSchema),
});

const generateDraftSchema = z.object({
  consultantName: z.string().trim().optional(),
  credentials: z.string().trim().optional(),
  programmeName: z.string().trim().optional(),
});

const updateDraftSchema = z.object({
  content: nutritionPlanContentSchema,
  reviewNotes: z.string().trim().nullable().optional(),
});

const reviewCommentSchema = z.object({
  comment: z.string().trim().min(1).max(2000),
});

const publishDietPlanSchema = z.object({
  approvedVersionId: z.string().trim().min(1),
});

const markMealConsumedSchema = z.object({
  planId: z.string().trim().min(1),
  versionId: z.string().trim().min(1),
  mealKey: z.string().trim().min(1),
  mealLabel: z.string().trim().min(1),
  mealName: z.string().trim().nullable().optional(),
  quantityLabel: z.string().trim().nullable().optional(),
  consumedAtISO: z.string().datetime().optional(),
  notes: z.string().trim().nullable().optional(),
});

const nutritionEventSchema = z.object({
  planId: z.string().trim().min(1), versionId: z.string().trim().min(1), mealKey: z.string().trim().min(1),
  state: z.enum(['PENDING', 'CONSUMED_APPROVED', 'CONSUMED_OUT_OF_PLAN', 'SKIPPED']), optionId: z.string().nullable().optional(),
  mealName: z.string().nullable().optional(), calories: z.number().nullable().optional(), proteinGrams: z.number().nullable().optional(),
  carbsGrams: z.number().nullable().optional(), fatGrams: z.number().nullable().optional(), fibreGrams: z.number().nullable().optional(),
  consumedAtISO: z.string().datetime().nullable().optional(),
});

const waterEventSchema = z.object({ planId: z.string().trim().min(1), versionId: z.string().trim().min(1), waterMl: z.number().int().positive().max(5000), consumedAtISO: z.string().datetime().nullable().optional() });

const mealSectionOrder = [
  'earlyMorning',
  'breakfast',
  'midMorningSnack',
  'lunch',
  'eveningSnack',
  'dinner',
  'bedtimeNutrition',
] as const;

const formatMealSectionLabel = (key: (typeof mealSectionOrder)[number]) =>
  ({
    earlyMorning: 'Early Morning',
    breakfast: 'Breakfast',
    midMorningSnack: 'Mid Morning Snack',
    lunch: 'Lunch',
    eveningSnack: 'Evening Snack',
    dinner: 'Dinner',
    bedtimeNutrition: 'Bedtime Nourishment',
  })[key];

const buildTodayNutritionView = (content: NutritionPlanContent) => {
  const todaysMeals = mealSectionOrder.map((key) => {
    const section = content.mealPlan[key];
    return {
      key,
      label: formatMealSectionLabel(key),
      window: section.window,
      focus: section.focus,
      target: section.target ?? null,
      primaryMeal: section.options[0]?.meal ?? null,
      portion: section.options[0]?.portion ?? null,
      note: section.options[0]?.prepNote ?? null,
      kcal: section.options[0]?.approxKcal ?? null,
      proteinGrams: section.options[0]?.proteinGrams ?? null,
      recommendationSets: section.recommendationSets ?? [],
      options: section.options,
    };
  });

  return {
    todaysMeals,
    consultantNotes: content.supplementsAndClinicalNotes
      .map((item) => item.note)
      .filter((item) => item && item.trim().length > 0)
      .slice(0, 3),
    hydrationRhythm: content.hydrationRhythm,
    substitutions: content.smartSubstitutions,
    weeklySuccessGuide: content.weeklySuccessGuide,
    dailyTargets: content.dailyTargets,
  };
};

export const consultantNutritionRouter = Router();
consultantNutritionRouter.use(requireAuthenticatedAccount);
consultantNutritionRouter.use((req, res, next) => {
  const account = getAuthenticatedAccount(req);
  if (!canAccessConsultantClientApi(account)) {
    return res.status(403).json({
      error: 'ROLE_NOT_ALLOWED',
      message: 'A consultant account is required to access nutrition workflow APIs.',
    });
  }
  return next();
});

const handleNutritionRouteError = (res: Response, error: unknown) => {
  if (error instanceof NutritionPlanWorkflowError) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
    });
  }

  throw error;
};

consultantNutritionRouter.get('/clients/:clientId/nutrition-intelligence', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const payload = await getConsultantNutritionIntelligence(req.params.clientId, account);
  if (!payload) {
    return res.status(403).json({
      error: 'CLIENT_ASSIGNMENT_REQUIRED',
      message: 'An active client assignment is required to access nutrition intelligence.',
    });
  }
  return res.status(200).json(payload);
});

consultantNutritionRouter.get('/clients/:clientId/food-preferences', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  if (!await canAccessConsultantNutritionClient(req.params.clientId, account, { allowSeniorAuthority: true })) {
    return res.status(403).json({ error: 'CLIENT_ASSIGNMENT_REQUIRED', message: 'An active client assignment is required to access food preferences.' });
  }
  const payload = await getFoodPreferenceProfile(req.params.clientId);
  if (!payload) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'Client was not found.' });
  return res.status(200).json(payload);
});

consultantNutritionRouter.put('/clients/:clientId/food-preferences', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  if (!await canAccessConsultantNutritionClient(req.params.clientId, account)) {
    return res.status(403).json({ error: 'CLIENT_ASSIGNMENT_REQUIRED', message: 'An active client assignment is required to update food preferences.' });
  }
  const payload = await updateFoodPreferenceProfile(req.params.clientId, account.accountId, 'consultant', req.body ?? {});
  if (!payload) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'Client was not found.' });
  return res.status(200).json(payload);
});

consultantNutritionRouter.get('/clients/:clientId/diet-plans/latest', async (req, res) => {
  const payload = await getConsultantLatestDietPlan(req.params.clientId, getAuthenticatedAccount(req));
  if (!payload) {
    return res.status(404).json({
      error: 'DIET_PLAN_NOT_FOUND',
      message: 'No nutrition plan has been created for this client yet.',
    });
  }
  return res.status(200).json(payload);
});

consultantNutritionRouter.get('/diet-plan-reviews', async (req, res) => {
  try {
    return res.status(200).json({ reviews: await getSeniorConsultantDietPlanReviewQueue(getAuthenticatedAccount(req)) });
  } catch (error) {
    return handleNutritionRouteError(res, error);
  }
});

consultantNutritionRouter.post('/clients/:clientId/diet-plans/draft', async (req, res) => {
  const parsed = generateDraftSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }
  const account = getAuthenticatedAccount(req);
  let payload;
  try {
    payload = await generateConsultantDietPlanDraft(req.params.clientId, account, parsed.data);
  } catch (error) {
    return handleNutritionRouteError(res, error);
  }
  if (!payload) {
    return res.status(404).json({
      error: 'DIET_PLAN_DRAFT_NOT_AVAILABLE',
      message: 'Unable to generate a nutrition draft for this client.',
    });
  }
  return res.status(201).json(payload);
});

consultantNutritionRouter.patch('/clients/:clientId/diet-plans/:dietPlanId', async (req, res) => {
  const parsed = updateDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }
  const account = getAuthenticatedAccount(req);
  let payload;
  try {
    payload = await updateConsultantDietPlanDraft(req.params.clientId, account, req.params.dietPlanId, parsed.data);
  } catch (error) {
    return handleNutritionRouteError(res, error);
  }
  if (!payload) {
    return res.status(404).json({
      error: 'DIET_PLAN_NOT_FOUND',
      message: 'Unable to update the requested nutrition draft.',
    });
  }
  return res.status(200).json(payload);
});

consultantNutritionRouter.post('/clients/:clientId/diet-plans/:dietPlanId/submit-review', async (req, res) => {
  let payload;
  try {
    payload = await submitConsultantDietPlanForReview(req.params.clientId, getAuthenticatedAccount(req), req.params.dietPlanId);
  } catch (error) {
    return handleNutritionRouteError(res, error);
  }
  if (!payload) return res.status(404).json({ error: 'DIET_PLAN_NOT_FOUND', message: 'Unable to submit the requested diet plan.' });
  return res.status(200).json(payload);
});

consultantNutritionRouter.post('/clients/:clientId/diet-plans/:dietPlanId/request-changes', async (req, res) => {
  const parsed = reviewCommentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'REVIEW_COMMENT_REQUIRED', details: parsed.error.flatten() });
  let payload;
  try {
    payload = await requestConsultantDietPlanChanges(req.params.clientId, getAuthenticatedAccount(req), req.params.dietPlanId, parsed.data.comment);
  } catch (error) {
    return handleNutritionRouteError(res, error);
  }
  if (!payload) return res.status(404).json({ error: 'DIET_PLAN_NOT_FOUND', message: 'Unable to request changes for the requested diet plan.' });
  return res.status(200).json(payload);
});

consultantNutritionRouter.post('/clients/:clientId/diet-plans/:dietPlanId/approve', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  let payload;
  try {
    payload = await approveConsultantDietPlan(req.params.clientId, account, req.params.dietPlanId);
  } catch (error) {
    return handleNutritionRouteError(res, error);
  }
  if (!payload) {
    return res.status(404).json({
      error: 'DIET_PLAN_NOT_FOUND',
      message: 'Unable to approve the requested nutrition draft.',
    });
  }
  return res.status(200).json(payload);
});

consultantNutritionRouter.post('/clients/:clientId/diet-plans/:dietPlanId/publish', async (req, res) => {
  const parsed = publishDietPlanSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'APPROVED_VERSION_REQUIRED', details: parsed.error.flatten() });
  const account = getAuthenticatedAccount(req);
  let payload;
  try {
    payload = await publishConsultantDietPlan(req.params.clientId, account, req.params.dietPlanId, parsed.data.approvedVersionId);
  } catch (error) {
    return handleNutritionRouteError(res, error);
  }
  if (!payload) {
    return res.status(404).json({
      error: 'DIET_PLAN_NOT_FOUND',
      message: 'Unable to publish the requested nutrition plan.',
    });
  }
  return res.status(200).json(payload);
});

consultantNutritionRouter.get('/clients/:clientId/diet-plans/:dietPlanId/download', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  let payload;
  try {
    payload = await exportConsultantDietPlanDocument(req.params.clientId, account, req.params.dietPlanId);
  } catch (error) {
    return handleNutritionRouteError(res, error);
  }
  if (!payload) {
    return res.status(404).json({
      error: 'DIET_PLAN_NOT_FOUND',
      message: 'Unable to export the requested diet plan.',
    });
  }

  const buffer = await fs.readFile(payload.document.path);
  res.setHeader('Content-Type', payload.document.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${payload.document.filename}"`);
  return res.status(200).send(buffer);
});

export const platformNutritionRouter = Router();
platformNutritionRouter.use(requireAuthenticatedAccount);

platformNutritionRouter.get('/food-catalogue', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 30;
  const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
  return res.status(200).json(await listVerifiedFoodCatalogue(query, Number.isFinite(limit) ? limit : 30, Number.isFinite(offset) ? offset : 0));
});

platformNutritionRouter.get('/food-preferences', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const payload = await getFoodPreferenceProfile(account.client.fiteatsyClientId);
  if (!payload) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'Your client profile was not found.' });
  return res.status(200).json(payload);
});

platformNutritionRouter.put('/food-preferences', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const payload = await updateFoodPreferenceProfile(account.client.fiteatsyClientId, account.user.id, 'client', req.body ?? {});
  if (!payload) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'Your client profile was not found.' });
  return res.status(200).json(payload);
});

platformNutritionRouter.get('/nutrition-plan', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const payload = await getPublishedDietPlanForClient({
    accountId: account.accountId,
    clientId: account.client.id,
  });
  if (!payload) {
    return res.status(404).json({
      error: 'DIET_PLAN_NOT_FOUND',
      message: 'Your personalised nutrition plan is still being prepared.',
    });
  }
  return res.status(200).json({
    ...payload,
    today: buildTodayNutritionView(payload.version.content),
  });
});

platformNutritionRouter.get('/nutrition-plan/status', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  return res.status(200).json(await getDietPlanDeliveryStatusForClient({
    accountId: account.accountId,
    clientId: account.client.id,
  }));
});

platformNutritionRouter.get('/nutrition-plan/today', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const payload = await getPublishedDietPlanForClient({
    accountId: account.accountId,
    clientId: account.client.id,
  });
  if (!payload) {
    return res.status(404).json({
      error: 'DIET_PLAN_NOT_FOUND',
      message: 'Your personalised nutrition plan is still being prepared.',
    });
  }
  return res.status(200).json({
    clientId: account.client.id,
    planId: payload.plan.id,
    versionId: payload.version.id,
    publishedAtISO: payload.plan.publishedAtISO,
    today: buildTodayNutritionView(payload.version.content),
  });
});

platformNutritionRouter.get('/nutrition-experience', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  try {
    const payload = await getClientNutritionExperience({ accountId: account.accountId, clientId: account.client.id }, typeof req.query.date === 'string' ? req.query.date : undefined);
    if (!payload) return res.status(404).json({ error: 'DIET_PLAN_NOT_FOUND', message: 'Your nutrition plan is being prepared.' });
    return res.status(200).json(payload);
  } catch (error) {
    if (error instanceof NutritionPlanWorkflowError) return handleNutritionRouteError(res, error);
    const message = error instanceof Error ? error.message : '';
    const errorCode = message.includes('supplementsAndClinicalNotes')
      ? 'NUTRITION_GUIDANCE_SHAPE_INVALID'
      : /mealPlan|options|Cannot convert undefined or null to object/.test(message)
        ? 'NUTRITION_MEAL_PLAN_SHAPE_INVALID'
        : /eventTimeISO|Invalid time value|localeCompare/.test(message)
          ? 'NUTRITION_EVENT_TIME_INVALID'
          : 'NUTRITION_PROJECTION_FAILED';
    console.error('[NutritionProjection] failed', { errorCode, error });
    return res.status(500).json({
      error: errorCode,
      message: `Nutrition projection failed (${errorCode}).`,
    });
  }
});

platformNutritionRouter.get('/nutrition-experience/pattern', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const payload = await getClientNutritionPattern({ accountId: account.accountId, clientId: account.client.id }, typeof req.query.endDate === 'string' ? req.query.endDate : undefined);
  if (!payload) return res.status(404).json({ error: 'DIET_PLAN_NOT_FOUND', message: 'Your nutrition plan is being prepared.' });
  return res.status(200).json(payload);
});

platformNutritionRouter.post('/nutrition-experience/event', async (req, res) => {
  const parsed = nutritionEventSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  const account = getAuthenticatedAccount(req);
  try {
    return res.status(201).json(await logClientNutritionEvent({ accountId: account.accountId, clientId: account.client.id }, parsed.data));
  } catch (error) { return handleNutritionRouteError(res, error); }
});

platformNutritionRouter.post('/nutrition-experience/water', async (req, res) => {
  const parsed = waterEventSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  const account = getAuthenticatedAccount(req);
  try {
    return res.status(201).json(await logClientNutritionWater({ accountId: account.accountId, clientId: account.client.id }, parsed.data));
  } catch (error) { return handleNutritionRouteError(res, error); }
});

platformNutritionRouter.post('/nutrition-plan/consume', async (req, res) => {
  const parsed = markMealConsumedSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }
  const account = getAuthenticatedAccount(req);
  try {
    const payload = await logNutritionMealConsumption(
      { accountId: account.accountId, clientId: account.client.id },
      {
        ...parsed.data,
        mealName: parsed.data.mealName ?? null,
        quantityLabel: parsed.data.quantityLabel ?? null,
        consumedAtISO: parsed.data.consumedAtISO ?? null,
      },
    );
    return res.status(201).json(payload);
  } catch (error) {
    return handleNutritionRouteError(res, error);
  }
});
