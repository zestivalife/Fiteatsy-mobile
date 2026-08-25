import { mondayOfWeek, todayKey, toDayKey } from '../src/utils/date';

describe('canonical IST business dates', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['2026-08-22T18:29:59.999Z', '2026-08-22'],
    ['2026-08-22T18:30:00.000Z', '2026-08-23'],
    ['2026-08-22T23:59:59.999Z', '2026-08-23'],
    ['2026-08-23T00:00:00.000Z', '2026-08-23'],
    ['2026-08-23T05:29:59.999Z', '2026-08-23'],
    ['2026-08-23T05:30:00.000Z', '2026-08-23']
  ])('maps %s to IST business date %s', (instant, expected) => {
    expect(toDayKey(instant)).toBe(expected);
  });

  it('preserves canonical date-only values without timezone reinterpretation', () => {
    expect(toDayKey('2026-08-23')).toBe('2026-08-23');
  });

  it('derives today and week boundaries from the IST date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-23T18:30:00.000Z'));
    expect(todayKey()).toBe('2026-08-24');
    expect(mondayOfWeek('2026-08-23T18:30:00.000Z')).toBe('2026-08-24');
  });

  it('rejects invalid timestamps instead of silently creating a date key', () => {
    expect(() => toDayKey('not-a-date')).toThrow('Invalid date value.');
  });
});
