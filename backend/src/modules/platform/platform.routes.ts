import { Router } from 'express';
import { z } from 'zod';
import {
  assignConsultant,
  getHealthProfileBundle,
  listCareCaseEvents,
  listCareCaseTickets,
  listCareCaseTimeline,
  listUserNotifications,
  requestMissingInformation,
  upsertHealthProfile,
} from './platform.service.js';

const getUserId = (req: any) =>
  String(req.header('x-user-id') || req.body?.userId || req.query?.userId || 'demo-user').trim();

const healthProfilePatchSchema = z.object({
  dateOfBirthISO: z.string().datetime().optional(),
  gender: z.string().trim().min(1).optional(),
  heightCm: z.number().positive().optional(),
  currentWeightKg: z.number().positive().optional(),
  goalWeightKg: z.number().positive().optional(),
  waistCm: z.number().positive().optional(),
  hipCm: z.number().positive().optional(),
  neckCm: z.number().positive().optional(),
  bodyFatPct: z.number().positive().optional(),
  occupation: z.string().trim().optional(),
  workingHoursLabel: z.string().trim().optional(),
  shiftType: z.string().trim().optional(),
  activityLevel: z.string().trim().optional(),
  workMode: z.string().trim().optional(),
  travelFrequency: z.string().trim().optional(),
  dietType: z.string().trim().optional(),
  regionalCuisine: z.string().trim().optional(),
  foodsLiked: z.array(z.string().trim()).optional(),
  foodsDisliked: z.array(z.string().trim()).optional(),
  foodAllergies: z.array(z.string().trim()).optional(),
  foodIntolerances: z.array(z.string().trim()).optional(),
  currentSupplements: z.array(z.string().trim()).optional(),
  currentMedicines: z.array(z.string().trim()).optional(),
  wakeTime: z.string().trim().optional(),
  breakfastTime: z.string().trim().optional(),
  lunchTime: z.string().trim().optional(),
  dinnerTime: z.string().trim().optional(),
  sleepTime: z.string().trim().optional(),
  mealsPerDay: z.number().int().positive().optional(),
  waterIntakeLiters: z.number().positive().optional(),
  outsideFoodFrequency: z.string().trim().optional(),
  cookingAtHome: z.string().trim().optional(),
  whoCooks: z.string().trim().optional(),
  primaryConditions: z.array(z.string().trim()).optional(),
  wellnessGoals: z.array(z.string().trim()).optional(),
  assignedConsultantId: z.string().trim().optional(),
  assignedMentorId: z.string().trim().optional(),
});

const requestMissingSchema = z.object({
  requestedBy: z.string().trim().min(2),
  fields: z.array(z.string().trim().min(2)).min(1),
});

const assignConsultantSchema = z.object({
  consultantId: z.string().trim().min(2),
  mentorId: z.string().trim().optional(),
});

export const platformRouter = Router();

platformRouter.get('/health-profile', (req, res) => {
  const bundle = getHealthProfileBundle(getUserId(req));
  if (!bundle) {
    return res.status(404).json({ error: 'HEALTH_PROFILE_NOT_FOUND' });
  }
  return res.status(200).json(bundle);
});

platformRouter.patch('/health-profile', (req, res) => {
  const parsed = healthProfilePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }
  const bundle = upsertHealthProfile(getUserId(req), parsed.data);
  return res.status(200).json(bundle);
});

platformRouter.get('/health-profile/completion', (req, res) => {
  const bundle = getHealthProfileBundle(getUserId(req));
  if (!bundle) {
    return res.status(404).json({ error: 'HEALTH_PROFILE_NOT_FOUND' });
  }
  return res.status(200).json({
    completionPercent: bundle.nutrition.completionPercent,
    readinessScore: bundle.nutrition.readinessScore,
    aiReady: bundle.nutrition.aiReady,
    missingFields: bundle.nutrition.missingFields,
    sectionScores: bundle.nutrition.sectionScores,
  });
});

platformRouter.post('/health-profile/request-missing-information', (req, res) => {
  const parsed = requestMissingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }
  try {
    const result = requestMissingInformation(getUserId(req), parsed.data.fields, parsed.data.requestedBy);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(404).json({ error: 'HEALTH_PROFILE_NOT_FOUND', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

platformRouter.get('/care-cases/current', (req, res) => {
  const bundle = getHealthProfileBundle(getUserId(req));
  if (!bundle) {
    return res.status(404).json({ error: 'CARE_CASE_NOT_FOUND' });
  }
  return res.status(200).json(bundle.careCase);
});

platformRouter.post('/care-cases/:careCaseId/assign-consultant', (req, res) => {
  const parsed = assignConsultantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }
  try {
    const updated = assignConsultant(req.params.careCaseId, parsed.data.consultantId, parsed.data.mentorId);
    return res.status(200).json(updated);
  } catch (error) {
    return res.status(404).json({ error: 'CARE_CASE_NOT_FOUND', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

platformRouter.get('/care-cases/:careCaseId/timeline', (req, res) => {
  return res.status(200).json({ items: listCareCaseTimeline(req.params.careCaseId) });
});

platformRouter.get('/care-cases/:careCaseId/events', (req, res) => {
  return res.status(200).json({ items: listCareCaseEvents(req.params.careCaseId) });
});

platformRouter.get('/care-cases/:careCaseId/tickets', (req, res) => {
  return res.status(200).json({ items: listCareCaseTickets(req.params.careCaseId) });
});

platformRouter.get('/notifications', (req, res) => {
  return res.status(200).json({ items: listUserNotifications(getUserId(req)) });
});
