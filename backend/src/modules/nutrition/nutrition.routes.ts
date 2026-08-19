import { type Response, Router } from 'express';
import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import type { NutritionPlanContent } from '../platform/platform.types.js';
import { canAccessConsultantClientApi } from '../consultants/consultants.service.js';
import {
  approveConsultantDietPlan,
  generateConsultantDietPlanDraft,
  getConsultantLatestDietPlan,
  getConsultantNutritionIntelligence,
  getPublishedDietPlanForClient,
  NutritionPlanWorkflowError,
  publishConsultantDietPlan,
  updateConsultantDietPlanDraft,
  exportConsultantDietPlanDocument,
  logNutritionMealConsumption,
} from './nutrition.service.js';
import { getFoodPreferenceProfile, updateFoodPreferenceProfile } from './food-preferences.service.js';

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
  const payload = await getConsultantNutritionIntelligence(req.params.clientId);
  if (!payload) {
    return res.status(404).json({
      error: 'CLIENT_NOT_FOUND',
      message: 'Nutrition intelligence is not available for this client.',
    });
  }
  return res.status(200).json(payload);
});

consultantNutritionRouter.get('/clients/:clientId/food-preferences', async (req, res) => {
  const payload = await getFoodPreferenceProfile(req.params.clientId);
  if (!payload) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'Client was not found.' });
  return res.status(200).json(payload);
});

consultantNutritionRouter.put('/clients/:clientId/food-preferences', async (req, res) => {
  const payload = await updateFoodPreferenceProfile(req.params.clientId, getAuthenticatedAccount(req).accountId, 'consultant', req.body ?? {});
  if (!payload) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: 'Client was not found.' });
  return res.status(200).json(payload);
});

consultantNutritionRouter.get('/clients/:clientId/diet-plans/latest', async (req, res) => {
  const payload = await getConsultantLatestDietPlan(req.params.clientId);
  if (!payload) {
    return res.status(404).json({
      error: 'DIET_PLAN_NOT_FOUND',
      message: 'No nutrition plan has been created for this client yet.',
    });
  }
  return res.status(200).json(payload);
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
  const account = getAuthenticatedAccount(req);
  let payload;
  try {
    payload = await publishConsultantDietPlan(req.params.clientId, account, req.params.dietPlanId);
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
