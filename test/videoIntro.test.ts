import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/screens/auth/SplashScreen.tsx'),
  'utf8'
);
const appConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')
);
const frozenBridgePlugin = fs.readFileSync(
  path.join(process.cwd(), 'plugins/withFrozenSplashBridge.js'),
  'utf8'
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
const androidStyles = fs.readFileSync(
  path.join(process.cwd(), 'android/app/src/main/res/values/styles.xml'),
  'utf8'
);
const androidColors = fs.readFileSync(
  path.join(process.cwd(), 'android/app/src/main/res/values/colors.xml'),
  'utf8'
);
const iosUpdatesConfig = fs.readFileSync(
  path.join(process.cwd(), 'ios/Fiteatsy/Supporting/Expo.plist'),
  'utf8'
);
const androidManifest = fs.readFileSync(
  path.join(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
  'utf8'
);
const appNavigation = fs.readFileSync(
  path.join(process.cwd(), 'src/navigation/AppNavigation.tsx'),
  'utf8'
);
const podfileLock = fs.readFileSync(
  path.join(process.cwd(), 'ios/Podfile.lock'),
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
    expect(source).toContain('SPLASH_MAX_DURATION_MS = 10_000');
    expect(source).toContain("player.addListener('statusChange'");
    expect(source).not.toContain("player.addListener('playToEnd'");
    expect(source).not.toMatch(/status !== 'error'[\s\S]{0,240}requestExit\(\)/);
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
    expect(iosLaunchScreen).not.toContain('<imageView');
    expect(iosLaunchScreen).not.toContain('<image ');
    expect(iosLaunchScreen).toContain('alpha="1.000" white="0.000"');
    expect(androidLaunchBackground).not.toContain('splashscreen_logo');
    expect(androidLaunchBackground).toContain('@color/splashscreen_background');
    expect(androidStyles).toContain(
      '<item name="android:windowBackground">@drawable/ic_launcher_background</item>'
    );
    expect(androidColors).toContain(
      '<color name="splashscreen_background">#000000</color>'
    );
    expect(appConfig.expo.plugins).toContain('./plugins/withFrozenSplashBridge');
    expect(frozenBridgePlugin).toContain('IOS_STORYBOARD');
    expect(frozenBridgePlugin).toContain('ANDROID_BLACK_BACKGROUND');
  });

  it('quarantines every prohibited legacy launch asset from active source paths', () => {
    for (const relativePath of [
      'src/assets/splash.png',
      'android/app/src/main/res/drawable-mdpi/splashscreen_logo.png',
      'android/app/src/main/res/drawable-hdpi/splashscreen_logo.png',
      'android/app/src/main/res/drawable-xhdpi/splashscreen_logo.png',
      'android/app/src/main/res/drawable-xxhdpi/splashscreen_logo.png',
      'android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png'
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), relativePath))).toBe(false);
    }
  });

  it('protects the current official logo by deterministic content hash', () => {
    const logo = fs.readFileSync(
      path.join(process.cwd(), 'src/assets/brand/fiteatsy-logo.svg')
    );
    expect(crypto.createHash('sha256').update(logo).digest('hex')).toBe(
      '59bdffba51d80546750862b5366bde6ec06e6cb9f7b92c19bc99be0a2b7aab0e'
    );
  });

  it('pins native production builds to the production OTA channel', () => {
    expect(iosUpdatesConfig).toContain('<key>EXUpdatesRequestHeaders</key>');
    expect(iosUpdatesConfig).toContain('<key>expo-channel-name</key>');
    expect(iosUpdatesConfig).toContain('<string>production</string>');
    expect(androidManifest).toContain(
      'expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY'
    );
    expect(androidManifest).toContain(
      '{&quot;expo-channel-name&quot;:&quot;production&quot;}'
    );
  });

  it('keeps the canonical splash first and backed by the native video module', () => {
    expect(appNavigation).toContain('initialRouteName="Splash"');
    expect(appNavigation.match(/<Stack\.Screen name="Splash"/g)).toHaveLength(1);
    expect(podfileLock).toContain('ExpoVideo (3.0.16)');
    expect(appConfig.expo.runtimeVersion).toBe('1.0.0-native-20260825-health-connect-d2');
  });
});
