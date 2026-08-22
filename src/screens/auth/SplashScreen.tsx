import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import FiteatsyLogo from '../../assets/brand/fiteatsy-logo.svg';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { getOnboardingRuntimeProgress } from '../../services/onboardingRuntimeProgress';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export const SPLASH_MAX_DURATION_MS = 10_000;
const EXIT_FADE_DURATION = 320;
const LOGO_ANIMATION_DURATION = 640;
const VIDEO_URL = 'https://zestiva.life/assets/Fiteatsy.mp4';

export const SplashScreen = ({ navigation }: Props) => {
  const { isAuthenticated, bootstrapped, onboardingStatus, onboardingResumeStep, authSession } = useAppContext();
  const { width, height } = useWindowDimensions();
  const [exitRequested, setExitRequested] = useState(false);
  const [forceExit, setForceExit] = useState(false);
  const navigated = useRef(false);
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(8)).current;
  const logoScale = useRef(new Animated.Value(0.97)).current;

  const player = useVideoPlayer({ uri: VIDEO_URL }, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = true;
    videoPlayer.allowsExternalPlayback = false;
    videoPlayer.staysActiveInBackground = false;
    videoPlayer.play();
  });

  const requestExit = useCallback((forced = false) => {
    if (forced) setForceExit(true);
    setExitRequested(true);
  }, []);

  const pauseVideo = useCallback(() => {
    try {
      player.pause();
    } catch {
      // The native player may already be released during a development reload.
    }
  }, [player]);

  const transitionTo = useCallback((navigate: () => void) => {
    pauseVideo();
    Animated.timing(screenOpacity, {
      toValue: 0,
      duration: EXIT_FADE_DURATION,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) navigate();
    });
  }, [pauseVideo, screenOpacity]);

  const resolveAndNavigate = useCallback(async () => {
    if (!isAuthenticated) {
      transitionTo(() => navigation.replace('SignIn'));
      return;
    }

    const progress = await getOnboardingRuntimeProgress(authSession?.client.fiteatsyClientId);
    if (onboardingStatus !== 'COMPLETED' && progress?.phase === 'food') {
      transitionTo(() => navigation.replace('FoodPreferences', { mode: 'onboarding', lifestyle: progress.lifestyle }));
      return;
    }
    if (onboardingStatus !== 'COMPLETED' && progress?.phase === 'recovery') {
      transitionTo(() => navigation.replace('OnboardingAssessment', { startPhase: 'recovery', lifestyle: progress.lifestyle }));
      return;
    }
    if (progress?.phase === 'connect') {
      transitionTo(() => navigation.replace('SyncWearable'));
      return;
    }
    if (onboardingStatus === 'NOT_STARTED' || onboardingResumeStep === 'basics') {
      transitionTo(() => navigation.replace('OnboardingBasics'));
      return;
    }
    if (onboardingStatus === 'IN_PROGRESS' && onboardingResumeStep === 'assessment') {
      transitionTo(() => navigation.replace('OnboardingAssessment', { startPhase: 'lifestyle' }));
      return;
    }
    transitionTo(() => navigation.replace('Main'));
  }, [
    authSession?.client.fiteatsyClientId,
    isAuthenticated,
    navigation,
    onboardingResumeStep,
    onboardingStatus,
    transitionTo
  ]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted) return;
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: reduceMotion ? 320 : LOGO_ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(logoTranslateY, {
          toValue: 0,
          duration: reduceMotion ? 0 : LOGO_ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: reduceMotion ? 0 : LOGO_ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]).start();
    });

    const maximumDurationTimer = setTimeout(() => requestExit(true), SPLASH_MAX_DURATION_MS);
    const endedSubscription = player.addListener('playToEnd', () => requestExit());
    const statusSubscription = player.addListener('statusChange', ({ status, error }) => {
      if (status !== 'error') return;
      console.warn('[VideoIntro] playback failed; continuing with branded fallback', error?.message ?? 'unknown_error');
      requestExit();
    });

    return () => {
      mounted = false;
      clearTimeout(maximumDurationTimer);
      endedSubscription.remove();
      statusSubscription.remove();
      logoOpacity.stopAnimation();
      logoTranslateY.stopAnimation();
      logoScale.stopAnimation();
      screenOpacity.stopAnimation();
      pauseVideo();
    };
  }, [logoOpacity, logoScale, logoTranslateY, pauseVideo, player, requestExit, screenOpacity]);

  useEffect(() => {
    if (!exitRequested || navigated.current || (!bootstrapped && !forceExit)) return;
    navigated.current = true;
    void resolveAndNavigate();
  }, [bootstrapped, exitRequested, forceExit, resolveAndNavigate]);

  const logoWidth = Math.min(width * 0.72, 480);
  const logoTop = Math.max(height * 0.16, 96);

  return (
    <Animated.View style={[styles.screen, { opacity: screenOpacity }]}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <VideoView
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
        showsTimecodes={false}
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
      />
      <View pointerEvents="none" style={styles.overlay} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.logo,
          {
            top: logoTop,
            width: logoWidth,
            opacity: logoOpacity,
            transform: [{ translateY: logoTranslateY }, { scale: logoScale }]
          }
        ]}
      >
        <FiteatsyLogo width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden'
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.70)'
  },
  logo: {
    position: 'absolute',
    alignSelf: 'center',
    aspectRatio: 1731 / 462
  }
});
