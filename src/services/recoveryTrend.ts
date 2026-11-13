import type { HealthScore } from './healthIntelligenceService';

export type RecoveryTrendDay = {
  dayKey: string;
  dayLabel: string;
  score: number | null;
};

const localDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const buildSevenDayRecoveryTrend = (
  history: HealthScore[],
  now = new Date()
): RecoveryTrendDay[] => {
  const scoreByDay = new Map<string, { score: number; timestamp: number }>();

  history.forEach((item) => {
    if (item.scoreStatus !== 'calculated' || item.scoreValue == null || !Number.isFinite(item.scoreValue)) return;
    const calculatedAt = new Date(item.calculatedAtISO);
    if (Number.isNaN(calculatedAt.getTime())) return;
    const dayKey = localDayKey(calculatedAt);
    const current = scoreByDay.get(dayKey);
    if (!current || calculatedAt.getTime() > current.timestamp) {
      scoreByDay.set(dayKey, {
        score: Math.max(0, Math.min(100, Math.round(item.scoreValue))),
        timestamp: calculatedAt.getTime()
      });
    }
  });

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const dayKey = localDayKey(date);
    return {
      dayKey,
      dayLabel: date.toLocaleDateString(undefined, { weekday: 'short' }),
      score: scoreByDay.get(dayKey)?.score ?? null
    };
  });
};
