import { type Response, Router } from 'express';
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
} from './nutrition.service.js';

const mealOptionSchema = z.object({
  slot: z.number().int().min(1),
  meal: z.string(),
  portion: z.string(),
  prepNote: z.string(),
  approxKcal: z.number().nullable(),
  proteinGrams: z.number().nullable(),
});

const mealSectionSchema = z.object({
  window: z.string(),
  focus: z.string(),
  options: z.array(mealOptionSchema),
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
      primaryMeal: section.options[0]?.meal ?? null,
      portion: section.options[0]?.portion ?? null,
      note: section.options[0]?.prepNote ?? null,
      kcal: section.options[0]?.approxKcal ?? null,
      proteinGrams: section.options[0]?.proteinGrams ?? null,
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

export const platformNutritionRouter = Router();
platformNutritionRouter.use(requireAuthenticatedAccount);

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
