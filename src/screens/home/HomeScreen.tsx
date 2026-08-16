import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgProps } from 'react-native-svg';
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
import { RootStackParamList } from '../../navigation/types';
import { buildRecoveryIntelligence, type RecoveryDriver } from '../../services/recoveryIntelligenceEngine';
import { listAnalyzedReports, type ReportDto } from '../../services/reportUploadService';
import { useAppContext } from '../../state/AppContext';
import type { DailyCheckIn, Medication, MedicationLogStatus } from '../../types';
import { getIdentityScopedStorageKey } from '../../utils/identityScopedStorage';

const REPORT_HISTORY_STORAGE_KEY = 'fiteatsy.reportHistory';
const trendDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STAR_CENTER_X = 183;
const STAR_CENTER_Y = 178;
const DONUT_ASSET_SIZE = 276;
const DONUT_ASSET_VISUAL_CENTER = 126;
const CORE_SIZE = 150;
const ENABLE_HOME_RECOVERY_UI_FIXTURE = __DEV__ && process.env.EXPO_PUBLIC_HOME_RECOVERY_UI_FIXTURE === 'true';

const font = {
  regular: 'Exo_400Regular',
  medium: 'Exo_500Medium',
  semiBold: 'Exo_600SemiBold',
  bold: 'Exo_700Bold'
} as const;

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MetricKey = 'recovery' | 'calm' | 'activity' | 'nutrition' | 'mind' | 'sleep';
type SvgAsset = React.FC<SvgProps>;
const HOME_RECOVERY_UI_FIXTURE: Record<MetricKey, number> = {
  recovery: 67,
  calm: 72,
  activity: 45,
  nutrition: 81,
  mind: 58,
  sleep: 35
};

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

type HealthProfileReportSummary = {
  id: string;
  labName: string;
  date: string;
  abnormal: number;
  score: number;
  uploadedAtISO?: string;
};

type MedicationTimelineEntry = {
  medication: Medication;
  scheduledForISO: string;
  status: MedicationLogStatus;
};

const toHealthProfileReportSummary = (report: ReportDto): HealthProfileReportSummary | null => {
  const analysis = report.analysis;
  if (!analysis) return null;
  const parameters = Array.isArray(analysis.parameters) ? analysis.parameters : [];
  return {
    id: report.id,
    labName: analysis.labName || report.labName || 'Blood Report',
    date: analysis.reportDate || report.reportDate || 'Date unavailable',
    abnormal: parameters.filter((parameter) => parameter.status !== 'normal').length,
    score: Number(analysis.score ?? 0),
    uploadedAtISO: report.createdAtISO
  };
};

const firstName = (name?: string | null) => {
  const trimmed = name?.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
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

const scoreForHomeUi = (key: MetricKey, score: number | null) => (
  ENABLE_HOME_RECOVERY_UI_FIXTURE ? HOME_RECOVERY_UI_FIXTURE[key] : score
);

const driverScore = (drivers: RecoveryDriver[], key: RecoveryDriver['key'], requireSignal: boolean) => {
  if (!requireSignal) return null;
  return drivers.find((driver) => driver.key === key && driver.weight > 0)?.score ?? null;
};

const normalizeScore = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const averageScores = (scores: Array<number | null>) => {
  const available = scores.filter((score): score is number => score != null);
  if (available.length === 0) return null;
  return Math.round(available.reduce((sum, score) => sum + score, 0) / available.length);
};

const buildDomainTrend = (scores: Array<number | null>, checkIns: DailyCheckIn[]) => {
  const todayScore = averageScores(scores);
  if (todayScore == null) return [];

  const recentCheckIns = [...checkIns]
    .sort((a, b) => (+new Date(a.dateISO)) - (+new Date(b.dateISO)))
    .slice(-6);

  const historical = recentCheckIns.map((entry) =>
    normalizeScore(((entry.mood / 5) * 34) + ((entry.energy / 5) * 33) + ((entry.sleepQuality / 5) * 33)) ?? todayScore
  );

  return [...historical, todayScore].slice(-7);
};

export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const {
    onboarding,
    wellness,
    checkIns,
    wearableSyncData,
    authSession,
    publishedNutritionPlan,
    getMedicationTimelineForDate
  } = useAppContext();
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('recovery');
  const [reportHistory, setReportHistory] = useState<HealthProfileReportSummary[]>([]);

  const reportHistoryStorageKey = useMemo(
    () =>
      getIdentityScopedStorageKey(
        REPORT_HISTORY_STORAGE_KEY,
        authSession
          ? {
              userId: authSession.accountId,
              clientId: authSession.client.fiteatsyClientId
            }
          : null
      ),
    [authSession]
  );

  const recoveryIntel = useMemo(
    () =>
      buildRecoveryIntelligence({
        wellness,
        checkIns,
        medication: { scheduledToday: 0, takenToday: 0, pendingToday: 0, skippedToday: 0, missedToday: 0 },
        hasWearable: wearableSyncData.length > 0,
        wearableSyncData
      }),
    [wellness, checkIns, wearableSyncData]
  );

  useEffect(() => {
    let alive = true;

    const loadReportHistory = async () => {
      if (!reportHistoryStorageKey) {
        if (alive) setReportHistory([]);
        return;
      }

      try {
        const reportDtos = await listAnalyzedReports();
        const reports = reportDtos.map(toHealthProfileReportSummary).filter(Boolean) as HealthProfileReportSummary[];
        if (!alive) return;
        setReportHistory(reports);
        await AsyncStorage.setItem(reportHistoryStorageKey, JSON.stringify(reports));
      } catch {
        if (alive) setReportHistory([]);
      }
    };

    void loadReportHistory();

    return () => {
      alive = false;
    };
  }, [reportHistoryStorageKey]);

  const nutritionProtein = publishedNutritionPlan?.version.contentSummary.protein ?? null;
  const nutritionCalories = publishedNutritionPlan?.version.contentSummary.calories ?? null;
  const nutritionScore = normalizeScore(
    nutritionProtein != null && nutritionCalories != null
      ? Math.min(100, Math.round((nutritionProtein / 120) * 55 + (nutritionCalories / 2200) * 45))
      : wellness.nourishmentScore
  );
  const metrics: RecoveryMetric[] = [
    {
      key: 'calm',
      label: 'Calm',
      score: normalizeScore(recoveryIntel.calmScore),
      color: '#FF1717',
      position: 'top',
      DefaultIcon: CalmDefaultIcon,
      ActiveIcon: CalmActiveIcon
    },
    {
      key: 'activity',
      label: 'Activity',
      score: normalizeScore(driverScore(recoveryIntel.recoveryDrivers, 'activity', recoveryIntel.signalCoverage.steps || recoveryIntel.signalCoverage.workouts)),
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
      score: checkIns.length > 0
        ? normalizeScore(driverScore(recoveryIntel.recoveryDrivers, 'emotional_checkins', true))
        : null,
      color: '#BFE8D0',
      position: 'bottomLeft',
      DefaultIcon: MindDefaultIcon,
      ActiveIcon: MindActiveIcon
    },
    {
      key: 'sleep',
      label: 'Sleep',
      score: normalizeScore(driverScore(recoveryIntel.recoveryDrivers, 'sleep', recoveryIntel.signalCoverage.sleep)),
      color: '#0F80FF',
      position: 'bottomRight',
      DefaultIcon: SleepDefaultIcon,
      ActiveIcon: SleepActiveIcon
    }
  ];
  const displayMetrics = metrics.map((metric) => ({
    ...metric,
    score: scoreForHomeUi(metric.key, metric.score)
  }));
  const trendValues = buildDomainTrend(displayMetrics.map((metric) => metric.score), checkIns);
  const hasTrendData = trendValues.length > 0;
  const recoveryCoreScore = scoreForHomeUi('recovery', averageScores(displayMetrics.map((metric) => metric.score)));

  const selected = selectedMetric === 'recovery'
    ? { label: 'Recovery Core', score: recoveryCoreScore, color: '#D5062D' }
    : displayMetrics.find((metric) => metric.key === selectedMetric) ?? { label: 'Recovery Core', score: recoveryCoreScore, color: '#D5062D' };
  const selectedState = stateFromScore(selected.score);
  const todayMedicationTimeline = getMedicationTimelineForDate(new Date().toISOString());
  const goToSessions = () => (navigation.getParent() as { navigate?: (screen: string) => void } | undefined)?.navigate?.('Sessions');

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={['#262B2F', '#16191D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screenGradient}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.referenceFrame}>
            <HomeHeader
              name={firstName(onboarding?.name)}
              onSearch={() => navigation.navigate('Search')}
              onAdd={() => navigation.navigate('Leadership')}
              onNotifications={() => navigation.navigate('Notifications')}
              onProfile={() => navigation.navigate('Profile')}
            />

            <RecoveryTrend values={trendValues} hasData={hasTrendData} />

            <View style={styles.actionRow}>
              <ActionPill label="Assist" Icon={AssistIcon} onPress={goToSessions} />
              <ActionPill label="Sync" Icon={WearableSyncIcon} onPress={() => navigation.navigate('SyncWearable')} />
            </View>

            <RecoveryPanel
              metrics={displayMetrics}
              selectedMetric={selectedMetric}
              selectedLabel={selected.label}
              selectedScore={selected.score}
              selectedColor={selected.color}
              selectedState={selectedState}
              onSelectMetric={setSelectedMetric}
            />

            <View style={styles.summaryRow}>
              <MedicationCard timeline={todayMedicationTimeline} onPress={() => navigation.navigate('MedicationCalendar')} />
              <StressCard score={normalizeScore(recoveryIntel.stressRecoveryScore)} onPress={() => navigation.navigate('BreathingSession')} />
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
  return (
    <View style={styles.recoveryPanel}>
      <View style={styles.recoveryStage}>
        <RecoveryStarAsset width={406} height={492} style={styles.starAsset} />
        <ProgressDonutChartAsset width={DONUT_ASSET_SIZE} height={DONUT_ASSET_SIZE} style={styles.progressDonutAsset} />

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
          <View style={[styles.stateChip, { backgroundColor: selectedScore == null ? '#23272D' : selectedColor }]}>
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

const StressCard = ({ score, onPress }: { score: number | null; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.infoCard} accessibilityRole="button" accessibilityLabel="Open stress recovery breathing">
    <View style={styles.cardTitleRow}>
      <Text style={styles.cardTitle}>Stress Recovery</Text>
      <Ionicons name="headset-outline" size={20} color="#F4F7F4" />
    </View>
    <Text style={styles.stressScore}>{score == null ? '--/100' : `${score}/100`}</Text>
    <Text style={styles.stressCaption}>Adjusted by breathing minutes</Text>
    <View style={styles.stressBars}>
      <View style={[styles.stressBar, styles.stressBarActive]} />
      <View style={styles.stressBar} />
      <View style={styles.stressBar} />
    </View>
  </Pressable>
);

const nodePositions = StyleSheet.create({
  top: {
    top: 23,
    left: 150
  },
  left: {
    top: 115,
    left: 24
  },
  right: {
    top: 115,
    right: 24
  },
  bottomLeft: {
    left: 67,
    bottom: 16
  },
  bottomRight: {
    right: 67,
    bottom: 16
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
    paddingTop: 8
  },
  header: {
    height: 51,
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
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  actionPill: {
    height: 30,
    minWidth: 75,
    borderRadius: 16,
    backgroundColor: '#050505',
    paddingHorizontal: 10,
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
    height: 347,
    marginTop: -2,
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
    transform: [{ translateY: -46 }]
  },
  starAsset: {
    position: 'absolute',
    top: -68,
    left: -20
  },
  progressDonutAsset: {
    position: 'absolute',
    top: STAR_CENTER_Y - DONUT_ASSET_VISUAL_CENTER,
    left: STAR_CENTER_X - DONUT_ASSET_VISUAL_CENTER
  },
  coreCenter: {
    position: 'absolute',
    top: STAR_CENTER_Y - CORE_SIZE / 2,
    left: STAR_CENTER_X - CORE_SIZE / 2,
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: CORE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  coreScore: {
    color: '#E4E8ED',
    fontFamily: font.bold,
    fontSize: 34,
    lineHeight: 39,
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
    width: 74,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center'
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
    marginTop: -6,
    flexDirection: 'row',
    gap: 10
  },
  infoCard: {
    flex: 1,
    height: 131,
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
    fontSize: 7,
    lineHeight: 9
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
    fontSize: 8,
    lineHeight: 10
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
