export const SPLASH_MIN_DURATION_MS = 1_200;
export const SPLASH_MAX_DURATION_MS = 4_000;

export type SplashExitReadiness = {
  bootstrapped: boolean;
  minimumVisualElapsed: boolean;
  failsafeElapsed: boolean;
};

/**
 * The splash has one exit authority. Remote hydration is intentionally absent:
 * only local session restoration and bounded visual timing govern navigation.
 */
export const shouldExitSplash = ({
  bootstrapped,
  minimumVisualElapsed,
  failsafeElapsed
}: SplashExitReadiness) => failsafeElapsed || (bootstrapped && minimumVisualElapsed);
