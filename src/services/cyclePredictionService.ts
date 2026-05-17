import { CycleLog, CyclePhase, CyclePrediction, CycleSymptom } from '../types';

const DAY = 24 * 60 * 60 * 1000;

const dateOnly = (value: string | Date) => {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const isoDay = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00.000Z`;
};

const addDays = (value: Date, days: number) => new Date(value.getTime() + days * DAY);

const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const getCycleStarts = (logs: CycleLog[]) => {
  const starts = logs
    .filter((log) => log.periodStarted)
    .map((log) => dateOnly(log.dateISO).getTime())
    .sort((a, b) => a - b);
  return Array.from(new Set(starts)).map((t) => new Date(t));
};

const getCycleLengths = (starts: Date[]) => {
  const lengths: number[] = [];
  for (let i = 1; i < starts.length; i += 1) {
    const delta = diffDays(starts[i], starts[i - 1]);
    if (delta >= 15 && delta <= 60) lengths.push(delta);
  }
  return lengths;
};

const avg = (values: number[], fallback: number) => {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getAveragePeriodDuration = (logs: CycleLog[]) => {
  const byDate = new Map<string, CycleLog>();
  logs.forEach((log) => byDate.set(isoDay(dateOnly(log.dateISO)), log));
  const starts = getCycleStarts(logs);
  const durations: number[] = [];

  starts.forEach((start) => {
    let duration = 0;
    for (let offset = 0; offset < 10; offset += 1) {
      const key = isoDay(addDays(start, offset));
      const log = byDate.get(key);
      if (!log) break;
      if (offset > 0 && log.periodStarted) break;
      if (log.periodEnded) {
        duration += 1;
        break;
      }
      duration += log.flow ? 1 : 0;
    }
    if (duration > 0) durations.push(duration);
  });

  return clamp(Math.round(avg(durations.slice(-6), 5)), 2, 8);
};

export const buildCyclePrediction = (logs: CycleLog[]): CyclePrediction => {
  const starts = getCycleStarts(logs);
  const lengths = getCycleLengths(starts);
  const last3 = lengths.slice(-3);
  const last6 = lengths.slice(-6);
  const blendedLength = Math.round((avg(last3, 28) * 0.65 + avg(last6, 28) * 0.35));
  const averageCycleLengthDays = clamp(blendedLength, 21, 40);
  const averagePeriodDurationDays = getAveragePeriodDuration(logs);

  const mean = avg(last6, 28);
  const variance = last6.length > 0 ? avg(last6.map((v) => Math.pow(v - mean, 2)), 0) : 0;
  const stdDev = Math.sqrt(variance);
  const consistencyScore = clamp(Math.round(100 - stdDev * 8), 15, 100);

  let confidence: CyclePrediction['confidence'] = 'low';
  if (starts.length >= 6 && consistencyScore >= 75) confidence = 'high';
  else if (starts.length >= 3 && consistencyScore >= 50) confidence = 'medium';

  const latestStart = starts.length > 0 ? starts[starts.length - 1] : null;
  const predictedNextPeriodStart = latestStart ? addDays(latestStart, averageCycleLengthDays) : null;
  const predictedOvulation = predictedNextPeriodStart ? addDays(predictedNextPeriodStart, -14) : null;
  const predictedFertileStart = predictedOvulation ? addDays(predictedOvulation, -5) : null;
  const predictedFertileEnd = predictedOvulation ? addDays(predictedOvulation, 1) : null;

  return {
    predictedNextPeriodStartISO: predictedNextPeriodStart ? predictedNextPeriodStart.toISOString() : null,
    predictedFertileStartISO: predictedFertileStart ? predictedFertileStart.toISOString() : null,
    predictedFertileEndISO: predictedFertileEnd ? predictedFertileEnd.toISOString() : null,
    predictedOvulationISO: predictedOvulation ? predictedOvulation.toISOString() : null,
    averageCycleLengthDays,
    averagePeriodDurationDays,
    confidence,
    basedOnCycleCount: starts.length,
    consistencyScore
  };
};

export const getCurrentCycleDay = (logs: CycleLog[], targetISO: string) => {
  const starts = getCycleStarts(logs);
  if (starts.length === 0) return null;
  const target = dateOnly(targetISO);
  const lastStart = [...starts].reverse().find((start) => start.getTime() <= target.getTime());
  if (!lastStart) return null;
  return diffDays(target, lastStart) + 1;
};

export const getPhaseForDate = (logs: CycleLog[], targetISO: string, prediction: CyclePrediction): CyclePhase => {
  const target = dateOnly(targetISO);
  const targetKey = isoDay(target);
  const logForDay = logs.find((log) => isoDay(dateOnly(log.dateISO)) === targetKey);
  if (logForDay?.flow || logForDay?.periodStarted) return 'menstrual';

  if (prediction.predictedFertileStartISO && prediction.predictedFertileEndISO) {
    const fertileStart = dateOnly(prediction.predictedFertileStartISO);
    const fertileEnd = dateOnly(prediction.predictedFertileEndISO);
    if (target >= fertileStart && target <= fertileEnd) return 'ovulation_window';
  }

  const cycleDay = getCurrentCycleDay(logs, targetISO);
  if (cycleDay === null) return 'follicular';
  if (cycleDay <= prediction.averagePeriodDurationDays) return 'menstrual';
  if (cycleDay <= Math.max(13, prediction.averageCycleLengthDays - 15)) return 'follicular';
  return 'luteal';
};

export const getMostCommonSymptoms = (logs: CycleLog[]): Array<{ symptom: CycleSymptom; count: number }> => {
  const counts = new Map<CycleSymptom, number>();
  logs.forEach((log) => {
    log.symptoms.forEach((symptom) => {
      counts.set(symptom, (counts.get(symptom) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([symptom, count]) => ({ symptom, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
};

export const daysUntil = (targetISO: string | null, fromISO: string) => {
  if (!targetISO) return null;
  const d = diffDays(dateOnly(targetISO), dateOnly(fromISO));
  return d;
};
