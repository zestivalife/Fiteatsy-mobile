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
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';
import {
  HealthScoreType,
  listHealthScoreHistory,
  listLatestHealthScores
} from './health-scores.repository.js';
import { calculateHealthScores } from './health-calculation-engine.js';

export const intelligenceRouter = Router();

const currentOwner = (account: ReturnType<typeof getAuthenticatedAccount>): ClientOwnershipContext => ({
  accountId: account.accountId,
  clientId: account.client.id
});

const toScoreDto = (score: Awaited<ReturnType<typeof listLatestHealthScores>>[number], fiteatsyClientId: string) => ({
  id: score.id,
  fiteatsyClientId,
  scoreType: score.scoreType,
  scoreValue: score.scoreValue,
  scoreStatus: score.scoreStatus,
  confidence: score.confidence,
  inputSummary: score.inputSummary,
  calculatedAtISO: score.calculatedAtISO,
  calculationVersion: score.calculationVersion
});

const getScoreValue = (scores: Awaited<ReturnType<typeof listLatestHealthScores>>, scoreType: HealthScoreType) =>
  scores.find((score) => score.scoreType === scoreType)?.scoreValue ?? null;

const getAggregateConfidence = (scores: Awaited<ReturnType<typeof listLatestHealthScores>>) => {
  const calculated = scores.filter((score) => score.scoreStatus === 'calculated');
  if (calculated.length === 0) return 0;
  return Number((calculated.reduce((sum, score) => sum + score.confidence, 0) / calculated.length).toFixed(4));
};

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

intelligenceRouter.get('/scores', requireAuthenticatedAccount, async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const owner = currentOwner(account);
  let scores = await listLatestHealthScores(owner);
  if (scores.length === 0) {
    scores = await calculateHealthScores(owner);
  }
  return res.status(200).json({
    total: scores.length,
    items: scores.map((score) => toScoreDto(score, account.client.fiteatsyClientId))
  });
});

intelligenceRouter.get('/scores/history', requireAuthenticatedAccount, async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const owner = currentOwner(account);
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const scoreType =
    typeof req.query.scoreType === 'string' &&
    ['nutrition', 'clinical', 'activity', 'sleep', 'calm', 'recovery', 'overall'].includes(req.query.scoreType)
      ? (req.query.scoreType as HealthScoreType)
      : undefined;
  const items = await listHealthScoreHistory(owner, { scoreType, limit, offset });
  return res.status(200).json({
    total: items.length,
    limit,
    offset,
    items: items.map((score) => toScoreDto(score, account.client.fiteatsyClientId))
  });
});

intelligenceRouter.get('/summary', requireAuthenticatedAccount, async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const owner = currentOwner(account);
  let scores = await listLatestHealthScores(owner);
  if (scores.length === 0) {
    scores = await calculateHealthScores(owner);
  }
  return res.status(200).json({
    recoveryScore: getScoreValue(scores, 'recovery'),
    nutritionScore: getScoreValue(scores, 'nutrition'),
    clinicalScore: getScoreValue(scores, 'clinical'),
    activityScore: getScoreValue(scores, 'activity'),
    sleepScore: getScoreValue(scores, 'sleep'),
    calmScore: getScoreValue(scores, 'calm'),
    overallScore: getScoreValue(scores, 'overall'),
    confidence: getAggregateConfidence(scores),
    status: scores.some((score) => score.scoreStatus === 'calculated') ? 'calculated' : 'insufficient_data',
    calculatedAtISO: scores[0]?.calculatedAtISO ?? null
  });
});

intelligenceRouter.post('/priority', requireAuthenticatedAccount, (req, res) => {
  getAuthenticatedAccount(req);
  const parsed = checkinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const response = generateOnePriority(parsed.data);
  return res.json(response);
});

intelligenceRouter.post('/tracker-analysis', requireAuthenticatedAccount, async (req, res) => {
  getAuthenticatedAccount(req);
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

intelligenceRouter.post('/tracker-improvement', requireAuthenticatedAccount, async (req, res) => {
  getAuthenticatedAccount(req);
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

intelligenceRouter.post('/reports/summary', requireAuthenticatedAccount, async (req, res) => {
  getAuthenticatedAccount(req);
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

intelligenceRouter.post('/reports/parameter-insight', requireAuthenticatedAccount, async (req, res) => {
  getAuthenticatedAccount(req);
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

intelligenceRouter.post('/reports/action-plan', requireAuthenticatedAccount, async (req, res) => {
  getAuthenticatedAccount(req);
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

intelligenceRouter.post('/reports/cross-insights', requireAuthenticatedAccount, async (req, res) => {
  getAuthenticatedAccount(req);
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

intelligenceRouter.post('/reports/chat', requireAuthenticatedAccount, async (req, res) => {
  getAuthenticatedAccount(req);
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
