import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop, SvgProps } from 'react-native-svg';
import { canonicalHealthStatusLabel } from '@fiteatsy/health-intelligence';
import { AppBackground } from '../../components/AppBackground';
import AssistIcon from '../../assets/fiteatsy-home/assist.svg';
import WearableSyncIcon from '../../assets/fiteatsy-home/wearable-sync.svg';
import ProgressDonutChartAsset from '../../assets/fiteatsy-home/progress-donut-chart.svg';
import { MainTabParamList, RootStackParamList } from '../../navigation/types';
import { getDraftAssessmentSession, getLatestAssessmentResult } from '../../services/assessmentService';
import { useAppContext } from '../../state/AppContext';
import { useCanonicalHealthSyncCoordinator } from '../../services/canonicalHealthSyncCoordinator';
import { getMySubscription } from '../../services/subscriptionService';
import { getNutritionExperience, type NutritionExperience } from '../../services/nutritionExperienceService';
import {
  getHealthScoreHistory,
} from '../../services/healthIntelligenceService';
import type { Medication, MedicationLogStatus } from '../../types';
import { nutritionDate, subscribeToNutritionDay } from '../../utils/nutritionDate';
import { resolveClientFirstName } from '../../utils/clientIdentity';
import { useProfilePhoto } from '../../hooks/useProfilePhoto';
import {
  buildPss10StressContext,
  formatPss10Change,
  formatPss10LastChecked,
  type Pss10StressContext
} from '../../utils/pss10StressContext';

const trendDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DONUT_ASSET_SIZE = 236;
const DONUT_VIEWBOX_SIZE = 276;
const DONUT_ART_CENTER = 126;
const DONUT_ART_CENTER_OFFSET =
  DONUT_ASSET_SIZE * ((DONUT_VIEWBOX_SIZE / 2 - DONUT_ART_CENTER) / DONUT_VIEWBOX_SIZE);
const SIDE_NODE_STEP = 70 * 0.1;
const LOWER_NODE_OFFSET = 70 * 0.4;
const CENTRAL_CIRCLE_OFFSET = DONUT_ASSET_SIZE * 0.05;
const CORE_SIZE = 126;
const SCORE_ARC_SIZE = 178;
const SCORE_ARC_RADIUS = 59;
const SCORE_ARC_STROKE_WIDTH = 17;
const SCORE_ARC_CIRCUMFERENCE = 2 * Math.PI * SCORE_ARC_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
export const STAR_ORB_PATH = 'M151.923 102.197C167.069 87.7458 174.642 80.5201 183.297 77.7974C190.915 75.4008 199.085 75.4008 206.703 77.7974C215.358 80.5201 222.931 87.7458 238.077 102.197L269.599 132.274C271.87 134.442 273.006 135.526 274.221 136.512C275.3 137.388 276.426 138.205 277.592 138.961C278.905 139.812 280.287 140.557 283.051 142.048L321.396 162.732C339.821 172.671 349.033 177.64 354.297 185.03C358.93 191.535 361.455 199.306 361.53 207.291C361.615 216.364 357.083 225.799 348.019 244.669L329.155 283.943C327.796 286.773 327.116 288.188 326.554 289.648C326.054 290.945 325.624 292.268 325.266 293.611C324.863 295.123 324.581 296.667 324.017 299.756L316.194 342.617C312.435 363.211 310.556 373.508 305.154 380.798C300.4 387.215 293.79 392.017 286.218 394.556C277.615 397.441 267.242 396.046 246.494 393.257L203.314 387.452C200.202 387.034 198.646 386.825 197.084 386.741C195.696 386.667 194.304 386.667 192.916 386.741C191.354 386.825 189.798 387.034 186.686 387.452L143.506 393.257C122.758 396.046 112.385 397.441 103.782 394.556C96.2102 392.017 89.6004 387.215 84.8458 380.798C79.444 373.508 77.5647 363.211 73.806 342.617L65.9832 299.756C65.4194 296.667 65.1375 295.123 64.7343 293.611C64.3759 292.268 63.9461 290.945 63.4465 289.648C62.8843 288.188 62.2045 286.773 60.845 283.943L41.9807 244.669C32.9169 225.799 28.3849 216.364 28.47 207.291C28.5449 199.306 31.0697 191.535 35.703 185.03C40.9671 177.64 50.1793 172.671 68.6036 162.732L106.949 142.048C109.713 140.557 111.095 139.812 112.408 138.961C113.574 138.205 114.7 137.388 115.779 136.512C116.994 135.526 118.13 134.442 120.401 132.274L151.923 102.197Z';
const STAR_ORB_PERIMETER_WIDTH = 2;
const STAR_ORB_MOTION_DURATION_MS = 3500;
const STAR_ORB_PATH_LENGTH = 1140;
const STAR_ORB_NEON_PALETTE = ['#39F3FF', '#4D7CFF', '#FF4FD8', '#A970FF', '#7CFF00', '#7B61FF', '#39F3FF'] as const;

const font = {
  regular: 'Exo_400Regular',
  medium: 'Exo_500Medium',
  semiBold: 'Exo_600SemiBold',
  bold: 'Exo_700Bold'
} as const;

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Journey'>,
  NativeStackNavigationProp<RootStackParamList>
>;
type MetricKey = 'healthIntelligence' | 'recovery' | 'sleep' | 'activity' | 'nourishment' | 'calm';
type SvgAsset = React.FC<SvgProps>;
type RecoveryMetric = {
  key: Exclude<MetricKey, 'healthIntelligence'>;
  label: string;
  score: number | null;
  color: string;
  position: 'recovery' | 'activity' | 'nourishment' | 'calm' | 'sleep';
  icon: keyof typeof Ionicons.glyphMap;
};

type MedicationTimelineEntry = {
  medication: Medication;
  scheduledForISO: string;
  status: MedicationLogStatus;
};

const trendTone = (value: number) => {
  if (value >= 80) return { bg: '#88FF74', text: '#111111' };
  if (value >= 60) return { bg: '#B7FE67', text: '#111111' };
  if (value >= 25) return { bg: '#74D8F5', text: '#111111' };
  if (value > 0) return { bg: '#FFB8BC', text: '#111111' };
  return { bg: '#050505', text: '#FFFFFF' };
};

export const frameworkStatusLabel = canonicalHealthStatusLabel;

const stateFromScore = (score: number | null, status?: string | null) => {
  if (score == null) return { label: frameworkStatusLabel(status) };
  if (score >= 80) return { label: 'Strong Today' };
  if (score >= 55) return { label: 'Borderline' };
  return { label: 'Lower Today' };
};

const arcGradientForMetric = (key: MetricKey) => {
  switch (key) {
    case 'activity':
      return ['#FF8A1E', '#A74200'];
    case 'nourishment':
      return ['#96FF45', '#2F9400'];
    case 'calm':
      return ['#9B70FF', '#763CEF'];
    case 'sleep':
      return ['#2E92FF', '#0643B5'];
    case 'recovery':
    case 'healthIntelligence':
    default:
      return ['#F4052D', '#8C071E'];
  }
};

const normalizeScore = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
};

export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const health = useCanonicalHealthSyncCoordinator();
  const {
    authSession,
    getMedicationTimelineForDate
  } = useAppContext();
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('healthIntelligence');
  const [dailyNutrition, setDailyNutrition] = useState<NutritionExperience | null>(null);
  const [recoveryTrend, setRecoveryTrend] = useState<number[]>([]);
  const [pss10Context, setPss10Context] = useState<Pss10StressContext>(() =>
    buildPss10StressContext({ latestResult: null, previousResult: null, draft: null })
  );
  const sessionToken = authSession?.sessionToken;
  const profilePhoto = useProfilePhoto(authSession?.accountId ?? '');
  const hasAuthSession = Boolean(authSession);

  const openAssist = useCallback(async () => {
    try {
      const subscription = await getMySubscription();
      const hasAssist = subscription.entitlements.AI_ASSIST?.value === true;

      if (['PENDING', 'PAYMENT_PENDING', 'PROCESSING'].includes(subscription.status)) {
        navigation.navigate('SubscriptionPaymentPlaceholder', {
          status: subscription.status as 'PENDING' | 'PAYMENT_PENDING' | 'PROCESSING',
          returnDestination: 'AssistHub'
        });
        return;
      }

      if (subscription.status === 'PAYMENT_FAILED') {
        navigation.navigate('SubscriptionPaymentPlaceholder', { status: 'PAYMENT_FAILED', returnDestination: 'AssistHub' });
        return;
      }

      if (hasAssist && ['ACTIVE', 'EXPIRING_SOON', 'CANCELLED'].includes(subscription.status)) {
        navigation.navigate('AssistHub');
        return;
      }

      navigation.navigate('SubscriptionPlans', {
        source: 'assist',
        requiredEntitlement: 'AI_ASSIST',
        returnDestination: 'AssistHub'
      });
    } catch {
      Alert.alert('Subscription unavailable', 'We could not check Assist access right now. Please try again.');
    }
  }, [navigation]);

  const refreshPss10Context = useCallback(async () => {
    if (!hasAuthSession || !sessionToken) {
      setPss10Context(buildPss10StressContext({ latestResult: null, previousResult: null, draft: null }));
      return;
    }

    try {
      const [latestResponse, draftResponse] = await Promise.all([
        getLatestAssessmentResult(sessionToken),
        getDraftAssessmentSession(sessionToken)
      ]);
      setPss10Context(
        buildPss10StressContext({
          latestResult: latestResponse.result,
          previousResult: latestResponse.previousResult,
          draft: draftResponse.session
        })
      );
    } catch {
      // Keep the last known completed result when a focus refresh is unavailable.
    }
  }, [hasAuthSession, sessionToken]);

  const refreshDailyNutrition = useCallback(async () => {
    if (!hasAuthSession) {
      setDailyNutrition(null);
      return;
    }
    try {
      setDailyNutrition(await getNutritionExperience(nutritionDate()));
    } catch {
      setDailyNutrition(null);
    }
  }, [hasAuthSession]);

  const refreshHealthScores = useCallback(async () => {
    if (!hasAuthSession) {
      setRecoveryTrend([]);
      return;
    }
    try {
      const history = await getHealthScoreHistory('recovery');
      setRecoveryTrend(
        history.items
          .filter((item) => item.scoreStatus === 'calculated' && item.scoreValue != null)
          .sort((a, b) => (+new Date(a.calculatedAtISO)) - (+new Date(b.calculatedAtISO)))
          .slice(-7)
          .map((item) => normalizeScore(item.scoreValue))
          .filter((score): score is number => score != null)
      );
    } catch {
      // Keep the last canonical trend while temporarily offline.
    }
  }, [hasAuthSession]);

  useFocusEffect(
    useCallback(() => {
      void refreshPss10Context();
      void refreshDailyNutrition();
      void refreshHealthScores();
    }, [refreshDailyNutrition, refreshHealthScores, refreshPss10Context])
  );
  useEffect(
    () => subscribeToNutritionDay(() => {
      void refreshDailyNutrition();
      void refreshHealthScores();
    }),
    [refreshDailyNutrition, refreshHealthScores]
  );

  // The Star Orb is projected exclusively from the canonical intelligence
  // summary. Daily nutrition is a separate product surface, not a fallback
  // score authority.
  const metrics: RecoveryMetric[] = [
    {
      key: 'recovery',
      label: 'Recovery',
      score: normalizeScore(health.canonicalIntelligence?.scores.recovery.score),
      color: '#FF1717',
      position: 'recovery',
      icon: 'heart-outline'
    },
    {
      key: 'activity',
      label: 'Activity',
      score: normalizeScore(health.canonicalIntelligence?.scores.activity.score),
      color: '#F27A1A',
      position: 'activity',
      icon: 'walk-outline'
    },
    {
      key: 'nourishment',
      label: 'Nourishment',
      score: normalizeScore(health.canonicalIntelligence?.scores.nutrition.score),
      color: '#77FF22',
      position: 'nourishment',
      icon: 'nutrition-outline'
    },
    {
      key: 'calm',
      label: 'Calm',
      score: normalizeScore(health.canonicalIntelligence?.scores.calm.score),
      color: '#763CEF',
      position: 'calm',
      icon: 'leaf-outline'
    },
    {
      key: 'sleep',
      label: 'Sleep',
      score: normalizeScore(health.canonicalIntelligence?.scores.sleep.score),
      color: '#0F80FF',
      position: 'sleep',
      icon: 'moon-outline'
    },
  ];
  const displayMetrics = metrics;
  const trendValues = recoveryTrend;
  const hasTrendData = trendValues.length > 0;
  const healthIntelligenceScore = normalizeScore(health.canonicalIntelligence?.scores.healthIntelligence.score);

  const selected = selectedMetric === 'healthIntelligence'
    ? { label: 'Health Intelligence', score: healthIntelligenceScore, color: '#D5062D' }
    : displayMetrics.find((metric) => metric.key === selectedMetric) ?? { label: 'Health Intelligence', score: healthIntelligenceScore, color: '#D5062D' };
  const frameworkByMetric = health.canonicalIntelligence ? {
    healthIntelligence: health.canonicalIntelligence.scores.healthIntelligence,
    recovery: health.canonicalIntelligence.scores.recovery,
    sleep: health.canonicalIntelligence.scores.sleep,
    activity: health.canonicalIntelligence.scores.activity,
    nourishment: health.canonicalIntelligence.scores.nutrition,
    calm: health.canonicalIntelligence.scores.calm
  } : null;
  const selectedFramework = frameworkByMetric?.[selectedMetric];
  const selectedState = stateFromScore(selected.score, selectedFramework?.status);
  const todayMedicationTimeline = getMedicationTimelineForDate(new Date().toISOString());

  return (
    <AppBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.referenceFrame}>
            <HomeHeader
              name={resolveClientFirstName(authSession?.user.name)}
              photo={profilePhoto}
              onSearch={() => navigation.navigate('Search')}
              onAdd={() => navigation.navigate('Leadership')}
              onNotifications={() => navigation.navigate('Notifications')}
              onProfile={() => navigation.navigate('Profile')}
            />

            <RecoveryTrend values={trendValues} hasData={hasTrendData} />

            <RecoveryPanel
              metrics={displayMetrics}
              selectedMetric={selectedMetric}
              selectedLabel={selected.label}
              selectedScore={selected.score}
              selectedColor={selected.color}
              selectedState={selectedState}
              onSelectMetric={setSelectedMetric}
            />

            <View style={styles.actionRow}>
              <ActionPill
                label="Assist"
                Icon={AssistIcon}
                onPress={() => { void openAssist(); }}
              />
              <ActionPill
                label={health.providerState === 'CONNECTED' ? 'Sync Health' : 'Connect Health'}
                Icon={WearableSyncIcon}
                onPress={() => {
                  navigation.navigate('HealthDataSync');
                }}
              />
              <ActionPill label="Health Reports" Icon={ReportsActionIcon} onPress={() => navigation.navigate('Reports')} />
              <ActionPill label="Cycle" Icon={CycleActionIcon} onPress={() => navigation.navigate('Cycle')} />
            </View>

            <View style={styles.summaryRow}>
              <MedicationCard timeline={todayMedicationTimeline} onPress={() => navigation.navigate('MedicationCalendar')} />
              <StressCard
                pss10Context={pss10Context}
                onBreathingPress={() => navigation.navigate('BreathingSession')}
                onAssessmentPress={() => navigation.navigate('Pss10Assessment', pss10Context.available ? { mode: 'history' } : undefined)}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
};

const HomeHeader = ({
  name,
  photo,
  onSearch,
  onAdd,
  onNotifications,
  onProfile
}: {
  name: string;
  photo: string | null;
  onSearch: () => void;
  onAdd: () => void;
  onNotifications: () => void;
  onProfile: () => void;
}) => (
  <View style={styles.header}>
    <Text style={styles.headerGreeting} numberOfLines={1}>Hi, {name}</Text>
    <View style={styles.headerActions}>
      <HeaderIcon icon="search-outline" onPress={onSearch} />
      <HeaderIcon icon="trophy-outline" onPress={onAdd} />
      <HeaderIcon icon="notifications-outline" onPress={onNotifications} badge="9" />
      <Pressable onPress={onProfile} style={styles.avatar} accessibilityRole="button" accessibilityLabel="Open profile">
        {photo ? <Image source={{ uri: photo }} style={styles.headerAvatarImage} /> : <Ionicons name="person-outline" size={23} color="#EDF3EE" />}
      </Pressable>
    </View>
  </View>
);

const HeaderIcon = ({ icon, onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; badge?: string }) => (
  <Pressable onPress={onPress} style={styles.headerIcon} accessibilityRole="button">
    <Ionicons name={icon} size={22} color="#F4F7F4" />
    {badge ? (
      <View style={styles.headerBadge}>
        <Text style={styles.headerBadgeText}>{badge}</Text>
      </View>
    ) : null}
  </Pressable>
);

const RecoveryTrend = ({ values, hasData }: { values: number[]; hasData: boolean }) => (
  <View style={styles.trendCard}>
    <View style={styles.trendHeadingRow}>
      <Text style={styles.trendTitle}>7-Day Recovery</Text>
      {!hasData ? <Text style={styles.trendEmptyLabel}>Waiting for data</Text> : null}
    </View>
    <View style={styles.trendRow}>
      {trendDays.map((day, index) => {
        const value = values[index] ?? 0;
        const tone = trendTone(hasData ? value : 0);
        return (
          <View key={`${day}-${index}`} style={styles.trendItem}>
            {hasData ? <View style={[styles.trendPill, { backgroundColor: tone.bg }]}><Text style={[styles.trendValue, { color: tone.text }]}>{`${Math.round(value)}%`}</Text></View> : <View style={styles.trendEmptyDot} />}
            <Text style={styles.trendDay}>{day}</Text>
          </View>
        );
      })}
    </View>
  </View>
);

const ReportsActionIcon: SvgAsset = ({ width = 18, height = 18 }) => (
  <Ionicons name="document-text-outline" size={Math.min(Number(width), Number(height))} color="#FFFFFF" />
);

const CycleActionIcon: SvgAsset = ({ width = 18, height = 18 }) => (
  <Ionicons name="calendar-outline" size={Math.min(Number(width), Number(height))} color="#FFFFFF" />
);

const ActionPill = ({ label, Icon, onPress, disabled = false }: { label: string; Icon: SvgAsset; onPress: () => void; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[styles.actionPill, disabled && { opacity:0.65 }]} accessibilityRole="button">
    <Icon width={18} height={18} />
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.actionText}>{label}</Text>
  </Pressable>
);

export const useReducedMotionPreference = () => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
};

const StarOrbSurface = ({ reduceMotion }: { reduceMotion: boolean }) => {
  const perimeterProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    perimeterProgress.stopAnimation();
    if (reduceMotion) {
      perimeterProgress.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(perimeterProgress, {
        toValue: 1,
        duration: STAR_ORB_MOTION_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: false
      })
    );
    animation.start();
    return () => animation.stop();
  }, [perimeterProgress, reduceMotion]);

  const perimeterOffset = perimeterProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -STAR_ORB_PATH_LENGTH]
  });
  const perimeterColor = perimeterProgress.interpolate({
    inputRange: STAR_ORB_NEON_PALETTE.map((_, index) => index / (STAR_ORB_NEON_PALETTE.length - 1)),
    outputRange: [...STAR_ORB_NEON_PALETTE]
  });

  return (
    <Svg width="100%" height="100%" viewBox="0 0 390 473" pointerEvents="none" testID="star-orb-surface">
      <Defs>
        <SvgLinearGradient id="starOrbSurface" x1="390" y1="0" x2="0" y2="473" gradientUnits="userSpaceOnUse">
          <Stop offset="0.14" stopColor="#353A40" />
          <Stop offset="0.54" stopColor="#121416" />
        </SvgLinearGradient>
      </Defs>
      <Path d={STAR_ORB_PATH} fill="url(#starOrbSurface)" />
      <Path
        d={STAR_ORB_PATH}
        fill="none"
        stroke="#626B75"
        strokeOpacity={reduceMotion ? 0.68 : 0.3}
        strokeWidth={STAR_ORB_PERIMETER_WIDTH}
      />
      {!reduceMotion ? (
        <>
          <AnimatedPath
            d={STAR_ORB_PATH}
            fill="none"
            stroke={perimeterColor}
            strokeOpacity={0.2}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={`${STAR_ORB_PATH_LENGTH * 0.2} ${STAR_ORB_PATH_LENGTH * 0.8}`}
            strokeDashoffset={perimeterOffset}
          />
          <AnimatedPath
            d={STAR_ORB_PATH}
            fill="none"
            stroke={perimeterColor}
            strokeOpacity={0.82}
            strokeWidth={STAR_ORB_PERIMETER_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${STAR_ORB_PATH_LENGTH * 0.2} ${STAR_ORB_PATH_LENGTH * 0.8}`}
            strokeDashoffset={perimeterOffset}
          />
        </>
      ) : null}
    </Svg>
  );
};

const RecoveryPanel = ({
  metrics,
  selectedMetric,
  selectedLabel,
  selectedScore,
  selectedColor,
  selectedState,
  onSelectMetric
}: {
  metrics: RecoveryMetric[];
  selectedMetric: MetricKey;
  selectedLabel: string;
  selectedScore: number | null;
  selectedColor: string;
  selectedState: { label: string };
  onSelectMetric: (metric: MetricKey) => void;
}) => {
  const reduceMotion = useReducedMotionPreference();
  const clampedScore = selectedScore == null ? 0 : Math.max(0, Math.min(100, selectedScore));
  const scoreArcProgress = useRef(new Animated.Value(clampedScore)).current;
  const scoreArcOffset = scoreArcProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [SCORE_ARC_CIRCUMFERENCE, 0]
  });
  const [arcStart, arcEnd] = arcGradientForMetric(selectedMetric);

  useEffect(() => {
    Animated.timing(scoreArcProgress, {
      toValue: clampedScore,
      duration: 620,
      useNativeDriver: false
    }).start();
  }, [clampedScore, scoreArcProgress]);

  return (
    <View style={styles.recoveryPanel}>
      <View style={styles.recoveryStage}>
        <View style={styles.starShadow} pointerEvents="none">
          <StarOrbSurface reduceMotion={reduceMotion} />
        </View>
        <ProgressDonutChartAsset width={DONUT_ASSET_SIZE} height={DONUT_ASSET_SIZE} style={styles.progressDonutAsset} pointerEvents="none" />
        {selectedScore != null ? (
          <Svg
            width={SCORE_ARC_SIZE}
            height={SCORE_ARC_SIZE}
            viewBox={`0 0 ${SCORE_ARC_SIZE} ${SCORE_ARC_SIZE}`}
            style={styles.scoreArc}
            pointerEvents="none"
          >
            <Defs>
              <SvgLinearGradient id="homeRecoveryScoreArc" x1="42" y1="12" x2="135" y2="126" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={arcStart} />
                <Stop offset="1" stopColor={arcEnd} />
              </SvgLinearGradient>
            </Defs>
            <AnimatedCircle
              cx={SCORE_ARC_SIZE / 2}
              cy={SCORE_ARC_SIZE / 2}
              r={SCORE_ARC_RADIUS}
              fill="transparent"
              stroke="url(#homeRecoveryScoreArc)"
              strokeWidth={SCORE_ARC_STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${SCORE_ARC_CIRCUMFERENCE} ${SCORE_ARC_CIRCUMFERENCE}`}
              strokeDashoffset={scoreArcOffset}
              originX={SCORE_ARC_SIZE / 2}
              originY={SCORE_ARC_SIZE / 2}
              rotation="-72"
            />
          </Svg>
        ) : null}

        {metrics.map((metric) => (
          <RecoveryNode
            key={metric.key}
            metric={metric}
            selected={selectedMetric === metric.key}
            reduceMotion={reduceMotion}
            onPress={() => onSelectMetric(metric.key)}
          />
        ))}

        <Pressable
          onPress={() => onSelectMetric('healthIntelligence')}
          style={styles.coreCenter}
          accessibilityRole="button"
          accessibilityLabel="View today's Health Intelligence score"
        >
          <Text style={styles.coreScore}>{selectedScore == null ? '—' : `${selectedScore}`}</Text>
          <Text style={styles.coreLabel}>{selectedLabel}</Text>
          <View style={[styles.stateChip, { backgroundColor: selectedScore == null ? '#23272D' : selectedColor }]}>
            <Text style={styles.stateChipText}>{selectedState.label}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
};

const RecoveryNode = ({ metric, selected, reduceMotion, onPress }: { metric: RecoveryMetric; selected: boolean; reduceMotion: boolean; onPress: () => void }) => {
  const glowOpacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    glowOpacity.stopAnimation();
    if (!selected || reduceMotion) {
      glowOpacity.setValue(selected ? 1 : 0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [glowOpacity, reduceMotion, selected]);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.recoveryNode, nodePositions[metric.position]]}
      hitSlop={14}
      accessibilityRole="button"
      accessibilityLabel={`View today's ${metric.label} score`}
    >
      <View style={[styles.recoveryNodeIconBox, selected && { backgroundColor: `${metric.color}18` }]}>
        {selected ? (
          <Animated.View
            pointerEvents="none"
            testID={`selected-node-glow-${metric.key}`}
            style={[styles.selectedNodeGlow, { borderColor: metric.color, shadowColor: metric.color, opacity: glowOpacity }]}
          />
        ) : null}
        <Ionicons name={metric.icon} size={24} color={selected ? metric.color : '#B6BDC5'} />
      </View>
      <Text style={[styles.recoveryNodeLabel, selected && { color: metric.color }]}>{metric.label}</Text>
    </Pressable>
  );
};

const MedicationCard = ({ timeline, onPress }: { timeline: MedicationTimelineEntry[]; onPress: () => void }) => {
  const taken = timeline.filter((entry) => entry.status === 'taken').length;
  const pending = timeline.filter((entry) => entry.status === 'upcoming' || entry.status === 'snoozed').length;
  const missed = timeline.filter((entry) => entry.status === 'missed' || entry.status === 'skipped').length;
  const total = Math.max(1, timeline.length);

  return (
  <Pressable onPress={onPress} style={styles.infoCard} accessibilityRole="button" accessibilityLabel="Open medication logs">
    <View style={styles.cardTitleRow}>
      <Text style={styles.cardTitle}>Medication</Text>
      <Ionicons name="medical-outline" size={22} color="#F4F7F4" />
    </View>
    <View style={styles.medicationMetrics}>
      {[
        [`${taken}/${total}`, 'Taken'],
        [`${pending}/${total}`, 'Pending'],
        [`${missed}/${total}`, 'Missed']
      ].map(([value, label], index) => (
        <View key={label} style={[styles.medMetric, index > 0 && styles.medMetricDivider]}>
          <Text style={styles.medValue}>{value}</Text>
          <Text style={styles.medLabel}>{label}</Text>
        </View>
      ))}
    </View>
    <Text style={styles.cardAction}>Medication Logs +</Text>
  </Pressable>
  );
};

const StressCard = ({
  pss10Context,
  onBreathingPress,
  onAssessmentPress
}: {
  pss10Context: Pss10StressContext;
  onBreathingPress: () => void;
  onAssessmentPress: () => void;
}) => {
  const changeText = formatPss10Change(pss10Context.change);
  const lastCheckedText = formatPss10LastChecked(pss10Context.completedAtISO);
  const actionText = pss10Context.available ? 'View Stress Test' : pss10Context.hasDraft ? 'Continue Stress Test' : 'Take Stress Test';
  const stateText = pss10Context.available ? `${pss10Context.score} / ${pss10Context.maxScore}` : 'Not assessed yet';
  const supportText = pss10Context.available
    ? (lastCheckedText ?? 'Complete a quick stress check to establish your baseline.')
    : 'Complete a quick stress check to establish your baseline.';

  return (
    <View style={[styles.infoCard, styles.stressInfoCard]}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>Stress Recovery</Text>
        <Ionicons name="headset-outline" size={20} color="#F4F7F4" />
      </View>
      <Text style={styles.stressLabel}>Stress Test</Text>
      <View style={styles.stressValueRow}>
        <Text style={styles.stressValue}>{stateText}</Text>
        {pss10Context.available && changeText ? <Text style={styles.stressTrend}>{changeText}</Text> : null}
      </View>
      <Text style={styles.stressSupportText} numberOfLines={2}>{supportText}</Text>
      {pss10Context.hasDraft && !pss10Context.available ? (
        <Text style={styles.stressDraftText} numberOfLines={1}>{pss10Context.draftAnsweredCount} responses saved.</Text>
      ) : null}
      <View style={styles.stressActionRow}>
        <Pressable
          style={styles.stressPrimaryAction}
          onPress={onAssessmentPress}
          accessibilityRole="button"
          accessibilityLabel={actionText}
        >
          <Text style={styles.stressPrimaryActionText}>{actionText}</Text>
          <Ionicons name="arrow-forward" size={12} color="#C9C7FF" />
        </Pressable>
        <Pressable
          style={styles.stressSecondaryAction}
          onPress={onBreathingPress}
          accessibilityRole="button"
          accessibilityLabel="Breathe"
        >
          <Text style={styles.stressSecondaryActionText}>Breathe</Text>
        </Pressable>
      </View>
    </View>
  );
};

const nodePositions = StyleSheet.create({
  recovery: {
    left: '50%',
    top: '16%'
  },
  nourishment: {
    left: '82%',
    top: '40%',
    transform: [{ translateY: SIDE_NODE_STEP }]
  },
  sleep: {
    left: '72%',
    top: '74%',
    transform: [{ translateY: LOWER_NODE_OFFSET }]
  },
  calm: {
    left: '28%',
    top: '74%',
    transform: [{ translateY: LOWER_NODE_OFFSET }]
  },
  activity: {
    left: '18%',
    top: '40%',
    transform: [{ translateY: SIDE_NODE_STEP }]
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  screenGradient: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 112
  },
  referenceFrame: {
    width: '100%',
    maxWidth: 390,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingTop: 0
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerGreeting: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: font.semiBold,
    fontSize: 15,
    lineHeight: 19
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#303642',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#153923',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  headerAvatarImage: { width: '100%', height: '100%' },
  headerBadge: {
    position: 'absolute',
    top: -3,
    right: -2,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#EF4B5C',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 9,
    lineHeight: 11
  },
  trendCard: {
    minHeight: 78,
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2B3239',
    backgroundColor: '#101419',
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  trendHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  trendTitle: {
    color: '#FFFFFF',
    fontFamily: font.semiBold,
    fontSize: 12,
    lineHeight: 15
  },
  trendEmptyLabel: {
    color: '#AAB2BB',
    fontFamily: font.medium,
    fontSize: 10,
    lineHeight: 13
  },
  trendRow: {
    marginTop: 7,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  trendItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4
  },
  trendPill: {
    width: '88%',
    maxWidth: 44,
    height: 27,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  trendValue: {
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 14
  },
  trendDay: {
    color: '#C2C8CF',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 13
  },
  trendEmptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#59616A'
  },
  actionRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: 7
  },
  actionPill: {
    minHeight: 44,
    width: '49%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2B3137',
    backgroundColor: '#171C21',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 10,
    lineHeight: 13
  },
  recoveryPanel: {
    height: 320,
    marginTop: 0,
    position: 'relative',
    alignItems: 'center',
    overflow: 'hidden'
  },
  recoveryStage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    transform: [{ translateY: 0 }]
  },
  starShadow: {
    position: 'absolute',
    top: '51.5%',
    left: '50%',
    width: 384,
    height: 465.6,
    marginTop: -232.8,
    marginLeft: -192,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 10, height: -8 },
    elevation: 8
  },
  progressDonutAsset: {
    position: 'absolute',
    top: '51.5%',
    left: '50%',
    marginTop: -(DONUT_ASSET_SIZE / 2) + DONUT_ART_CENTER_OFFSET,
    marginLeft: -(DONUT_ASSET_SIZE / 2) + DONUT_ART_CENTER_OFFSET,
    transform: [{ translateY: CENTRAL_CIRCLE_OFFSET }],
    zIndex: 1
  },
  scoreArc: {
    position: 'absolute',
    top: '51.5%',
    left: '50%',
    marginTop: -(SCORE_ARC_SIZE / 2),
    marginLeft: -(SCORE_ARC_SIZE / 2),
    transform: [{ translateY: CENTRAL_CIRCLE_OFFSET }],
    zIndex: 2
  },
  coreCenter: {
    position: 'absolute',
    top: '51.5%',
    left: '50%',
    marginTop: -(CORE_SIZE / 2),
    marginLeft: -(CORE_SIZE / 2),
    transform: [{ translateY: CENTRAL_CIRCLE_OFFSET }],
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: CORE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 3
  },
  coreScore: {
    color: '#E4E8ED',
    fontFamily: font.bold,
    fontSize: 30,
    lineHeight: 34,
    textAlign: 'center'
  },
  coreLabel: {
    color: '#E1E4E3',
    fontFamily: font.regular,
    maxWidth: 108,
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center'
  },
  stateChip: {
    minHeight: 21,
    borderRadius: 11,
    backgroundColor: '#FF1717',
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stateChipText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 9,
    lineHeight: 11
  },
  recoveryNode: {
    position: 'absolute',
    width: 96,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -48,
    marginTop: -35,
    zIndex: 5
  },
  recoveryNodeLabel: {
    marginTop: 3,
    color: '#F4F7F4',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'center'
  },
  recoveryNodeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#3A4148',
    backgroundColor: '#1B2025',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  selectedNodeGlow: {
    position: 'absolute',
    top: -1,
    right: -1,
    bottom: -1,
    left: -1,
    borderRadius: 18,
    borderWidth: 2,
    shadowOpacity: 0.58,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 }
  },
  summaryRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10
  },
  infoCard: {
    flex: 1,
    minHeight: 131,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2B3137',
    backgroundColor: '#13171B',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 12
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardTitle: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 14
  },
  medicationMetrics: {
    marginTop: 17,
    flexDirection: 'row'
  },
  medMetric: {
    flex: 1,
    alignItems: 'flex-start',
    paddingLeft: 0
  },
  medMetricDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#343636',
    paddingLeft: 10
  },
  medValue: {
    color: '#FFFFFF',
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 17
  },
  medLabel: {
    marginTop: 8,
    color: '#A7AFB8',
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 13
  },
  cardAction: {
    marginTop: 'auto',
    color: '#A7FF4C',
    fontFamily: font.bold,
    fontSize: 8,
    lineHeight: 10
  },
  stressScore: {
    marginTop: 19,
    color: '#FFFFFF',
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 19
  },
  stressCaption: {
    marginTop: 7,
    color: '#777C79',
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 14
  },
  stressInfoCard: {
    minHeight: 131
  },
  stressLabel: {
    marginTop: 12,
    color: '#B4B0D7',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 13
  },
  stressValueRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  stressValue: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 19
  },
  stressTrend: {
    color: '#C9C7FF',
    fontFamily: font.semiBold,
    fontSize: 11,
    lineHeight: 13
  },
  stressSupportText: {
    marginTop: 5,
    color: '#A7AFB8',
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 14
  },
  stressDraftText: {
    marginTop: 4,
    color: '#A5A7B1',
    fontFamily: font.medium,
    fontSize: 10,
    lineHeight: 12
  },
  stressActionRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  stressPrimaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  stressPrimaryActionText: {
    color: '#C9C7FF',
    fontFamily: font.bold,
    fontSize: 10,
    lineHeight: 12
  },
  stressSecondaryAction: {
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#1A1B20',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stressSecondaryActionText: {
    color: '#F4F7F4',
    fontFamily: font.medium,
    fontSize: 10,
    lineHeight: 12
  },
  stressBars: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 6
  },
  stressBar: {
    flex: 1,
    height: 4,
    borderRadius: 3,
    backgroundColor: '#343636'
  },
  stressBarActive: {
    backgroundColor: '#FF6F7C'
  }
});
