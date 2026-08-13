import { z } from 'zod';

export const checkinSchema = z.object({
  userId: z.string().min(1),
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  sleepQuality: z.number().int().min(1).max(5),
  calendarLoad: z.number().int().min(0).max(24),
  history: z.array(
    z.object({
      mood: z.number().int().min(1).max(5),
      energy: z.number().int().min(1).max(5),
      sleepQuality: z.number().int().min(1).max(5)
    })
  )
});

export const trackerAnalysisSchema = z.object({
  metricKey: z.string().min(2),
  metricTitle: z.string().min(2),
  tab: z.enum(['health', 'wellness']),
  unit: z.string().min(1),
  values: z.array(z.number()).min(5).max(90),
  baseline: z.number().optional(),
  compareValues: z.array(z.number()).optional(),
  context: z
    .object({
      dayLabel: z.string().optional(),
      stressLevel: z.number().optional(),
      sleepQuality: z.number().optional(),
      hydration: z.number().optional(),
      wellnessScore: z.number().optional()
    })
    .optional()
});

export const pssAssessmentSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      score: z.number().int().min(0).max(4)
    })
  ).min(4).max(10)
});

const PSS_10_QUESTION_BANK = [
  { id: 'pss_01', text: 'In the last week, how often have you felt upset because something happened unexpectedly?', reverseScored: false },
  { id: 'pss_02', text: 'In the last week, how often have you felt unable to control the important things in your life?', reverseScored: false },
  { id: 'pss_03', text: 'In the last week, how often have you felt nervous or stressed?', reverseScored: false },
  { id: 'pss_04', text: 'In the last week, how often have you felt confident about your ability to handle personal problems?', reverseScored: true },
  { id: 'pss_05', text: 'In the last week, how often have you felt that things were going your way?', reverseScored: true },
  { id: 'pss_06', text: 'In the last week, how often have you found that you could not cope with all the things you had to do?', reverseScored: false },
  { id: 'pss_07', text: 'In the last week, how often have you been able to control irritations in your life?', reverseScored: true },
  { id: 'pss_08', text: 'In the last week, how often have you felt that you were on top of things?', reverseScored: true },
  { id: 'pss_09', text: 'In the last week, how often have you been angered because of things that were outside of your control?', reverseScored: false },
  { id: 'pss_10', text: 'In the last week, how often have you felt difficulties were piling up so high that you could not overcome them?', reverseScored: false }
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mean = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const calcSlope = (values: number[]) => {
  if (values.length < 2) {
    return 0;
  }

  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }

  return den === 0 ? 0 : num / den;
};

export const getRandomizedPss10Questions = (count = 4) => {
  const normalizedCount = Math.max(4, Math.min(10, count));
  const shuffled = [...PSS_10_QUESTION_BANK]
    .map((question) => ({ question, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.question);
  return shuffled.slice(0, normalizedCount);
};

export const computePss10Assessment = (input: z.infer<typeof pssAssessmentSchema>) => {
  const lookup = new Map<string, (typeof PSS_10_QUESTION_BANK)[number]>(PSS_10_QUESTION_BANK.map((question) => [question.id, question] as const));
  const normalizedAnswers = input.answers.map((answer) => {
    const question = lookup.get(answer.questionId);
    if (!question) {
      throw new Error(`Unknown PSS question: ${answer.questionId}`);
    }
    const normalizedScore = question.reverseScored ? 4 - answer.score : answer.score;
    return { ...answer, reverseScored: question.reverseScored, normalizedScore };
  });
  const totalScore = normalizedAnswers.reduce((sum, answer) => sum + answer.normalizedScore, 0);
  const maxScore = normalizedAnswers.length * 4;
  const stressPercent = Math.round((totalScore / Math.max(1, maxScore)) * 100);
  const stressBand = totalScore >= 20 ? 'high' : totalScore >= 14 ? 'moderate' : 'low';
  const resilienceScore = Math.max(0, 100 - stressPercent);

  return {
    scale: 'PSS-10',
    totalScore,
    answeredQuestions: normalizedAnswers.length,
    stressPercent,
    resilienceScore,
    stressBand,
    reverseScoredQuestionIds: normalizedAnswers.filter((answer) => answer.reverseScored).map((answer) => answer.questionId),
    calculatedAtISO: new Date().toISOString()
  };
};

export const computeRisk = (input: z.infer<typeof checkinSchema>) => {
  const recent = input.history.slice(-14);
  const values = recent.length > 0 ? recent : [{ mood: input.mood, energy: input.energy, sleepQuality: input.sleepQuality }];

  const avgMood = values.reduce((sum, item) => sum + item.mood, 0) / values.length;
  const avgEnergy = values.reduce((sum, item) => sum + item.energy, 0) / values.length;
  const avgSleep = values.reduce((sum, item) => sum + item.sleepQuality, 0) / values.length;

  const stressRisk = Math.round(clamp((5 - avgMood) * 16 + (5 - avgSleep) * 10 + (5 - avgEnergy) * 10, 0, 100));
  const burnoutRisk = Math.round(clamp(stressRisk * 0.6 + (input.calendarLoad >= 6 ? 20 : 0), 0, 100));
  const energyDeficit = Math.round(clamp((5 - avgEnergy) * 20 + (5 - avgSleep) * 10, 0, 100));

  const burnoutFlag: 'none' | 'watch' | 'alert' = burnoutRisk >= 70 ? 'alert' : burnoutRisk >= 45 ? 'watch' : 'none';

  return { stressRisk, burnoutRisk, energyDeficit, burnoutFlag };
};

export const generateOnePriority = (input: z.infer<typeof checkinSchema>) => {
  const risk = computeRisk(input);

  let priority = 'Take a 2-minute breathing reset before your next meal or work block.';
  if (risk.energyDeficit >= 60) {
    priority = 'Take a 5-minute walk and a hydration reset before your next work block.';
  }

  const nudge = input.calendarLoad >= 3
    ? {
        type: 'break',
        timing: '15 minutes before your busiest meeting block',
        text: 'Two-minute recovery reset before your next heavy block.'
      }
    : {
        type: 'hydration',
        timing: 'mid-morning',
        text: 'Drink water and do a 2-minute reset.'
      };

  return {
    priority,
    nudge,
    risk
  };
};

export const generateTrackerAnalysis = (input: z.infer<typeof trackerAnalysisSchema>) => {
  const latest = input.values[input.values.length - 1] ?? 0;
  const previous = input.values[input.values.length - 2] ?? latest;
  const avg = mean(input.values);
  const min = Math.min(...input.values);
  const max = Math.max(...input.values);
  const slope = calcSlope(input.values);

  const delta = latest - previous;
  const avgDelta = latest - avg;
  const volatility = Math.abs(max - min);

  const compareAvg = input.compareValues?.length ? mean(input.compareValues) : undefined;
  const compareDelta = compareAvg !== undefined ? latest - compareAvg : undefined;

  const trend: 'improving' | 'stable' | 'declining' =
    slope > 0.22 ? 'improving' : slope < -0.22 ? 'declining' : 'stable';

  const confidence = clamp(
    0.55 + Math.min(0.2, Math.abs(slope) / 3) + (input.values.length >= 7 ? 0.1 : 0),
    0.5,
    0.92
  );

  const baseScore = clamp(((latest - min) / Math.max(1, max - min)) * 100, 0, 100);
  const stabilityPenalty = clamp(volatility * 0.35, 0, 20);
  const trendBonus = trend === 'improving' ? 8 : trend === 'declining' ? -10 : 0;
  const score = Math.round(clamp(baseScore - stabilityPenalty + trendBonus, 5, 98));

  const factors: Array<{ label: string; impact: number; direction: 'up' | 'down' }> = [
    {
      label: 'Recent momentum',
      impact: Math.round(clamp(Math.abs(slope) * 12, 2, 18)),
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
  ];

  const direction = delta >= 0 ? 'up' : 'down';
  const valueText = `${latest.toFixed(1)} ${input.unit}`;
  const compareText = compareDelta !== undefined
    ? `${compareDelta >= 0 ? '+' : ''}${compareDelta.toFixed(1)} ${input.unit} vs compare baseline`
    : `no compare baseline`;

  const suggestions = [
    `Current ${input.metricTitle} is ${valueText} (${direction} ${Math.abs(delta).toFixed(1)} ${input.unit} vs yesterday). Add one 2-minute intervention before your next work block.`,
    trend === 'declining'
      ? `Trend is declining across this ${input.metricTitle.toLowerCase()} window. Prioritize recovery tonight: hydration + earlier shutdown for better rebound.`
      : `Trend is ${trend}. Repeat today's strongest routine at the same time tomorrow to reinforce gains in ${input.metricTitle.toLowerCase()}.`,
    `Quick compare: ${compareText}. If tomorrow is lower again, open Sessions and run a focused reset immediately.`
  ];

  const summary =
    trend === 'improving'
      ? `${input.metricTitle} is trending upward with positive short-term momentum.`
      : trend === 'declining'
        ? `${input.metricTitle} is dropping and needs a small corrective action today.`
        : `${input.metricTitle} is stable. A small push can move it upward.`;

  return {
    metricKey: input.metricKey,
    metricTitle: input.metricTitle,
    trend,
    score,
    latest,
    average: Number(avg.toFixed(2)),
    range: { min, max },
    deltaFromPrevious: Number(delta.toFixed(2)),
    deltaFromAverage: Number(avgDelta.toFixed(2)),
    compareDelta: compareDelta !== undefined ? Number(compareDelta.toFixed(2)) : null,
    confidence: Number(confidence.toFixed(2)),
    factors,
    summary,
    suggestions,
    generatedAtISO: new Date().toISOString(),
    model: 'fiteatsy-intel-v2'
  };
};
