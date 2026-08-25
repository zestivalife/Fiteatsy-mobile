export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export const toDayKey = (value: string | Date) => {
  if (typeof value === 'string' && dateOnlyPattern.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date value.');
  const parts = businessDateFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const todayKey = () => {
  return toDayKey(new Date());
};

export const isSameDay = (leftISO: string, rightISO: string) => {
  return toDayKey(leftISO) === toDayKey(rightISO);
};

export const mondayOfWeek = (inputISO: string) => {
  const inputKey = toDayKey(inputISO);
  const date = new Date(`${inputKey}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
};
