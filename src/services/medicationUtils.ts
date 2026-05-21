import {
  Medication,
  MedicationFrequencyRule,
  MedicationLog,
  MedicationLogStatus,
  MedicationTimeSlot
} from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const toISODateOnly = (value: string | Date) => {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
};

export const parseTimeToParts = (time24h: string) => {
  const [h, m] = time24h.split(':').map((v) => Number(v));
  return { hours: Number.isFinite(h) ? h : 0, minutes: Number.isFinite(m) ? m : 0 };
};

export const resolveMedicationSlotForOccurrence = (medication: Medication, scheduledForISO: string) => {
  const scheduled = new Date(scheduledForISO);
  const hours = scheduled.getHours();
  const minutes = scheduled.getMinutes();
  return (
    medication.schedule.timeSlots.find((slot) => {
      const parts = parseTimeToParts(slot.time24h);
      return parts.hours === hours && parts.minutes === minutes;
    }) ?? medication.schedule.timeSlots[0]
  );
};

const matchesFrequency = (rule: MedicationFrequencyRule, day: Date, start: Date) => {
  const diffDays = Math.floor((toStartOfDay(day).getTime() - toStartOfDay(start).getTime()) / DAY_MS);
  if (diffDays < 0) return false;

  switch (rule.preset) {
    case 'every_day':
      return true;
    case 'alternate_days':
      return diffDays % 2 === 0;
    case 'specific_weekdays':
      return (rule.weekdays ?? []).includes(day.getDay());
    case 'every_x_days': {
      const interval = Math.max(1, rule.intervalDays ?? 1);
      return diffDays % interval === 0;
    }
    case 'weekly':
      return (rule.weekdays ?? [start.getDay()]).includes(day.getDay());
    case 'monthly':
      return (rule.monthlyDays ?? [start.getDate()]).includes(day.getDate());
    case 'custom':
      return true;
    default:
      return false;
  }
};

export const toStartOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

export const getMedicationOccurrencesForDate = (medication: Medication, day: Date) => {
  if (medication.status !== 'active') return [];

  const start = new Date(medication.schedule.duration.startDateISO);
  const end = medication.schedule.duration.endDateISO ? new Date(medication.schedule.duration.endDateISO) : null;

  const dayStart = toStartOfDay(day);
  if (dayStart < toStartOfDay(start)) return [];
  if (end && dayStart > toStartOfDay(end)) return [];
  if (!matchesFrequency(medication.schedule.frequency, dayStart, start)) return [];

  return medication.schedule.timeSlots.map((slot) => {
    const { hours, minutes } = parseTimeToParts(slot.time24h);
    return {
      slot,
      scheduledFor: new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0)
    };
  });
};

export const getMedicationStatusForOccurrence = (
  medicationId: string,
  scheduledForISO: string,
  logs: MedicationLog[]
): MedicationLogStatus => {
  const existing = logs
    .filter((log) => log.medicationId === medicationId && log.scheduledForISO === scheduledForISO)
    .sort((a, b) => new Date(b.actionedAtISO ?? b.scheduledForISO).getTime() - new Date(a.actionedAtISO ?? a.scheduledForISO).getTime())[0];

  if (existing) {
    if (existing.status === 'snoozed' && existing.snoozedUntilISO && new Date(existing.snoozedUntilISO).getTime() > Date.now()) {
      return 'upcoming';
    }
    return existing.status;
  }
  const snoozed = logs
    .filter((log) => log.medicationId === medicationId && log.status === 'snoozed' && log.snoozedUntilISO)
    .sort((a, b) => new Date(b.actionedAtISO ?? b.scheduledForISO).getTime() - new Date(a.actionedAtISO ?? a.scheduledForISO).getTime())[0];
  if (snoozed?.snoozedUntilISO && new Date(snoozed.snoozedUntilISO).getTime() > Date.now()) {
    return 'upcoming';
  }

  const now = Date.now();
  const when = new Date(scheduledForISO).getTime();
  return when < now ? 'missed' : 'upcoming';
};

export const buildLogId = (medicationId: string, slot: MedicationTimeSlot, whenISO: string) =>
  `medlog-${medicationId}-${slot.id}-${whenISO}`;
