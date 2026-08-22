import {
  Medication,
  MedicationFrequencyRule,
  MedicationLog,
  MedicationLogStatus,
  MedicationTimeSlot
} from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;
export const MEDICATION_TIME_ZONE = 'Asia/Kolkata';

export const getMedicationBusinessDateKey = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
};

export const medicationBusinessDateFromKey = (key: string) => new Date(`${key}T00:00:00.000+05:30`);

export const medicationScheduledDate = (businessDateKey: string, time24h: string) =>
  new Date(`${businessDateKey}T${/^\d{2}:\d{2}$/.test(time24h) ? time24h : '00:00'}:00.000+05:30`);

export const toISODateOnly = (value: string | Date) => {
  return medicationBusinessDateFromKey(getMedicationBusinessDateKey(value)).toISOString();
};

export const parseTimeToParts = (time24h: string) => {
  const [h, m] = time24h.split(':').map((v) => Number(v));
  return { hours: Number.isFinite(h) ? h : 0, minutes: Number.isFinite(m) ? m : 0 };
};

export const resolveMedicationSlotForOccurrence = (medication: Medication, scheduledForISO: string) => {
  const scheduled = new Date(new Date(scheduledForISO).getTime() + IST_OFFSET_MS);
  const hours = scheduled.getUTCHours();
  const minutes = scheduled.getUTCMinutes();
  return (
    medication.schedule.timeSlots.find((slot) => {
      const parts = parseTimeToParts(slot.time24h);
      return parts.hours === hours && parts.minutes === minutes;
    }) ?? medication.schedule.timeSlots[0]
  );
};

const matchesFrequency = (rule: MedicationFrequencyRule, dayKey: string, startKey: string) => {
  const day = new Date(`${dayKey}T00:00:00.000Z`);
  const start = new Date(`${startKey}T00:00:00.000Z`);
  const diffDays = Math.floor((day.getTime() - start.getTime()) / DAY_MS);
  if (diffDays < 0) return false;

  switch (rule.preset) {
    case 'every_day':
      return true;
    case 'alternate_days':
      return diffDays % 2 === 0;
    case 'specific_weekdays':
      return (rule.weekdays ?? []).includes(day.getUTCDay());
    case 'every_x_days': {
      const interval = Math.max(1, rule.intervalDays ?? 1);
      return diffDays % interval === 0;
    }
    case 'weekly':
      return (rule.weekdays ?? [start.getUTCDay()]).includes(day.getUTCDay());
    case 'monthly':
      return (rule.monthlyDays ?? [start.getUTCDate()]).includes(day.getUTCDate());
    case 'custom':
      return true;
    default:
      return false;
  }
};

export const toStartOfDay = (d: Date) => medicationBusinessDateFromKey(getMedicationBusinessDateKey(d));

export const getMedicationOccurrencesForDate = (medication: Medication, day: Date) => {
  if (medication.status !== 'active') return [];

  const dayKey = getMedicationBusinessDateKey(day);
  const startKey = getMedicationBusinessDateKey(medication.schedule.duration.startDateISO);
  const endKey = medication.schedule.duration.endDateISO ? getMedicationBusinessDateKey(medication.schedule.duration.endDateISO) : null;
  if (dayKey < startKey) return [];
  if (endKey && dayKey > endKey) return [];
  if (!matchesFrequency(medication.schedule.frequency, dayKey, startKey)) return [];

  return medication.schedule.timeSlots.map((slot) => {
    const { hours, minutes } = parseTimeToParts(slot.time24h);
    return {
      slot,
      scheduledFor: medicationScheduledDate(dayKey, `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
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
