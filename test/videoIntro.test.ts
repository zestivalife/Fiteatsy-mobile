import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/screens/auth/SplashScreen.tsx'),
  'utf8'
);

describe('premium app-level video intro contract', () => {
  it('uses the approved remote video and supplied SVG with the required presentation', () => {
    expect(source).toContain("https://zestiva.life/assets/Fiteatsy.mp4");
    expect(source).toContain("fiteatsy-logo.svg");
    expect(source).toContain("contentFit=\"cover\"");
    expect(source).toContain("nativeControls={false}");
    expect(source).toContain("backgroundColor: 'rgba(0,0,0,0.70)'");
    expect(source).toContain('videoPlayer.muted = true');
  });

  it('enforces the timeout, fallback, cleanup, and reduced-motion contracts', () => {
    expect(source).toContain('MAX_SPLASH_DURATION = 10_000');
    expect(source).toContain("player.addListener('statusChange'");
    expect(source).toContain('AccessibilityInfo.isReduceMotionEnabled()');
    expect(source).toContain('clearTimeout(maximumDurationTimer)');
    expect(source).toContain('player.pause()');
  });

  it('preserves every canonical post-startup route', () => {
    for (const route of [
      'SignIn',
      'FoodPreferences',
      'OnboardingAssessment',
      'SyncWearable',
      'OnboardingBasics',
      'Main'
    ]) {
      expect(source).toContain(`navigation.replace('${route}'`);
    }
  });
});
