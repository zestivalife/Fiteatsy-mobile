import { Router } from 'express';
import { z } from 'zod';
import {
  checkinSchema,
  generateOnePriority,
  generateTrackerAnalysis,
  trackerAnalysisSchema
} from './intelligence.service.js';
import {
  generateActionPlan,
  generateCrossReferenceInsights,
  generateNuetraChat,
  generateNuetraSummary,
  generateParameterInsight,
  generateTrackerImprovement,
  generateTrackerMetricCoaching
} from './nuetra.service.js';

export const intelligenceRouter = Router();

const reportParameterSchema = z.object({
  name: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  status: z.enum(['low', 'high', 'normal', 'critical']),
  referenceRange: z.string().min(1),
  category: z.string().optional()
});

const summarySchema = z.object({
  userName: z.string().optional(),
  parameters: z.array(reportParameterSchema).min(1)
});

const parameterInsightSchema = z.object({
  paramName: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  status: z.string().min(1),
  referenceRange: z.string().min(1)
});

const actionPlanSchema = z.object({
  abnormalParameters: z.array(reportParameterSchema)
});

const crossInsightsSchema = z.object({
  abnormalParams: z.array(reportParameterSchema),
  checkInHistory: z.array(
    z.object({
      mood: z.number().min(1).max(5),
      energy: z.number().min(1).max(5),
      sleep: z.number().min(1).max(5)
    })
  )
});

const chatSchema = z.object({
  userMessage: z.string().min(1),
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1)
    })
  ),
  reportParameters: z.array(reportParameterSchema).min(1)
});

const trackerImprovementSchema = z.object({
  tab: z.enum(['health', 'wellness']),
  rangeMode: z.enum(['7D', '30D']),
  dayLabel: z.string().min(2),
  compareYesterday: z.boolean(),
  metrics: z.array(
    z.object({
      metricKey: z.string().min(2),
      metricTitle: z.string().min(2),
      unit: z.string().min(1),
      values: z.array(z.number()).min(5).max(90),
      compareValues: z.array(z.number()).optional()
    })
  ).min(1).max(8),
  context: z
    .object({
      steps: z.number().optional(),
      calories: z.number().optional(),
      distanceKm: z.number().optional(),
      stressLevel: z.number().optional(),
      sleepQuality: z.number().optional(),
      hydration: z.number().optional(),
      wellnessScore: z.number().optional()
    })
    .optional()
});

intelligenceRouter.post('/priority', (req, res) => {
  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const response = generateOnePriority(parsed.data);
  return res.json(response);
});

intelligenceRouter.post('/tracker-analysis', async (req, res) => {
  const parsed = trackerAnalysisSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const response = generateTrackerAnalysis(parsed.data);

  try {
    const ai = await generateTrackerMetricCoaching(parsed.data, {
      trend: response.trend,
      score: response.score,
      latest: response.latest,
      average: response.average,
      deltaFromPrevious: response.deltaFromPrevious,
      compareDelta: response.compareDelta
    });

    return res.json({
      ...response,
      summary: ai.summary,
      suggestions: ai.suggestions,
      model: ai.model
    });
  } catch (error) {
    console.error('tracker analysis ai error', error);
    return res.json(response);
  }
});

intelligenceRouter.post('/tracker-improvement', async (req, res) => {
  const parsed = trackerImprovementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const response = await generateTrackerImprovement(parsed.data);
    return res.json(response);
  } catch (error) {
    console.error('tracker improvement error', error);
    return res.status(500).json({ error: 'failed_to_generate_tracker_improvement' });
  }
});

intelligenceRouter.post('/reports/summary', async (req, res) => {
  const parsed = summarySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const summary = await generateNuetraSummary(parsed.data.parameters, parsed.data.userName);
    return res.json({ summary });
  } catch (error) {
    console.error('summary error', error);
    return res.status(500).json({ error: 'failed_to_generate_summary' });
  }
});

intelligenceRouter.post('/reports/parameter-insight', async (req, res) => {
  const parsed = parameterInsightSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const insight = await generateParameterInsight(
      parsed.data.paramName,
      parsed.data.value,
      parsed.data.unit,
      parsed.data.status,
      parsed.data.referenceRange
    );

    return res.json({ insight });
  } catch (error) {
    console.error('parameter insight error', error);
    return res.status(500).json({ error: 'failed_to_generate_parameter_insight' });
  }
});

intelligenceRouter.post('/reports/action-plan', async (req, res) => {
  const parsed = actionPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const actions = await generateActionPlan(parsed.data.abnormalParameters);
    return res.json({ actions });
  } catch (error) {
    console.error('action plan error', error);
    return res.status(500).json({ error: 'failed_to_generate_action_plan' });
  }
});

intelligenceRouter.post('/reports/cross-insights', async (req, res) => {
  const parsed = crossInsightsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const insights = await generateCrossReferenceInsights(parsed.data.abnormalParams, parsed.data.checkInHistory);
    return res.json({ insights });
  } catch (error) {
    console.error('cross insights error', error);
    return res.status(500).json({ error: 'failed_to_generate_cross_insights' });
  }
});

intelligenceRouter.post('/reports/chat', async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const response = await generateNuetraChat(
      parsed.data.userMessage,
      parsed.data.conversationHistory,
      parsed.data.reportParameters
    );

    return res.json({ response });
  } catch (error) {
    console.error('nuetra chat error', error);
    return res.status(500).json({ error: 'failed_to_generate_chat_response' });
  }
});
