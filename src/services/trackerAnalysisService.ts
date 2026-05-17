export type TrackerTab = 'health' | 'wellness';

export type TrackerAnalysisInput = {
  metricKey: string;
  metricTitle: string;
  tab: TrackerTab;
  unit: string;
  values: number[];
  baseline?: number;
  compareValues?: number[];
  context?: {
    dayLabel?: string;
    stressLevel?: number;
    sleepQuality?: number;
    hydration?: number;
    wellnessScore?: number;
  };
};

export type TrackerAnalysisResult = {
  metricKey: string;
  metricTitle: string;
  trend: 'improving' | 'stable' | 'declining';
  score: number;
  latest: number;
  average: number;
  range: { min: number; max: number };
  deltaFromPrevious: number;
  deltaFromAverage: number;
  compareDelta: number | null;
  confidence: number;
  factors: Array<{ label: string; impact: number; direction: 'up' | 'down' }>;
  summary: string;
  suggestions: string[];
  generatedAtISO: string;
  model: string;
};

export type TrackerSectionMetricInput = {
  metricKey: string;
  metricTitle: string;
  unit: string;
  values: number[];
  compareValues?: number[];
};

export type TrackerSectionImprovementInput = {
  tab: TrackerTab;
  rangeMode: '7D' | '30D';
  dayLabel: string;
  compareYesterday: boolean;
  metrics: TrackerSectionMetricInput[];
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

export type TrackerSectionImprovementResult = {
  summary: string;
  suggestions: string[];
  generatedAtISO: string;
  model: string;
};

const apiBaseUrl = 'http://localhost:4001';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mean = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const slope = (values: number[]) => {
  if (values.length < 2) {
    return 0;
  }

  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i += 1) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) * (i - xMean);
  }

  return denominator === 0 ? 0 : numerator / denominator;
};

const buildFallbackAnalysis = (input: TrackerAnalysisInput): TrackerAnalysisResult => {
  const latest = input.values[input.values.length - 1] ?? 0;
  const previous = input.values[input.values.length - 2] ?? latest;
  const avg = mean(input.values);
  const min = Math.min(...input.values);
  const max = Math.max(...input.values);
  const m = slope(input.values);
  const trend: TrackerAnalysisResult['trend'] = m > 0.22 ? 'improving' : m < -0.22 ? 'declining' : 'stable';

  const compareAvg = input.compareValues && input.compareValues.length > 0 ? mean(input.compareValues) : undefined;
  const compareDelta = compareAvg !== undefined ? latest - compareAvg : null;

  const delta = latest - previous;
  const volatility = Math.abs(max - min);
  const baseScore = clamp(((latest - min) / Math.max(1, max - min)) * 100, 0, 100);
  const stabilityPenalty = clamp(volatility * 0.35, 0, 20);
  const trendBonus = trend === 'improving' ? 8 : trend === 'declining' ? -10 : 0;

  return {
    metricKey: input.metricKey,
    metricTitle: input.metricTitle,
    trend,
    score: Math.round(clamp(baseScore - stabilityPenalty + trendBonus, 5, 98)),
    latest,
    average: Number(avg.toFixed(2)),
    range: { min, max },
    deltaFromPrevious: Number(delta.toFixed(2)),
    deltaFromAverage: Number((latest - avg).toFixed(2)),
    compareDelta: compareDelta !== null ? Number(compareDelta.toFixed(2)) : null,
    confidence: Number(clamp(0.62 + Math.min(0.2, Math.abs(m) / 3), 0.55, 0.9).toFixed(2)),
    factors: [
      {
        label: 'Recent momentum',
        impact: Math.round(clamp(Math.abs(m) * 12, 2, 18)),
        direction: trend === 'declining' ? 'down' : 'up'
      },
      {
        label: 'Day-over-day change',
        impact: Math.round(clamp(Math.abs(delta) * 0.8, 1, 16)),
        direction: delta >= 0 ? 'up' : 'down'
      },
      {
        label: 'Consistency band',
        impact: Math.round(clamp(volatility * 0.5, 2, 22)),
        direction: volatility <= avg * 0.3 ? 'up' : 'down'
      }
    ],
    summary:
      trend === 'improving'
        ? `${input.metricTitle} is trending up with a healthy momentum.`
        : trend === 'declining'
          ? `${input.metricTitle} is dropping. A short intervention can recover it.`
          : `${input.metricTitle} is stable. One small push can improve it today.`,
    suggestions: [
      `Current ${input.metricTitle} is ${latest.toFixed(1)} ${input.unit} (${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)} ${input.unit} vs yesterday). Use one 2-minute intervention before your next work block.`,
      trend === 'declining'
        ? `${input.metricTitle} trend is declining. Prioritize a recovery-first routine tonight: hydration, lighter load, and earlier shutdown.`
        : `${input.metricTitle} trend is ${trend}. Repeat today's strongest habit at the same time tomorrow to lock consistency.`,
      compareDelta !== null
        ? `Compare baseline delta is ${compareDelta >= 0 ? '+' : ''}${compareDelta.toFixed(1)} ${input.unit}. If this drops tomorrow, run a quick reset from Sessions.`
        : 'Enable compare data to unlock stronger day-over-day coaching.'
    ],
    generatedAtISO: new Date().toISOString(),
    model: 'nuetra-fallback-v1'
  };
};

const buildFallbackSectionImprovement = (input: TrackerSectionImprovementInput): TrackerSectionImprovementResult => {
  const metricSnapshots = input.metrics.map((metric) => {
    const latest = metric.values[metric.values.length - 1] ?? 0;
    const previous = metric.values[metric.values.length - 2] ?? latest;
    const delta = latest - previous;
    return {
      metricTitle: metric.metricTitle,
      latest,
      unit: metric.unit,
      delta,
      trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
    };
  });

  const first = metricSnapshots[0];
  const second = metricSnapshots[1] ?? first;

  const summary = `${first.metricTitle} is at ${first.latest.toFixed(1)} ${first.unit} (${first.trend}), while ${second.metricTitle} is ${second.latest.toFixed(1)} ${second.unit}. Focus one small behavior today to lift tomorrow's score.`;

  return {
    summary,
    suggestions: [
      `Start with one 2-minute action before your next work block to improve ${first.metricTitle.toLowerCase()}.`,
      input.tab === 'health'
        ? 'Protect sleep and hydration timing tonight to improve tomorrow morning markers.'
        : 'Lock one deep-focus slot and one decompression break to stabilize wellness trends.',
      input.compareYesterday
        ? 'If this trend stays lower than yesterday tomorrow, switch to a recovery-first routine for one day.'
        : 'Enable Compare Yesterday to track whether your small action produced a measurable change.'
    ],
    generatedAtISO: new Date().toISOString(),
    model: 'nuetra-fallback-v1'
  };
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const getTrackerAnalysis = async (input: TrackerAnalysisInput): Promise<TrackerAnalysisResult> => {
  try {
    const response = await withTimeout(
      fetch(`${apiBaseUrl}/v1/intelligence/tracker-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      }),
      3200
    );

    if (!response.ok) {
      throw new Error(`tracker analysis failed: ${response.status}`);
    }

    return (await response.json()) as TrackerAnalysisResult;
  } catch {
    return buildFallbackAnalysis(input);
  }
};

export const getTrackerImprovementInsights = async (
  input: TrackerSectionImprovementInput
): Promise<TrackerSectionImprovementResult> => {
  try {
    const response = await withTimeout(
      fetch(`${apiBaseUrl}/v1/intelligence/tracker-improvement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      }),
      3800
    );

    if (!response.ok) {
      throw new Error(`tracker improvement failed: ${response.status}`);
    }

    const data = (await response.json()) as TrackerSectionImprovementResult;
    if (!data.summary || !Array.isArray(data.suggestions) || data.suggestions.length === 0) {
      return buildFallbackSectionImprovement(input);
    }

    return data;
  } catch {
    return buildFallbackSectionImprovement(input);
  }
};
