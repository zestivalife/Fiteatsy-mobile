import { DailyCheckIn, DecisionLog, Nudge, OnboardingProfile, PriorityPlan, RiskSnapshot } from '../types';
import { todayKey } from '../utils/date';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mean = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
};

export const calculateRiskSnapshot = (checkins: DailyCheckIn[]): RiskSnapshot => {
  const recent14 = checkins.slice(-14);
  const recent7 = recent14.slice(-7);
  const recent3 = recent14.slice(-3);

  const moodAvg = mean(recent7.map((item) => item.mood));
  const energyAvg = mean(recent7.map((item) => item.energy));
  const sleepAvg = mean(recent7.map((item) => item.sleepQuality));

  const lowEnergyDays = recent3.filter((item) => item.energy <= 2).length;
  const previousEnergyAvg = mean(recent14.slice(0, Math.max(0, recent14.length - 3)).map((item) => item.energy));
  const currentEnergyAvg = mean(recent3.map((item) => item.energy));
  const suddenDrop = previousEnergyAvg > 0 && currentEnergyAvg > 0 && previousEnergyAvg - currentEnergyAvg >= 1.3;

  const stressRisk = Math.round(clamp((5 - moodAvg) * 16 + (5 - sleepAvg) * 10 + (5 - energyAvg) * 10, 0, 100));
  const burnoutRisk = Math.round(clamp(stressRisk * 0.55 + (lowEnergyDays >= 2 ? 20 : 0) + (suddenDrop ? 16 : 0), 0, 100));
  const energyDeficit = Math.round(clamp((5 - energyAvg) * 22 + (5 - sleepAvg) * 9, 0, 100));

  let burnoutFlag: RiskSnapshot['burnoutFlag'] = 'none';
  if (burnoutRisk >= 70) {
    burnoutFlag = 'alert';
  } else if (burnoutRisk >= 45) {
    burnoutFlag = 'watch';
  }

  return {
    stressRisk,
    burnoutRisk,
    energyDeficit,
    burnoutFlag,
    anomalyDetected: lowEnergyDays >= 3 || suddenDrop
  };
};

const basePriority = (risk: RiskSnapshot, profile: OnboardingProfile | null) => {
  const conditions = profile?.primaryConditions ?? [];
  const goals = profile?.healthGoals ?? [];
  const symptoms = profile?.symptomTags ?? [];

  if (conditions.some((item) => ['Diabetes', 'Prediabetes', 'Insulin Resistance'].includes(item)) || goals.includes('Sugar Control')) {
    return {
      title: 'Protect your blood sugar rhythm today',
      action: 'Pair your next meal with protein first, then take a gentle 10-minute walk after eating.'
    };
  }

  if (conditions.some((item) => ['PCOS', 'PCOD', 'Thyroid', 'Hormonal Imbalance'].includes(item)) || goals.includes('Hormone Balance')) {
    return {
      title: 'Support hormones with steadier energy',
      action: 'Do not skip your first meal. Add protein, fiber, and hydration in the first half of your day.'
    };
  }

  if (conditions.some((item) => ['Hypertension', 'High Cholesterol'].includes(item)) || goals.includes('BP Control')) {
    return {
      title: 'Lower pressure with one recovery action',
      action: 'Choose a lower-salt meal today and add one breathing reset before evening.'
    };
  }

  if (conditions.some((item) => ['Gut Health', 'Fatty Liver'].includes(item)) || goals.includes('Gut Relief') || symptoms.includes('Bloating')) {
    return {
      title: 'Make digestion easier today',
      action: 'Keep lunch simple, chew slower, and finish dinner a little earlier than usual.'
    };
  }

  if (risk.energyDeficit >= 60 || goals.includes('Better Energy')) {
    return {
      title: 'Protect your energy before the next dip',
      action: 'Drink water now and take a short walk before your next long sitting block.'
    };
  }

  if (risk.stressRisk >= 55 || goals.includes('Better Sleep')) {
    return {
      title: 'Calm your system in under 2 minutes',
      action: 'Do one round of box breathing now and keep screens lighter tonight.'
    };
  }

  return {
    title: 'Build one small healthy win today',
    action: 'Complete one meal, one water target, and one short movement break before the day ends.'
  };
};

const scheduleSmartNudge = (risk: RiskSnapshot, profile: OnboardingProfile | null, nudgesSentToday: number, userId: string): Nudge | null => {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 8 || hour >= 20 || nudgesSentToday >= 3) {
    return null;
  }

  const conditions = profile?.primaryConditions ?? [];
  const symptoms = profile?.symptomTags ?? [];

  let type: Nudge['type'] = 'hydration';
  let title = 'Hydration reset';
  let body = 'Take 2 minutes to drink water and support your recovery rhythm.';
  let actionLabel = 'Start 2-min reset';
  let actionMinutes: Nudge['actionMinutes'] = 2;

  if (conditions.some((item) => ['Diabetes', 'Prediabetes', 'Insulin Resistance'].includes(item))) {
    type = 'break';
    title = 'Post-meal movement reminder';
    body = 'A short walk after meals can support steadier glucose and digestion.';
  } else if (conditions.some((item) => ['PCOS', 'PCOD', 'Hormonal Imbalance', 'Thyroid'].includes(item))) {
    type = 'breathing';
    title = 'Hormone-support reset';
    body = 'Two calm minutes now can reduce stress load and support your recovery plan.';
  } else if (symptoms.includes('Bloating') || conditions.includes('Gut Health')) {
    type = 'winddown';
    title = 'Gentle digestion check';
    body = 'Pause for 2 minutes and choose a lighter, slower next meal.';
  } else if (risk.energyDeficit >= 60) {
    type = 'hydration';
    title = 'Energy support reset';
    body = 'Hydrate now and stand up for a minute to protect your energy.';
  }

  const scheduledAt = new Date();
  scheduledAt.setMinutes(scheduledAt.getMinutes() + 20);

  return {
    id: `ndg-${Date.now()}`,
    userId,
    type,
    title,
    body,
    actionLabel,
    actionMinutes,
    scheduledAtISO: scheduledAt.toISOString()
  };
};

export const generatePriorityPlan = (params: {
  userId: string;
  profile: OnboardingProfile | null;
  checkins: DailyCheckIn[];
  todayMeetings: number;
  nudgesSentToday: number;
}): PriorityPlan => {
  const risk = calculateRiskSnapshot(params.checkins);
  const priority = basePriority(risk, params.profile);
  const nudge = scheduleSmartNudge(risk, params.profile, params.nudgesSentToday, params.userId);

  const wearableNote = params.profile?.wearablePreference === 'sync'
    ? 'Wearable insights will refine your care dashboard as new sleep and activity data arrives.'
    : 'Manual assessments will guide your care dashboard until you connect a device.';

  return {
    priorityTitle: priority.title,
    priorityAction: priority.action,
    risk,
    suggestedNudge: nudge,
    smartPreview: wearableNote
  };
};

export const buildDecisionLog = (plan: PriorityPlan, checkins: DailyCheckIn[]): DecisionLog => {
  const recent = checkins.slice(-14);
  return {
    id: `dec-${Date.now()}`,
    createdAtISO: new Date().toISOString(),
    inputSummary: `Analyzed ${recent.length} health check-ins and the active care track on ${todayKey()}.`,
    reasoning: `Stress risk ${plan.risk.stressRisk}, burnout risk ${plan.risk.burnoutRisk}, energy deficit ${plan.risk.energyDeficit}. Selected the smallest high-value care action for adherence.`,
    outputSummary: `${plan.priorityTitle}. Nudge: ${plan.suggestedNudge ? plan.suggestedNudge.type : 'none'}. Burnout flag: ${plan.risk.burnoutFlag}.`
  };
};
