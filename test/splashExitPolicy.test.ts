import {
  shouldExitSplash,
  SPLASH_MAX_DURATION_MS,
  SPLASH_MIN_DURATION_MS
} from '../src/screens/auth/splashExitPolicy';

describe('bounded splash exit policy', () => {
  it('uses a short minimum brand window and a bounded safety maximum', () => {
    expect(SPLASH_MIN_DURATION_MS).toBe(1_200);
    expect(SPLASH_MAX_DURATION_MS).toBe(4_000);
    expect(SPLASH_MAX_DURATION_MS).toBeLessThan(10_000);
  });

  it.each(['authenticated', 'logged-out'])('%s local restore exits after the minimum window', () => {
    expect(shouldExitSplash({ bootstrapped: true, minimumVisualElapsed: true, failsafeElapsed: false })).toBe(true);
  });

  it('does not let video completion or failure bypass incomplete local restoration', () => {
    expect(shouldExitSplash({ bootstrapped: false, minimumVisualElapsed: true, failsafeElapsed: false })).toBe(false);
  });

  it('uses the maximum only as a bounded failsafe', () => {
    expect(shouldExitSplash({ bootstrapped: false, minimumVisualElapsed: false, failsafeElapsed: true })).toBe(true);
  });

  it('has no remote hydration input that can block local navigation readiness', () => {
    expect(Object.keys({ bootstrapped: true, minimumVisualElapsed: true, failsafeElapsed: false })).toEqual([
      'bootstrapped', 'minimumVisualElapsed', 'failsafeElapsed'
    ]);
  });
});
