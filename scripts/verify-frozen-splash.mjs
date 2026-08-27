import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootArgumentIndex = process.argv.indexOf('--root');
const root = path.resolve(
  rootArgumentIndex >= 0 && process.argv[rootArgumentIndex + 1]
    ? process.argv[rootArgumentIndex + 1]
    : process.cwd()
);

const read = relativePath =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = relativePath => fs.existsSync(path.join(root, relativePath));
const fail = message => {
  throw new Error(`Frozen splash contract violation: ${message}`);
};
const requireText = (text, expected, label) => {
  if (!text.includes(expected)) fail(`${label} is missing ${expected}`);
};
const rejectText = (text, prohibited, label) => {
  if (text.toLowerCase().includes(prohibited.toLowerCase())) {
    fail(`${label} references prohibited legacy marker ${prohibited}`);
  }
};

const appConfig = JSON.parse(read('app.json'));
const bridgePlugin = read('plugins/withFrozenSplashBridge.js');
const splashSource = read('src/screens/auth/SplashScreen.tsx');
const iosStoryboard = read('ios/Fiteatsy/SplashScreen.storyboard');
const iosColor = read(
  'ios/Fiteatsy/Images.xcassets/SplashScreenBackground.colorset/Contents.json'
);
const iosColorConfig = JSON.parse(iosColor);
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const androidStyles = read('android/app/src/main/res/values/styles.xml');
const androidColors = read('android/app/src/main/res/values/colors.xml');
const androidBackground = read(
  'android/app/src/main/res/drawable/ic_launcher_background.xml'
);

const expectedExpoSplash = {
  resizeMode: 'contain',
  backgroundColor: '#000000'
};
if (JSON.stringify(appConfig.expo?.splash) !== JSON.stringify(expectedExpoSplash)) {
  fail('Expo splash must be the image-free black bridge');
}
if (!appConfig.expo?.plugins?.includes('./plugins/withFrozenSplashBridge')) {
  fail('frozen splash prebuild plugin is not active');
}
requireText(bridgePlugin, 'IOS_STORYBOARD', 'frozen splash plugin');
requireText(bridgePlugin, 'ANDROID_BLACK_BACKGROUND', 'frozen splash plugin');

requireText(splashSource, 'https://zestiva.life/assets/Fiteatsy.mp4', 'video splash');
requireText(splashSource, 'fiteatsy-logo.svg', 'video splash');
requireText(splashSource, "backgroundColor: 'rgba(0,0,0,0.70)'", 'video splash');
requireText(splashSource, 'SPLASH_MAX_DURATION_MS = 10_000', 'video splash');

if (iosStoryboard.includes('<imageView') || iosStoryboard.includes('<image ')) {
  fail('iOS launch storyboard contains an image');
}
requireText(iosStoryboard, 'name="SplashScreenBackground"', 'iOS storyboard');
requireText(iosStoryboard, 'alpha="1.000" white="0.000"', 'iOS storyboard');
const iosColorComponents = iosColorConfig.colors?.[0]?.color?.components;
if (
  Number(iosColorComponents?.red) !== 0 ||
  Number(iosColorComponents?.green) !== 0 ||
  Number(iosColorComponents?.blue) !== 0 ||
  Number(iosColorComponents?.alpha) !== 1
) {
  fail('iOS splash color must be opaque black');
}

requireText(androidManifest, '@style/Theme.App.SplashScreen', 'Android manifest');
requireText(
  androidStyles,
  '<item name="android:windowBackground">@drawable/ic_launcher_background</item>',
  'Android splash theme'
);
requireText(androidBackground, '@color/splashscreen_background', 'Android launch background');
requireText(androidColors, '<color name="splashscreen_background">#000000</color>', 'Android colors');

const prohibitedPaths = [
  'src/assets/splash.png',
  'android/app/src/main/res/drawable-mdpi/splashscreen_logo.png',
  'android/app/src/main/res/drawable-hdpi/splashscreen_logo.png',
  'android/app/src/main/res/drawable-xhdpi/splashscreen_logo.png',
  'android/app/src/main/res/drawable-xxhdpi/splashscreen_logo.png',
  'android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png'
];
for (const prohibitedPath of prohibitedPaths) {
  if (exists(prohibitedPath)) fail(`legacy asset remains active at ${prohibitedPath}`);
}

const activeLaunchConfiguration = [
  JSON.stringify(appConfig.expo?.splash),
  iosStoryboard,
  iosColor,
  androidManifest,
  androidStyles,
  androidColors,
  androidBackground
].join('\n');
for (const marker of [
  'src/assets/splash.png',
  'splashscreen_logo',
  'SplashScreenLegacy'
]) {
  rejectText(activeLaunchConfiguration, marker, 'active launch configuration');
}

const logoPath = path.join(root, 'src/assets/brand/fiteatsy-logo.svg');
const logoHash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(logoPath))
  .digest('hex');
if (logoHash !== '59bdffba51d80546750862b5366bde6ec06e6cb9f7b92c19bc99be0a2b7aab0e') {
  fail(`official logo hash changed (${logoHash})`);
}

console.log(`Frozen splash contract verified at ${root}`);
