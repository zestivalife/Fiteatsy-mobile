import OpenAI from 'openai';
import { env } from '../../config/env.js';

export type ReportParameter = {
  name: string;
  value: number;
  unit: string;
  status: 'low' | 'high' | 'normal' | 'critical';
  referenceRange: string;
  category?: string;
};

export type NuetraActionItem = {
  priority: number;
  title: string;
  detail: string;
  requiresDoctor: boolean;
};

export type NuetraCrossInsight = {
  connection: string;
  labParam: string;
  checkInPattern: string;
};

export type NuetraChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

const client = env.openAiApiKey
  ? new OpenAI({ apiKey: env.openAiApiKey })
  : null;

const toAbnormal = (parameters: ReportParameter[]) => parameters.filter((p) => p.status !== 'normal');

const compact = (text: string) => text.replace(/\s+/g, ' ').trim();

const hasAtLeastTwoNamedValues = (text: string, parameters: ReportParameter[]) => {
  const lower = text.toLowerCase();
  const namedHits = parameters.filter((p) => lower.includes(p.name.toLowerCase())).length;
  const numberHits = (text.match(/\b\d+(?:\.\d+)?\b/g) || []).length;
  return namedHits >= 2 && numberHits >= 2;
};

const isVague = (text: string) => {
  const lower = text.toLowerCase();
  const vagueWords = ['stable', 'generally', 'overall', 'targeted areas', 'improve'];
  return vagueWords.some((word) => lower.includes(word));
};

const fallbackSummary = (parameters: ReportParameter[], userName?: string) => {
  const abnormal = toAbnormal(parameters);
  const first = abnormal[0];
  const second = abnormal[1] ?? abnormal[0];

  if (!first) {
    return `${userName ?? 'You'} have ${parameters.length} markers in normal range today, and that is a strong baseline. Keep your sleep and hydration rhythm steady this week. Continue the same routine and recheck on your next report to maintain momentum.`;
  }

  return `${userName ?? 'You'} have a strong baseline in many markers, which is a great sign. ${first.name} is ${first.value} ${first.unit} (${first.referenceRange}), and ${second.name} is ${second.value} ${second.unit}, so these need attention this week. Your normal markers are helping your resilience, so this is very workable. Take one focused action now: schedule nutrition, sunlight, and movement follow-through for the next 7 days and review with your clinician if values stay off-range.`;
};

const fallbackParameterInsight = (paramName: string, value: number, unit: string, status: string, referenceRange: string) => {
  return `${paramName} at ${value} ${unit} (${referenceRange}) is ${status}; tightening your daily routine this week can shift this in the right direction.`;
};

const safeJsonParse = <T>(input: string, fallback: T): T => {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
};

const callModel = async (messages: Array<{ role: 'system' | 'user'; content: string }>, maxTokens: number) => {
  if (!client) {
    return null;
  }

  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: maxTokens,
    messages
  });

  return completion.choices[0]?.message?.content?.trim() ?? null;
};

export const generateNuetraSummary = async (parameters: ReportParameter[], userName?: string) => {
  const abnormalParams = toAbnormal(parameters);
  const normalCount = parameters.filter((p) => p.status === 'normal').length;

  const systemPrompt = `You are Nuetra, a warm and intelligent AI health assistant for Indian working professionals.
Write health summaries in plain, friendly language, like a knowledgeable friend, never clinical.
Never be preachy.
Always mention 1 positive thing, 1 concern, and 1 specific action.
CRITICAL: Always mention at least 2 specific parameter names and their actual values in your response. Generic summaries are not acceptable.
Max 4 sentences.`;

  const userPrompt = `Write a health summary for ${userName || 'this user'}.
Normal parameters: ${normalCount} out of ${parameters.length}
Parameters needing attention: ${JSON.stringify(
    abnormalParams.map((p) => ({
      name: p.name,
      value: p.value,
      unit: p.unit,
      status: p.status,
      referenceRange: p.referenceRange
    }))
  )}
Write exactly 3-4 warm sentences. Be specific about abnormal values. End with one clear action for this week.`;

  let response = await callModel(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    320
  );

  if (!response) {
    return fallbackSummary(parameters, userName);
  }

  response = compact(response);

  if (isVague(response) || !hasAtLeastTwoNamedValues(response, parameters)) {
    const retry = await callModel(
      [
        { role: 'system', content: `${systemPrompt}\nIf your answer is generic, rewrite it with exact parameter names and numeric values.` },
        {
          role: 'user',
          content: `${userPrompt}\nRegenerate now and include at least 2 explicit parameter values with units.`
        }
      ],
      320
    );

    if (retry) {
      const refined = compact(retry);
      if (!isVague(refined) && hasAtLeastTwoNamedValues(refined, parameters)) {
        return refined;
      }
    }

    return fallbackSummary(parameters, userName);
  }

  return response;
};

export const generateParameterInsight = async (
  paramName: string,
  value: number,
  unit: string,
  status: string,
  referenceRange: string
) => {
  const content = await callModel(
    [
      {
        role: 'system',
        content:
          'You are Nuetra. Write one warm, plain-language sentence explaining what an abnormal lab value means for a working professional. Max 20 words, no jargon.'
      },
      {
        role: 'user',
        content: `Parameter: ${paramName}, Value: ${value} ${unit}, Status: ${status}, Normal range: ${referenceRange}. Write one sentence.`
      }
    ],
    90
  );

  return content ? compact(content) : fallbackParameterInsight(paramName, value, unit, status, referenceRange);
};

export const generateActionPlan = async (abnormalParameters: ReportParameter[]) => {
  if (abnormalParameters.length === 0) {
    return [
      {
        priority: 1,
        title: 'Maintain your current routine',
        detail: 'Your key markers are in range. Keep sleep, hydration, and movement consistent this week.',
        requiresDoctor: false
      }
    ] as NuetraActionItem[];
  }

  const content = await callModel(
    [
      {
        role: 'system',
        content: `You are Nuetra. Generate a prioritized action plan based on abnormal lab values.
Return ONLY valid JSON array.
Format: [{"priority": 1, "title": "action title", "detail": "specific detail with values mentioned", "requiresDoctor": true/false}]
Max 3 actions. Mention actual values. Warm tone.`
      },
      {
        role: 'user',
        content: `Abnormal parameters: ${JSON.stringify(abnormalParameters)}. Generate 3 prioritized actions.`
      }
    ],
    420
  );

  const fallback: NuetraActionItem[] = abnormalParameters.slice(0, 3).map((param, index) => ({
    priority: index + 1,
    title: `Improve ${param.name}`,
    detail: `${param.name} is ${param.value} ${param.unit} (${param.referenceRange}). Focus on one corrective routine this week and recheck with your clinician if needed.`,
    requiresDoctor: param.status === 'critical'
  }));

  return content ? safeJsonParse<NuetraActionItem[]>(content, fallback) : fallback;
};

export const generateCrossReferenceInsights = async (
  abnormalParams: ReportParameter[],
  checkInHistory: Array<{ mood: number; energy: number; sleep: number }>
) => {
  if (abnormalParams.length === 0 || checkInHistory.length === 0) {
    return [] as NuetraCrossInsight[];
  }

  const avgEnergy = checkInHistory.reduce((sum, c) => sum + c.energy, 0) / checkInHistory.length;
  const avgMood = checkInHistory.reduce((sum, c) => sum + c.mood, 0) / checkInHistory.length;
  const avgSleep = checkInHistory.reduce((sum, c) => sum + c.sleep, 0) / checkInHistory.length;

  const content = await callModel(
    [
      {
        role: 'system',
        content: `You are Nuetra. Connect lab results with daily wellness patterns.
Return ONLY valid JSON array.
Format: [{"connection": "one warm sentence connecting a lab value to a daily pattern", "labParam": "name", "checkInPattern": "description"}]
Max 2 connections. Use actual values. Max 25 words per connection.`
      },
      {
        role: 'user',
        content: `Abnormal lab values: ${JSON.stringify(abnormalParams)}
30-day averages — Energy: ${avgEnergy.toFixed(1)}/5, Mood: ${avgMood.toFixed(1)}/5, Sleep: ${avgSleep.toFixed(1)}/5
Find meaningful connections.`
      }
    ],
    320
  );

  const fallback: NuetraCrossInsight[] = abnormalParams.slice(0, 2).map((param) => ({
    connection: `${param.name} at ${param.value} ${param.unit} may be amplifying your lower daily energy pattern this month.`,
    labParam: param.name,
    checkInPattern: `Energy ${avgEnergy.toFixed(1)}/5, mood ${avgMood.toFixed(1)}/5, sleep ${avgSleep.toFixed(1)}/5`
  }));

  return content ? safeJsonParse<NuetraCrossInsight[]>(content, fallback) : fallback;
};

export const generateNuetraChat = async (
  userMessage: string,
  conversationHistory: NuetraChatMessage[],
  reportParameters: ReportParameter[]
) => {
  const normalizedHistory = conversationHistory.slice(-10).map((m) => ({
    role: m.role,
    content: m.content
  }));

  const parameterContext = reportParameters.map((p) => `${p.name}: ${p.value} ${p.unit} (${p.referenceRange}) [${p.status}]`).join('; ');

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        'You are Nuetra, a compassionate health copilot. Be warm, specific, and plain-language. Mention exact parameter names/values when relevant. Do not diagnose. Give one practical next step.'
    },
    {
      role: 'user',
      content: `Report parameters: ${parameterContext}`
    },
    ...normalizedHistory,
    {
      role: 'user',
      content: userMessage
    }
  ];

  if (!client) {
    const abnormal = toAbnormal(reportParameters);
    const first = abnormal[0];
    if (!first) {
      return 'Great question. Your current report markers look balanced overall. Keep your hydration, sleep rhythm, and movement consistent this week.';
    }
    return `Great question. ${first.name} is ${first.value} ${first.unit}, so start with one focused habit this week and track how your energy responds.`;
  }

  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 360,
    messages
  });

  return compact(completion.choices[0]?.message?.content ?? 'I am here. Ask me about any value and I will break it down simply.');
};

export type TrackerImprovementMetric = {
  metricKey: string;
  metricTitle: string;
  unit: string;
  values: number[];
  compareValues?: number[];
};

export type TrackerImprovementInput = {
  tab: 'health' | 'wellness';
  rangeMode: '7D' | '30D';
  dayLabel: string;
  compareYesterday: boolean;
  metrics: TrackerImprovementMetric[];
  context?: {
    steps?: number;
    calories?: number;
    distanceKm?: number;
    stressLevel?: number;
    sleepQuality?: number;
    hydration?: number;
    wellnessScore?: number;
  };
};

export type TrackerImprovementResult = {
  summary: string;
  suggestions: string[];
  generatedAtISO: string;
  model: string;
};

const metricAverage = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const trackerFallback = (input: TrackerImprovementInput): TrackerImprovementResult => {
  const snapshots = input.metrics.map((metric) => {
    const latest = metric.values[metric.values.length - 1] ?? 0;
    const previous = metric.values[metric.values.length - 2] ?? latest;
    const avg = metricAverage(metric.values);
    const delta = latest - previous;
    return {
      metricTitle: metric.metricTitle,
      latest,
      unit: metric.unit,
      avg,
      delta
    };
  });

  const first = snapshots[0];
  const second = snapshots[1] ?? first;

  return {
    summary: `${first.metricTitle} is ${first.latest.toFixed(1)} ${first.unit} today (${first.delta >= 0 ? 'up' : 'down'} vs prior), while ${second.metricTitle} is ${second.latest.toFixed(1)} ${second.unit}. Keep one focused micro-action to improve tomorrow's trend.`,
    suggestions: [
      `Repeat one 2-minute action before your next work block to improve ${first.metricTitle.toLowerCase()}.`,
      input.tab === 'health'
        ? 'Prioritize hydration and sleep timing tonight to improve next-day physical markers.'
        : 'Protect one deep-work block and one recovery break to stabilize wellness markers.',
      input.compareYesterday
        ? 'If tomorrow is lower again, switch to a recovery-first day and reduce cognitive load.'
        : 'Enable day-over-day compare to verify if this action improves tomorrow scores.'
    ],
    generatedAtISO: new Date().toISOString(),
    model: 'nuetra-fallback-v1'
  };
};

export const generateTrackerImprovement = async (
  input: TrackerImprovementInput
): Promise<TrackerImprovementResult> => {
  if (!input.metrics.length) {
    return {
      summary: 'No tracker values were available yet. Sync your wearable and complete one session to unlock specific guidance.',
      suggestions: ['Sync your wearable once.', 'Complete one short session.', 'Re-open tracker for personalized guidance.'],
      generatedAtISO: new Date().toISOString(),
      model: 'nuetra-fallback-v1'
    };
  }

  const metricsContext = input.metrics.map((metric) => {
    const latest = metric.values[metric.values.length - 1] ?? 0;
    const previous = metric.values[metric.values.length - 2] ?? latest;
    const average = metricAverage(metric.values);
    const compareAverage = metric.compareValues?.length ? metricAverage(metric.compareValues) : null;
    return {
      metricTitle: metric.metricTitle,
      latest,
      previous,
      average: Number(average.toFixed(2)),
      deltaFromPrevious: Number((latest - previous).toFixed(2)),
      compareAverage: compareAverage !== null ? Number(compareAverage.toFixed(2)) : null,
      deltaFromCompare: compareAverage !== null ? Number((latest - compareAverage).toFixed(2)) : null,
      unit: metric.unit
    };
  });

  const content = await callModel(
    [
      {
        role: 'system',
        content: `You are Nuetra, an elite behavior-change copilot for employee wellness.
Return ONLY valid JSON object with shape: {"summary":"string","suggestions":["string","string","string"]}.
CRITICAL: Summary must mention at least 2 metric names with actual values and units.
Suggestions must be specific to current numbers, short, and action-oriented (2-minute or one-block actions).
Never use generic wording like "overall stable".`
      },
      {
        role: 'user',
        content: `Generate personalized tracker guidance.
Tab: ${input.tab}
Range mode: ${input.rangeMode}
Day: ${input.dayLabel}
Compare yesterday: ${input.compareYesterday}
Context: ${JSON.stringify(input.context ?? {})}
Metrics: ${JSON.stringify(metricsContext)}
Return exactly 1 summary and 3 suggestions.`
      }
    ],
    360
  );

  if (!content) {
    return trackerFallback(input);
  }

  const parsed = safeJsonParse<{ summary?: string; suggestions?: string[] }>(content, {});
  const summary = compact(parsed.summary ?? '');
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map((item) => compact(String(item))).filter(Boolean).slice(0, 3)
    : [];

  const hasNumericSignal = /\d/.test(summary);
  const includesTwoMetrics = metricsContext.filter((metric) => summary.toLowerCase().includes(metric.metricTitle.toLowerCase())).length >= 2;

  if (!summary || suggestions.length < 2 || !hasNumericSignal || !includesTwoMetrics) {
    return trackerFallback(input);
  }

  return {
    summary,
    suggestions,
    generatedAtISO: new Date().toISOString(),
    model: DEFAULT_MODEL
  };
};

export type TrackerMetricCoachingInput = {
  metricKey: string;
  metricTitle: string;
  tab: 'health' | 'wellness';
  unit: string;
  values: number[];
  compareValues?: number[];
  context?: {
    dayLabel?: string;
    stressLevel?: number;
    sleepQuality?: number;
    hydration?: number;
    wellnessScore?: number;
  };
};

export type TrackerMetricCoachingBase = {
  trend: 'improving' | 'stable' | 'declining';
  score: number;
  latest: number;
  average: number;
  deltaFromPrevious: number;
  compareDelta: number | null;
};

export type TrackerMetricCoachingResult = {
  summary: string;
  suggestions: string[];
  model: string;
};

const trackerMetricFallback = (
  input: TrackerMetricCoachingInput,
  base: TrackerMetricCoachingBase
): TrackerMetricCoachingResult => {
  const compareText =
    base.compareDelta !== null
      ? `${base.compareDelta >= 0 ? '+' : ''}${base.compareDelta.toFixed(1)} ${input.unit} vs compare baseline`
      : 'no compare baseline available yet';

  return {
    summary: `${input.metricTitle} is ${base.latest.toFixed(1)} ${input.unit} with a ${base.trend} trend and Nuetra score ${base.score}.`,
    suggestions: [
      `Current ${input.metricTitle} moved ${base.deltaFromPrevious >= 0 ? 'up' : 'down'} ${Math.abs(base.deltaFromPrevious).toFixed(1)} ${input.unit} vs yesterday. Run one 2-minute reset before the next work block.`,
      input.tab === 'health'
        ? `For next-day improvement, prioritize hydration, sleep timing, and lighter late-evening load. ${compareText}.`
        : `For next-day improvement, protect one focused work sprint and one decompression break. ${compareText}.`,
      `If ${input.metricTitle.toLowerCase()} declines again tomorrow, switch to a recovery-first day and open Sessions immediately.`
    ],
    model: 'nuetra-fallback-v1'
  };
};

export const generateTrackerMetricCoaching = async (
  input: TrackerMetricCoachingInput,
  base: TrackerMetricCoachingBase
): Promise<TrackerMetricCoachingResult> => {
  const content = await callModel(
    [
      {
        role: 'system',
        content: `You are Nuetra, a premium behavior-change wellness copilot.
Return ONLY valid JSON object: {"summary":"string","suggestions":["string","string","string"]}.
CRITICAL:
- Summary must include this metric name and numeric value with unit.
- Suggestions must be specific to the numbers provided, not generic.
- Mention trend direction and day-over-day movement.
- Keep suggestions short, practical, and action-oriented.`
      },
      {
        role: 'user',
        content: `Create coaching for one tracker metric.
Metric: ${input.metricTitle}
Tab: ${input.tab}
Unit: ${input.unit}
Latest value: ${base.latest}
Average value: ${base.average}
Trend: ${base.trend}
Delta from previous day: ${base.deltaFromPrevious}
Delta vs compare baseline: ${base.compareDelta}
Nuetra score: ${base.score}
Context: ${JSON.stringify(input.context ?? {})}
Series: ${JSON.stringify(input.values)}
Compare series: ${JSON.stringify(input.compareValues ?? [])}`
      }
    ],
    260
  );

  if (!content) {
    return trackerMetricFallback(input, base);
  }

  const parsed = safeJsonParse<{ summary?: string; suggestions?: string[] }>(content, {});
  const summary = compact(parsed.summary ?? '');
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map((item) => compact(String(item))).filter(Boolean).slice(0, 3)
    : [];

  const summaryHasMetric = summary.toLowerCase().includes(input.metricTitle.toLowerCase());
  const summaryHasValue = /\d/.test(summary);

  if (!summary || suggestions.length < 2 || !summaryHasMetric || !summaryHasValue) {
    return trackerMetricFallback(input, base);
  }

  return {
    summary,
    suggestions,
    model: DEFAULT_MODEL
  };
};
