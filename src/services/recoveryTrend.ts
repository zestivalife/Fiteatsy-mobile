import type { HealthScore } from './healthIntelligenceService';

export type RecoveryTrendDay = {
  dayKey: string;
  dayLabel: string;
  score: number | null;
  calculationVersion?: string | null;
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
  const scoreByDay = new Map<string, { score: number; timestamp: number; calculationVersion: string }>();

  history.forEach((item) => {
    if (item.scoreStatus !== 'calculated' || item.scoreValue == null || !Number.isFinite(item.scoreValue)) return;
    const calculatedAt = new Date(item.calculatedAtISO);
    if (Number.isNaN(calculatedAt.getTime())) return;
    const governedHealthDay = item.healthDay ?? (
      typeof item.inputSummary.healthDay === 'string' ? item.inputSummary.healthDay : null
    );
    const dayKey = governedHealthDay && /^\d{4}-\d{2}-\d{2}$/.test(governedHealthDay)
      ? governedHealthDay
      : localDayKey(calculatedAt);
    const current = scoreByDay.get(dayKey);
    if (!current || calculatedAt.getTime() > current.timestamp) {
      scoreByDay.set(dayKey, {
        score: Math.max(0, Math.min(100, Math.round(item.scoreValue))),
        timestamp: calculatedAt.getTime(),
        calculationVersion: item.calculationVersion
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
      score: scoreByDay.get(dayKey)?.score ?? null,
      calculationVersion: scoreByDay.get(dayKey)?.calculationVersion ?? null
    };
  });
};

export type CandidateRecoveryTrendDay = {
  dayKey: string;
  score: number | null;
  calculationVersion: string | null;
};

export const reconcileSevenDayRecoveryTrend = (
  calendar: RecoveryTrendDay[],
  candidate: CandidateRecoveryTrendDay[] | null | undefined,
  candidateCalculationVersion: string | null | undefined
): RecoveryTrendDay[] => {
  if (!candidate) return calendar;
  const compatibleCandidateDay = (day: CandidateRecoveryTrendDay) => ({
    ...day,
    score: candidateCalculationVersion != null && day.calculationVersion !== candidateCalculationVersion
      ? null
      : day.score
  });
  if (candidate.length >= calendar.length) {
    return [...candidate]
      .sort((left, right) => left.dayKey.localeCompare(right.dayKey))
      .slice(-calendar.length)
      .map((day) => ({
        ...compatibleCandidateDay(day),
        dayLabel: new Date(`${day.dayKey}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
      }));
  }
  const candidateByDay = new Map(candidate.map((item) => [item.dayKey, item]));
  return calendar.map((day) => {
    const candidateDay = candidateByDay.get(day.dayKey);
    if (candidateDay) {
      return {
        ...day,
        ...compatibleCandidateDay(candidateDay)
      };
    }
    const compatible = candidateCalculationVersion != null
      && day.calculationVersion === candidateCalculationVersion;
    return compatible ? day : { ...day, score: null, calculationVersion: candidateCalculationVersion ?? null };
  });
};
