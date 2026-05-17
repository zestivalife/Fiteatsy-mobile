import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { colors } from '../../design/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

const INTRO_DURATION_MS = 1800;
const WORDMARK_RATIO = 1212 / 324;

const FiteatsyWordmark = ({ width }: { width: number }) => {
  const height = width / WORDMARK_RATIO;

  return (
    <Svg width={width} height={height} viewBox="0 0 1212 324" fill="none">
      <Path d="M1037.81 323.074V276.407C1066.17 276.407 1082.68 265.638 1093.45 239.792L1104.58 213.587H1068.32L1012.68 82.5625H1063.65L1112.11 196.357L1160.22 82.5625H1211.19L1139.04 252.356C1117.86 301.894 1087.7 323.074 1037.81 323.074Z" fill="#151515" />
      <Path d="M997.809 145.386H951.143C951.143 131.386 938.938 122.053 920.271 122.053C905.553 122.053 895.143 128.515 895.143 137.489C895.143 165.848 1008.94 173.027 1008.94 254.873H962.271C962.271 203.54 848.477 206.771 848.477 137.489C848.477 103.746 879.707 78.9766 922.425 78.9766C966.937 78.9766 997.809 106.258 997.809 145.386ZM875.04 204.617C890.476 204.617 902.322 216.463 902.322 231.899C902.322 246.975 890.476 258.463 875.04 258.463C859.964 258.463 848.477 246.975 848.477 231.899C848.477 216.463 859.964 204.617 875.04 204.617Z" fill="#151515" />
      <Path d="M743.67 129.231H605.106C581.414 129.231 563.825 147.18 563.825 170.513C563.825 194.205 581.414 211.795 605.106 211.795C628.439 211.795 646.388 194.205 646.388 170.513V150.769H693.054V182.718C693.054 200.667 704.183 211.795 722.849 211.795V258.461C699.516 258.461 679.414 249.487 665.773 234.769C649.978 249.487 628.798 258.461 605.106 258.461C555.927 258.461 517.158 219.692 517.158 170.513C517.158 121.334 555.568 82.5648 605.106 82.5648H743.67V35.8984H790.336V82.5648H824.438V129.231H790.336V174.821C790.336 194.923 803.977 208.205 824.438 208.205V254.871C777.772 254.871 743.67 221.487 743.67 175.18V129.231Z" fill="#60AF00" />
      <Path d="M317.69 168.72C317.69 116.669 355.024 78.9766 406.716 78.9766C458.407 78.9766 495.741 116.669 495.741 168.72C495.741 171.95 495.382 176.617 494.664 181.284H366.152C371.177 199.232 387.331 211.796 407.433 211.796C419.997 211.796 430.767 207.13 438.305 199.232H491.074C479.946 235.847 447.279 258.463 406.716 258.463C354.665 258.463 317.69 221.129 317.69 168.72ZM368.306 150.412H446.92C440.1 135.335 425.382 125.643 407.433 125.643C389.485 125.643 374.767 135.335 368.306 150.412Z" fill="#60AF00" />
      <Path d="M197.365 129.231V82.5648H218.904V35.8984H265.57V82.5648H299.672V129.231H265.57V174.821C265.57 194.923 279.211 208.205 299.672 208.205V254.871C253.006 254.871 218.904 221.487 218.904 175.18V129.231H197.365Z" fill="#151515" />
      <Path d="M148.973 0C165.486 0 177.691 12.205 177.691 28.7178C177.691 45.2305 165.486 57.4355 148.973 57.4355C132.461 57.4355 120.256 45.2305 120.256 28.7178C120.256 12.205 132.461 0 148.973 0ZM102.307 3.58972V50.2561C80.4097 50.2561 68.2047 61.7432 68.2047 82.5636H102.307V129.23H68.2047V254.87H21.5383V129.23H0V82.5636H21.5383C21.5383 35.1793 53.8458 3.58972 102.307 3.58972ZM125.64 254.87V82.5636H172.307V254.87H125.64Z" fill="#151515" />
    </Svg>
  );
};

export const SplashScreen = ({ navigation }: Props) => {
  const { onboarding, isAuthenticated, assessment, bootstrapped } = useAppContext();
  const { width } = useWindowDimensions();

  const introOpacity = useRef(new Animated.Value(0)).current;
  const introScale = useRef(new Animated.Value(0.96)).current;
  const glowOpacity = useRef(new Animated.Value(0.3)).current;
  const sweepX = useRef(new Animated.Value(-260)).current;
  const bgShift = useRef(new Animated.Value(0)).current;
  const navigated = useRef(false);

  useEffect(() => {
    const startAnimations = () => {
      introOpacity.setValue(0);
      introScale.setValue(0.96);
      glowOpacity.setValue(0.3);
      sweepX.setValue(-260);
      bgShift.setValue(0);

      Animated.parallel([
        Animated.timing(introOpacity, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.sequence([
          Animated.timing(introScale, {
            toValue: 1.02,
            duration: 540,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(introScale, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true
          })
        ]),
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 0.72,
            duration: 460,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.38,
            duration: 380,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.66,
            duration: 360,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.38,
            duration: 320,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          })
        ]),
        Animated.timing(sweepX, {
          toValue: 260,
          duration: 1200,
          delay: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(bgShift, {
          toValue: 1,
          duration: INTRO_DURATION_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ]).start();
    };

    if (!bootstrapped) {
      return;
    }

    startAnimations();

    const timer = setTimeout(() => {
      if (navigated.current) {
        return;
      }

      navigated.current = true;

      if (!assessment) {
        navigation.replace('OnboardingAssessment');
        return;
      }

      if (!onboarding) {
        navigation.replace('OnboardingBasics');
        return;
      }

      if (!isAuthenticated) {
        navigation.replace('SignIn');
        return;
      }

      navigation.replace('Main');
    }, INTRO_DURATION_MS);

    return () => {
      clearTimeout(timer);
      introOpacity.stopAnimation();
      introScale.stopAnimation();
      glowOpacity.stopAnimation();
      sweepX.stopAnimation();
      bgShift.stopAnimation();
    };
  }, [assessment, bootstrapped, introOpacity, introScale, isAuthenticated, navigation, onboarding, glowOpacity, sweepX, bgShift]);

  const logoWidth = Math.min(width * 0.78, 420);

  const bgTranslateX = bgShift.interpolate({
    inputRange: [0, 1],
    outputRange: [-32, 32]
  });

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.backgroundDriftLayer, { transform: [{ translateX: bgTranslateX }] }]}>
        <LinearGradient colors={['#323232', '#151515', '#151515']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bgFill}>
          <View style={[styles.softBlob, styles.blobTop]} />
          <View style={[styles.softBlob, styles.blobMid]} />
          <View style={[styles.softBlob, styles.blobBottom]} />
        </LinearGradient>
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerWrap}>
          <Animated.View style={[styles.logoHalo, { opacity: glowOpacity }]} />

          <Animated.View
            style={[
              styles.logoCard,
              {
                opacity: introOpacity,
                transform: [{ scale: introScale }]
              }
            ]}
          >
            <Animated.View style={[styles.sweep, { transform: [{ translateX: sweepX }] }]} />
            <FiteatsyWordmark width={logoWidth} />
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    overflow: 'hidden'
  },
  safeArea: {
    flex: 1
  },
  backgroundDriftLayer: {
    ...StyleSheet.absoluteFillObject,
    left: -24,
    right: -24
  },
  bgFill: {
    flex: 1
  },
  softBlob: {
    position: 'absolute',
    borderRadius: 999
  },
  blobTop: {
    width: 280,
    height: 280,
    top: -70,
    right: -40,
    backgroundColor: 'rgba(198, 255, 133, 0.33)'
  },
  blobMid: {
    width: 340,
    height: 340,
    top: '30%',
    left: -120,
    backgroundColor: 'rgba(232, 255, 205, 0.55)'
  },
  blobBottom: {
    width: 320,
    height: 320,
    bottom: -110,
    right: -90,
    backgroundColor: 'rgba(211, 255, 160, 0.4)'
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoHalo: {
    position: 'absolute',
    width: 440,
    height: 140,
    borderRadius: 140,
    backgroundColor: 'rgba(204, 255, 163, 0.5)'
  },
  logoCard: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(168, 214, 104, 0.5)',
    overflow: 'hidden'
  },
  sweep: {
    position: 'absolute',
    top: -20,
    width: 120,
    height: 220,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    transform: [{ rotate: '16deg' }]
  }
});
