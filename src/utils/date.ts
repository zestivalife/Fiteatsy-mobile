export const toDayKey = (iso: string) => iso.slice(0, 10);

export const todayKey = () => {
  return new Date().toISOString().slice(0, 10);
};

export const isSameDay = (leftISO: string, rightISO: string) => {
  return toDayKey(leftISO) === toDayKey(rightISO);
};

export const mondayOfWeek = (inputISO: string) => {
  const date = new Date(inputISO);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
};
