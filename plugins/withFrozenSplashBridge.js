const { withFinalizedMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const IOS_STORYBOARD = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="24093.7" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="EXPO-VIEWCONTROLLER-1">
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="24053.1"/>
        <capability name="Named colors" minToolsVersion="9.0"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EXPO-SCENE-1">
            <objects>
                <viewController storyboardIdentifier="SplashScreenViewController" id="EXPO-VIEWCONTROLLER-1" sceneMemberID="viewController">
                    <view key="view" userInteractionEnabled="NO" contentMode="scaleToFill" insetsLayoutMarginsFromSafeArea="NO" id="EXPO-ContainerView" userLabel="ContainerView">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" flexibleMaxX="YES" flexibleMaxY="YES"/>
                        <viewLayoutGuide key="safeArea" id="Rmq-lb-GrQ"/>
                        <color key="backgroundColor" name="SplashScreenBackground"/>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="EXPO-PLACEHOLDER-1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="0.0" y="0.0"/>
        </scene>
    </scenes>
    <resources>
        <namedColor name="SplashScreenBackground">
            <color alpha="1.000" white="0.000" colorSpace="custom" customColorSpace="genericGamma22GrayColorSpace"/>
        </namedColor>
    </resources>
</document>
`;

const IOS_BLACK_COLORSET = `${JSON.stringify(
  {
    colors: [
      {
        color: {
          components: {
            alpha: '1.000',
            blue: '0.000',
            green: '0.000',
            red: '0.000'
          },
          'color-space': 'srgb'
        },
        idiom: 'universal'
      }
    ],
    info: { version: 1, author: 'expo' }
  },
  null,
  2
)}\n`;

const ANDROID_BLACK_BACKGROUND = `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background"/>
</layer-list>
`;

const withFrozenSplashBridge = config => {
  config = withFinalizedMod(config, [
    'ios',
    async modConfig => {
      const iosRoot = modConfig.modRequest.platformProjectRoot;
      const projectName = modConfig.modRequest.projectName;
      const projectRoot = path.join(iosRoot, projectName);
      const colorSetRoot = path.join(
        projectRoot,
        'Images.xcassets',
        'SplashScreenBackground.colorset'
      );
      fs.mkdirSync(colorSetRoot, { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'SplashScreen.storyboard'), IOS_STORYBOARD);
      fs.writeFileSync(path.join(colorSetRoot, 'Contents.json'), IOS_BLACK_COLORSET);
      return modConfig;
    }
  ]);

  return withFinalizedMod(config, [
    'android',
    async modConfig => {
      const resourcesRoot = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res'
      );
      const drawableRoot = path.join(resourcesRoot, 'drawable');
      fs.mkdirSync(drawableRoot, { recursive: true });
      fs.writeFileSync(
        path.join(drawableRoot, 'ic_launcher_background.xml'),
        ANDROID_BLACK_BACKGROUND
      );
      for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
        const legacyLogo = path.join(
          resourcesRoot,
          `drawable-${density}`,
          'splashscreen_logo.png'
        );
        if (fs.existsSync(legacyLogo)) fs.rmSync(legacyLogo);
      }
      return modConfig;
    }
  ]);
};

module.exports = withFrozenSplashBridge;
