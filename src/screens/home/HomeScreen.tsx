import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { CompositeNavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, SvgProps } from 'react-native-svg';
import AssistIcon from '../../assets/fiteatsy-home/assist.svg';
import WearableSyncIcon from '../../assets/fiteatsy-home/wearable-sync.svg';
import RecoveryStarAsset from '../../assets/fiteatsy-home/recovery-star.svg';
import ProgressDonutChartAsset from '../../assets/fiteatsy-home/progress-donut-chart.svg';
import ActivityDefaultIcon from '../../assets/fiteatsy-home/activity-inactive.svg';
import ActivityActiveIcon from '../../assets/fiteatsy-home/activity-selected.svg';
import NutritionDefaultIcon from '../../assets/fiteatsy-home/nutrition-inactive.svg';
import NutritionActiveIcon from '../../assets/fiteatsy-home/nutrition-selected.svg';
import MindDefaultIcon from '../../assets/fiteatsy-home/mind-inactive.svg';
import MindActiveIcon from '../../assets/fiteatsy-home/mind-selected.svg';
import SleepDefaultIcon from '../../assets/fiteatsy-home/sleep-inactive.svg';
import SleepActiveIcon from '../../assets/fiteatsy-home/sleep-selected.svg';
import CalmDefaultIcon from '../../assets/fiteatsy-home/calm-inactive.svg';
import CalmActiveIcon from '../../assets/fiteatsy-home/calm-selected.svg';
import { MainTabParamList, RootStackParamList } from '../../navigation/types';
import { getDraftAssessmentSession, getLatestAssessmentResult } from '../../services/assessmentService';
import { useAppContext } from '../../state/AppContext';
import { getMySubscription } from '../../services/subscriptionService';
import { getNutritionExperience, type NutritionExperience } from '../../services/nutritionExperienceService';
import {
  getHealthScoreHistory,
  getHealthScoreSummary,
  type HealthScoreSummary
} from '../../services/healthIntelligenceService';
import type { Medication, MedicationLogStatus } from '../../types';
import { nutritionDate, subscribeToNutritionDay } from '../../utils/nutritionDate';
import { resolveClientFirstName } from '../../utils/clientIdentity';
import {
  buildPss10StressContext,
  formatPss10Change,
  formatPss10LastChecked,
  type Pss10StressContext
} from '../../utils/pss10StressContext';

const trendDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STAR_CENTER_X = 183;
const STAR_CENTER_Y = 196;
const DONUT_ASSET_SIZE = 276;
const DONUT_ASSET_VISUAL_CENTER = 126;
const DONUT_VERTICAL_OFFSET = Math.round(DONUT_ASSET_SIZE * 0.03);
const CORE_SIZE = 150;
const SCORE_ARC_SIZE = 209;
const SCORE_ARC_RADIUS = 69;
const SCORE_ARC_STROKE_WIDTH = 20;
const SCORE_ARC_CIRCUMFERENCE = 2 * Math.PI * SCORE_ARC_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
type MetricKey = 'recovery' | 'calm' | 'activity' | 'nutrition' | 'mind' | 'sleep';
type SvgAsset = React.FC<SvgProps>;
type RecoveryMetric = {
  key: Exclude<MetricKey, 'recovery'>;
  label: string;
  score: number | null;
  color: string;
  position: 'top' | 'left' | 'right' | 'bottomLeft' | 'bottomRight';
  DefaultIcon: SvgAsset | ImageSourcePropType;
  ActiveIcon: SvgAsset | ImageSourcePropType;
  defaultIconType?: 'svg' | 'image';
  activeIconType?: 'svg' | 'image';
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

const stateFromScore = (score: number | null) => {
  if (score == null) return { label: 'No data' };
  if (score >= 80) return { label: 'Strong Today' };
  if (score >= 55) return { label: 'Borderline' };
  return { label: 'Lower Today' };
};

const arcGradientForMetric = (key: MetricKey) => {
  switch (key) {
    case 'activity':
      return ['#FF8A1E', '#A74200'];
    case 'nutrition':
      return ['#96FF45', '#2F9400'];
    case 'mind':
      return ['#9B70FF', '#763CEF'];
    case 'sleep':
      return ['#2E92FF', '#0643B5'];
    case 'calm':
    case 'recovery':
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
  const {
    authSession,
    getMedicationTimelineForDate
  } = useAppContext();
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('recovery');
  const [dailyNutrition, setDailyNutrition] = useState<NutritionExperience | null>(null);
  const [healthSummary, setHealthSummary] = useState<HealthScoreSummary | null>(null);
  const [recoveryTrend, setRecoveryTrend] = useState<number[]>([]);
  const [pss10Context, setPss10Context] = useState<Pss10StressContext>(() =>
    buildPss10StressContext({ latestResult: null, previousResult: null, draft: null })
  );
  const sessionToken = authSession?.sessionToken;
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
      setHealthSummary(null);
      setRecoveryTrend([]);
      return;
    }
    try {
      const [summary, history] = await Promise.all([
        getHealthScoreSummary(),
        getHealthScoreHistory('recovery')
      ]);
      setHealthSummary(summary);
      setRecoveryTrend(
        history.items
          .filter((item) => item.scoreStatus === 'calculated' && item.scoreValue != null)
          .sort((a, b) => (+new Date(a.calculatedAtISO)) - (+new Date(b.calculatedAtISO)))
          .slice(-7)
          .map((item) => normalizeScore(item.scoreValue))
          .filter((score): score is number => score != null)
      );
    } catch {
      setHealthSummary(null);
      setRecoveryTrend([]);
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

  const nutritionScore = normalizeScore(dailyNutrition?.nutritionScore ?? null);
  const metrics: RecoveryMetric[] = [
    {
      key: 'calm',
      label: 'Calm',
      score: normalizeScore(healthSummary?.stressResilienceScore ?? healthSummary?.calmScore),
      color: '#FF1717',
      position: 'top',
      DefaultIcon: CalmDefaultIcon,
      ActiveIcon: CalmActiveIcon
    },
    {
      key: 'activity',
      label: 'Activity',
      score: normalizeScore(healthSummary?.activePerformanceScore ?? healthSummary?.activityScore),
      color: '#F27A1A',
      position: 'left',
      DefaultIcon: ActivityDefaultIcon,
      ActiveIcon: ActivityActiveIcon
    },
    {
      key: 'nutrition',
      label: 'Nutrition',
      score: nutritionScore,
      color: '#77FF22',
      position: 'right',
      DefaultIcon: NutritionDefaultIcon,
      ActiveIcon: NutritionActiveIcon
    },
    {
      key: 'mind',
      label: 'Mind',
      score: normalizeScore(healthSummary?.stressResilienceScore),
      color: '#763CEF',
      position: 'bottomLeft',
      DefaultIcon: MindDefaultIcon,
      ActiveIcon: MindActiveIcon
    },
    {
      key: 'sleep',
      label: 'Sleep',
      score: normalizeScore(healthSummary?.energyBalanceScore ?? healthSummary?.sleepScore),
      color: '#0F80FF',
      position: 'bottomRight',
      DefaultIcon: SleepDefaultIcon,
      ActiveIcon: SleepActiveIcon
    }
  ];
  const displayMetrics = metrics;
  const trendValues = recoveryTrend;
  const hasTrendData = trendValues.length > 0;
  const recoveryCoreScore = normalizeScore(healthSummary?.recoveryScore);

  const selected = selectedMetric === 'recovery'
    ? { label: 'Recovery Core', score: recoveryCoreScore, color: '#D5062D' }
    : displayMetrics.find((metric) => metric.key === selectedMetric) ?? { label: 'Recovery Core', score: recoveryCoreScore, color: '#D5062D' };
  const selectedState = stateFromScore(selected.score);
  const todayMedicationTimeline = getMedicationTimelineForDate(new Date().toISOString());

  return (
    <SafeAreaView style={styles.safe} testID="home.root">
      <LinearGradient colors={['#262B2F', '#16191D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screenGradient}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.referenceFrame}>
            <HomeHeader
              name={resolveClientFirstName(authSession?.user.name)}
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
              <ActionPill label="Sync" Icon={WearableSyncIcon} onPress={() => navigation.navigate('SyncWearable')} />
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
      </LinearGradient>
    </SafeAreaView>
  );
};

const HomeHeader = ({
  name,
  onSearch,
  onAdd,
  onNotifications,
  onProfile
}: {
  name: string;
  onSearch: () => void;
  onAdd: () => void;
  onNotifications: () => void;
  onProfile: () => void;
}) => (
  <View style={styles.header}>
    <Text style={styles.headerGreeting} numberOfLines={1}>Hi!, {name}</Text>
    <View style={styles.headerActions}>
      <HeaderIcon icon="search-outline" onPress={onSearch} />
      <HeaderIcon icon="trophy-outline" onPress={onAdd} />
      <HeaderIcon icon="notifications-outline" onPress={onNotifications} badge="9" />
      <Pressable onPress={onProfile} style={styles.avatar} accessibilityRole="button" accessibilityLabel="Open profile">
        <Ionicons name="person-outline" size={23} color="#EDF3EE" />
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
    <Text style={styles.trendTitle}>Your 7 day’s Recovery Trend</Text>
    <View style={styles.trendRow}>
      {trendDays.map((day, index) => {
        const value = values[index] ?? 0;
        const tone = trendTone(hasData ? value : 0);
        return (
          <View key={`${day}-${index}`} style={styles.trendItem}>
            <View style={[styles.trendPill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.trendValue, { color: tone.text }]}>{hasData ? `${Math.round(value)}%` : '--'}</Text>
            </View>
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

const ActionPill = ({ label, Icon, onPress }: { label: string; Icon: SvgAsset; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.actionPill} accessibilityRole="button">
    <Icon width={18} height={18} />
    <Text style={styles.actionText}>{label}</Text>
  </Pressable>
);

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
    <View style={styles.recoveryPanel} testID="home.recoveryCore">
      <View style={styles.recoveryStage}>
        <View style={styles.starShadow} pointerEvents="none">
          <RecoveryStarAsset width={406} height={492} pointerEvents="none" />
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
            onPress={() => onSelectMetric(metric.key)}
          />
        ))}

        <Pressable
          onPress={() => onSelectMetric('recovery')}
          style={styles.coreCenter}
          accessibilityRole="button"
          accessibilityLabel="View today's Recovery Core score"
        >
          <Text style={styles.coreScore}>{selectedScore == null ? '--/100' : `${selectedScore}/100`}</Text>
          <Text style={styles.coreLabel}>{selectedLabel}</Text>
          <View testID="home.recoveryCore.state" style={[styles.stateChip, { backgroundColor: selectedScore == null ? '#23272D' : selectedColor }]}>
            <Text style={styles.stateChipText}>{selectedState.label}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
};

const RecoveryNode = ({ metric, selected, onPress }: { metric: RecoveryMetric; selected: boolean; onPress: () => void }) => {
  const Icon = selected ? metric.ActiveIcon : metric.DefaultIcon;
  const isImage = (selected ? metric.activeIconType : metric.defaultIconType) === 'image';
  const SvgIcon = Icon as SvgAsset;
  const iconSize = selected ? 35 : 32;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.recoveryNode, nodePositions[metric.position], selected && styles.recoveryNodeSelected]}
      hitSlop={14}
      accessibilityRole="button"
      accessibilityLabel={`View today's ${metric.label} score`}
    >
      {isImage ? (
        <Image
          source={Icon as ImageSourcePropType}
          resizeMode="contain"
          style={[
            styles.nodeImage,
            metric.key === 'calm' && selected ? styles.nodeImageCalmActive : null,
            metric.key === 'calm' && !selected ? styles.nodeImageCalmDefault : null
          ]}
        />
      ) : (
        <SvgIcon width={iconSize} height={iconSize} />
      )}
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
  top: {
    top: 24,
    left: 131
  },
  left: {
    top: 125,
    left: 1
  },
  right: {
    top: 125,
    right: 1
  },
  bottomLeft: {
    left: 52,
    bottom: 17
  },
  bottomRight: {
    right: 52,
    bottom: 17
  }
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#262B2F'
  },
  screenGradient: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 116
  },
  referenceFrame: {
    width: '100%',
    maxWidth: 390,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingTop: 0
  },
  header: {
    height: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerGreeting: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: font.semiBold,
    fontSize: 16,
    lineHeight: 20
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#303642',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#153923',
    alignItems: 'center',
    justifyContent: 'center'
  },
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
    height: 89,
    marginTop: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#101516',
    backgroundColor: '#090A0B',
    paddingHorizontal: 8,
    paddingTop: 8
  },
  trendTitle: {
    color: '#FFFFFF',
    fontFamily: font.semiBold,
    fontSize: 13,
    lineHeight: 16
  },
  trendRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  trendItem: {
    alignItems: 'center',
    gap: 7
  },
  trendPill: {
    width: 46,
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
    color: '#FFFFFF',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 13
  },
  actionRow: {
    height: 36,
    marginTop: -1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8
  },
  actionPill: {
    height: 30,
    borderRadius: 16,
    backgroundColor: '#050505',
    paddingHorizontal: 8,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 15
  },
  recoveryPanel: {
    height: 371,
    marginTop: 0,
    position: 'relative',
    alignItems: 'center',
    overflow: 'visible'
  },
  recoveryStage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    transform: [{ translateY: -18 }]
  },
  starShadow: {
    position: 'absolute',
    top: -48,
    left: -20,
    width: 406,
    height: 492,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 10, height: -8 },
    elevation: 8
  },
  progressDonutAsset: {
    position: 'absolute',
    top: STAR_CENTER_Y - DONUT_ASSET_VISUAL_CENTER + DONUT_VERTICAL_OFFSET,
    left: STAR_CENTER_X - DONUT_ASSET_VISUAL_CENTER,
    zIndex: 1
  },
  scoreArc: {
    position: 'absolute',
    top: STAR_CENTER_Y - SCORE_ARC_SIZE / 2 + DONUT_VERTICAL_OFFSET,
    left: STAR_CENTER_X - SCORE_ARC_SIZE / 2,
    zIndex: 2
  },
  coreCenter: {
    position: 'absolute',
    top: STAR_CENTER_Y - CORE_SIZE / 2 + DONUT_VERTICAL_OFFSET,
    left: STAR_CENTER_X - CORE_SIZE / 2,
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
    fontSize: 26,
    lineHeight: 31,
    textAlign: 'center'
  },
  coreLabel: {
    color: '#E1E4E3',
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 18,
    textAlign: 'center'
  },
  stateChip: {
    minHeight: 24,
    borderRadius: 13,
    backgroundColor: '#FF1717',
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stateChipText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 11,
    lineHeight: 13
  },
  recoveryNode: {
    position: 'absolute',
    width: 104,
    minHeight: 86,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5
  },
  recoveryNodeSelected: {
    transform: [{ scale: 1.02 }]
  },
  recoveryNodeLabel: {
    marginTop: 3,
    color: '#F4F7F4',
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 14,
    textAlign: 'center'
  },
  nodeImage: {
    width: 50,
    height: 55
  },
  nodeImageCalmActive: {
    width: 46,
    height: 64
  },
  nodeImageCalmDefault: {
    width: 36,
    height: 58
  },
  summaryRow: {
    marginTop: 11,
    flexDirection: 'row',
    gap: 10
  },
  infoCard: {
    flex: 1,
    minHeight: 131,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202423',
    backgroundColor: '#0F1010',
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
    color: '#777C79',
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
    marginTop: 18,
    color: '#9B98C7',
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
    fontSize: 18,
    lineHeight: 22
  },
  stressTrend: {
    color: '#C9C7FF',
    fontFamily: font.semiBold,
    fontSize: 11,
    lineHeight: 13
  },
  stressSupportText: {
    marginTop: 7,
    color: '#777C79',
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
    fontSize: 11,
    lineHeight: 13
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
