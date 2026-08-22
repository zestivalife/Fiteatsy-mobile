import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/screens/auth/SplashScreen.tsx'),
  'utf8'
);
const appConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')
);
const iosLaunchScreen = fs.readFileSync(
  path.join(process.cwd(), 'ios/Fiteatsy/SplashScreen.storyboard'),
  'utf8'
);
const androidLaunchBackground = fs.readFileSync(
  path.join(
    process.cwd(),
    'android/app/src/main/res/drawable/ic_launcher_background.xml'
  ),
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

  it('keeps the native bootstrap unbranded and black before video playback', () => {
    expect(appConfig.expo.splash).toEqual({
      resizeMode: 'contain',
      backgroundColor: '#000000'
    });
    expect(iosLaunchScreen).not.toContain('SplashScreenLegacy');
    expect(androidLaunchBackground).not.toContain('splashscreen_logo');
  });
});
