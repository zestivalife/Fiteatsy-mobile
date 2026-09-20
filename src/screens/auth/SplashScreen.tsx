import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import FiteatsyLogo from '../../assets/brand/fiteatsy-logo.svg';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { getOnboardingRuntimeProgress } from '../../services/onboardingRuntimeProgress';
import { traceSessionLifecycle } from '../../services/sessionLifecycleTrace';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export const SPLASH_MAX_DURATION_MS = 10_000;
export const SPLASH_MIN_DURATION_MS = 1_200;
const EXIT_FADE_DURATION = 320;
const LOGO_ANIMATION_DURATION = 640;

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

  const requestExit = useCallback((forced = false) => {
    if (forced) setForceExit(true);
    setExitRequested(true);
  }, []);

  const transitionTo = useCallback((navigate: () => void) => {
    Animated.timing(screenOpacity, {
      toValue: 0,
      duration: EXIT_FADE_DURATION,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) navigate();
    });
  }, [screenOpacity]);

  const resolveAndNavigate = useCallback(async () => {
    if (!isAuthenticated) {
      traceSessionLifecycle('NAVIGATION_LOGIN');
      transitionTo(() => navigation.replace('SignIn'));
      return;
    }

    // A returning user's remotely unresolved onboarding state must never reopen
    // onboarding or block the authenticated shell. UNKNOWN is not INCOMPLETE.
    if (onboardingStatus === 'UNKNOWN') {
      traceSessionLifecycle('NAVIGATION_HOME', { onboardingState: 'UNKNOWN_LOCAL_SESSION' });
      transitionTo(() => navigation.replace('Main'));
      return;
    }

    const progress = onboardingStatus === 'COMPLETED'
      ? null
      : await getOnboardingRuntimeProgress(authSession?.client.fiteatsyClientId);
    if (onboardingStatus !== 'COMPLETED' && progress?.phase === 'food') {
      transitionTo(() => navigation.replace('FoodPreferences', { mode: 'onboarding', lifestyle: progress.lifestyle }));
      return;
    }
    if (onboardingStatus !== 'COMPLETED' && progress?.phase === 'recovery') {
      transitionTo(() => navigation.replace('OnboardingAssessment', { startPhase: 'recovery', lifestyle: progress.lifestyle }));
      return;
    }
    if (onboardingStatus !== 'COMPLETED' && progress?.phase === 'connect') {
      transitionTo(() => navigation.replace('HealthDataSync', { entryContext: 'ONBOARDING' }));
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
    if (onboardingStatus === 'IN_PROGRESS' && onboardingResumeStep === 'anthropometrics') {
      transitionTo(() => navigation.replace('OnboardingAnthropometrics'));
      return;
    }
    traceSessionLifecycle('NAVIGATION_HOME', { onboardingState: onboardingStatus });
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

    const minimumDurationTimer = setTimeout(() => requestExit(false), SPLASH_MIN_DURATION_MS);
    const maximumDurationTimer = setTimeout(() => requestExit(true), SPLASH_MAX_DURATION_MS);

    return () => {
      mounted = false;
      clearTimeout(minimumDurationTimer);
      clearTimeout(maximumDurationTimer);
      logoOpacity.stopAnimation();
      logoTranslateY.stopAnimation();
      logoScale.stopAnimation();
      screenOpacity.stopAnimation();
    };
  }, [logoOpacity, logoScale, logoTranslateY, requestExit, screenOpacity]);

  useEffect(() => {
    if (!exitRequested || navigated.current || (!bootstrapped && !forceExit)) return;
    navigated.current = true;
    void resolveAndNavigate();
  }, [bootstrapped, exitRequested, forceExit, isAuthenticated, onboardingStatus, resolveAndNavigate]);

  const logoWidth = Math.min(width * 0.72, 480);
  const logoTop = Math.max(height * 0.16, 96);

  return (
    <Animated.View style={[styles.screen, { opacity: screenOpacity }]}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
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
  logo: {
    position: 'absolute',
    alignSelf: 'center',
    aspectRatio: 1731 / 462
  }
});
