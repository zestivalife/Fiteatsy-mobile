import { secondsToClock, minutesToClock } from '../src/utils/time';

describe('time utils', () => {
  it('formats seconds to mm:ss', () => {
    expect(secondsToClock(158)).toBe('02:38');
    expect(secondsToClock(0)).toBe('00:00');
  });

  it('formats minutes to hh:mm', () => {
    expect(minutesToClock(75)).toBe('01:15');
    expect(minutesToClock(-1)).toBe('00:00');
  });
});
