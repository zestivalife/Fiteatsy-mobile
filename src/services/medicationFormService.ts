export const normalizeMedicationStrength = (value: string) => {
  const normalized = value.trim().replace(',', '.').replace(/\s*(mg|iu)\s*$/i, '');
  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : null;
};

export const strengthFromDosage = (dosage: string) => {
  const match = dosage.match(/(?:^|\s)(\d+(?:[.,]\d{1,3})?)\s*(?:mg|iu)\b/i);
  return match ? normalizeMedicationStrength(match[1]) : null;
};

export const strengthUnitFromDosage = (dosage: string): 'mg' | 'IU' =>
  /(?:^|\s)\d+(?:[.,]\d{1,3})?\s*iu\b/i.test(dosage) ? 'IU' : 'mg';

export const time24hTo12h = (time24h: string) => {
  const match = time24h.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  const hours = match ? Number(match[1]) : 8;
  const minute = match ? Number(match[2]) : 0;
  return { hour: hours % 12 || 12, minute, meridiem: hours >= 12 ? 'PM' as const : 'AM' as const };
};

export const time12hTo24h = (hour: number, minute: number, meridiem: 'AM' | 'PM') => {
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('Invalid reminder time.');
  }
  const hours = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
  return `${String(hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const hasDuplicateReminderTimes = (times: Array<{ time24h: string }>) =>
  new Set(times.map((slot) => slot.time24h)).size !== times.length;
