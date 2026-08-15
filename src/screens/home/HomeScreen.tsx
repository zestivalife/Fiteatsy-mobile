import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgProps } from 'react-native-svg';
import { Screen } from '../../components/Screen';
import AssistIcon from '../../assets/fiteatsy-home/assist.svg';
import WearableSyncIcon from '../../assets/fiteatsy-home/wearable-sync.svg';
import RecoveryCoreAsset from '../../assets/fiteatsy-home/recovery-core.svg';
import RecoveryStarAsset from '../../assets/fiteatsy-home/recovery-star.svg';
import StateBorderlineAsset from '../../assets/fiteatsy-home/state-borderline.svg';
import StateDeclineAsset from '../../assets/fiteatsy-home/state-decline.svg';
import StateDefaultAsset from '../../assets/fiteatsy-home/state-default.svg';
import StateSuccessAsset from '../../assets/fiteatsy-home/state-success.svg';
import ActivityDefaultIcon from '../../assets/fiteatsy-home/activity-default.svg';
import ActivityActiveIcon from '../../assets/fiteatsy-home/activity-active.svg';
import NutritionDefaultIcon from '../../assets/fiteatsy-home/nutrition-default.svg';
import NutritionActiveIcon from '../../assets/fiteatsy-home/nutrition-active.svg';
import MindDefaultIcon from '../../assets/fiteatsy-home/mind-default.svg';
import MindActiveIcon from '../../assets/fiteatsy-home/mind-active.svg';
import SleepDefaultIcon from '../../assets/fiteatsy-home/sleep-default.svg';
import SleepActiveIcon from '../../assets/fiteatsy-home/sleep-active.svg';
import CalmActiveIcon from '../../assets/fiteatsy-home/calm-active.svg';
import { RootStackParamList } from '../../navigation/types';
import { buildRecoveryIntelligence } from '../../services/recoveryIntelligenceEngine';
import { listAnalyzedReports, type ReportDto } from '../../services/reportUploadService';
import { useAppContext } from '../../state/AppContext';
import { buildHealthProfileCompletion } from '../../utils/healthProfileCompletion';
import { buildHealthSnapshotMetrics } from '../../utils/healthMetrics';
import { getIdentityScopedStorageKey } from '../../utils/identityScopedStorage';

const REPORT_HISTORY_STORAGE_KEY = 'fiteatsy.reportHistory';
const trendDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const font = {
  regular: 'Exo_400Regular',
  medium: 'Exo_500Medium',
  semiBold: 'Exo_600SemiBold',
  bold: 'Exo_700Bold'
} as const;

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MetricKey = 'recovery' | 'calm' | 'activity' | 'nutrition' | 'mind' | 'sleep';
type SvgAsset = React.FC<SvgProps>;

type HealthProfileReportSummary = {
  id: string;
  labName: string;
  date: string;
  abnormal: number;
  score: number;
  uploadedAtISO?: string;
};

type RecoveryMetric = {
  key: MetricKey;
  label: string;
  score: number | null;
  helper: string;
  position: 'top' | 'left' | 'right' | 'bottomLeft' | 'bottomRight';
  DefaultIcon: SvgAsset;
  ActiveIcon: SvgAsset;
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

const getGreetingName = (name?: string | null) => {
  const trimmed = name?.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
};

const compactDate = (value?: string | null) => {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const trendTone = (value: number) => {
  if (value >= 80) return { bg: '#88FF74', text: '#111111' };
  if (value >= 50) return { bg: '#EAF772', text: '#111111' };
  if (value >= 25) return { bg: '#78D4F4', text: '#111111' };
  if (value > 0) return { bg: '#FFB6B9', text: '#111111' };
  return { bg: '#050505', text: '#FFFFFF' };
};

const stateFromScore = (score: number | null) => {
  if (score == null) return { label: 'Calibration', Asset: StateDefaultAsset };
  if (score >= 80) return { label: 'Strong Today', Asset: StateSuccessAsset };
  if (score >= 55) return { label: 'Borderline', Asset: StateBorderlineAsset };
  return { label: 'Lower Today', Asset: StateDeclineAsset };
};

export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const {
    onboarding,
    assessment,
    wellness,
    checkIns,
    selectedDeviceId,
    wearableSyncData,
    devices,
    publishedNutritionPlan,
    refreshPublishedNutritionPlan,
    authSession
  } = useAppContext();

  const [reportHistory, setReportHistory] = useState<HealthProfileReportSummary[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('recovery');

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

  const profileCompletion = useMemo(
    () => buildHealthProfileCompletion(onboarding, assessment, reportHistory.length),
    [onboarding, assessment, reportHistory.length]
  );
  const healthMetrics = useMemo(
    () => buildHealthSnapshotMetrics(onboarding, assessment?.weightKg, assessment?.heightCm),
    [onboarding, assessment]
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
    void refreshPublishedNutritionPlan();
  }, [refreshPublishedNutritionPlan]);

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

  const connectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const latestSync = wearableSyncData[0] ?? null;
  const latestReport = reportHistory[0] ?? null;
  const hasWearableSignals = wearableSyncData.length > 0;
  const hasTrendData = !recoveryIntel.isCalibrating && recoveryIntel.trendValues7d.some((value) => value > 0);
  const trendValues = hasTrendData ? recoveryIntel.trendValues7d.slice(0, 7) : [];
  const nutritionScore = publishedNutritionPlan ? Math.min(100, Math.max(0, Math.round((healthMetrics.proteinTargetGrams ?? 0) / 1.4))) : null;
  const activityScore = hasWearableSignals ? Math.min(100, Math.round((wellness.movementMinutes / 45) * 100)) : null;
  const mindScore = checkIns.length > 0 ? Math.min(100, Math.max(0, Math.round((wellness.moodScore / 5) * 100))) : null;
  const sleepScore = recoveryIntel.signalCoverage.sleep ? Math.min(100, Math.round((wellness.sleepHours / 8) * 100)) : null;

  const metrics: RecoveryMetric[] = [
    {
      key: 'calm',
      label: 'Calm',
      score: recoveryIntel.calmScore,
      helper: recoveryIntel.calmScore == null ? 'Breathing minutes calibrating' : 'Calm signals today',
      position: 'top',
      DefaultIcon: CalmActiveIcon,
      ActiveIcon: CalmActiveIcon
    },
    {
      key: 'activity',
      label: 'Activity',
      score: activityScore,
      helper: hasWearableSignals ? `${Math.round(wellness.movementMinutes)} min` : 'Manual signals pending',
      position: 'left',
      DefaultIcon: ActivityDefaultIcon,
      ActiveIcon: ActivityActiveIcon
    },
    {
      key: 'nutrition',
      label: 'Nutrition',
      score: nutritionScore,
      helper: publishedNutritionPlan ? `${publishedNutritionPlan.version.contentSummary.protein}g protein` : 'Plan pending',
      position: 'right',
      DefaultIcon: NutritionDefaultIcon,
      ActiveIcon: NutritionActiveIcon
    },
    {
      key: 'mind',
      label: onboarding?.gender === 'Female' ? 'Rhythm' : 'Mind',
      score: mindScore,
      helper: checkIns.length > 0 ? `Mood ${Math.max(1, Math.round(wellness.moodScore))}/5` : 'Mood check-in pending',
      position: 'bottomLeft',
      DefaultIcon: MindDefaultIcon,
      ActiveIcon: MindActiveIcon
    },
    {
      key: 'sleep',
      label: 'Sleep',
      score: sleepScore,
      helper: recoveryIntel.signalCoverage.sleep ? `${wellness.sleepHours.toFixed(1)} hrs` : '0.0 hrs',
      position: 'bottomRight',
      DefaultIcon: SleepDefaultIcon,
      ActiveIcon: SleepActiveIcon
    }
  ];

  const selected = selectedMetric === 'recovery'
    ? {
        label: 'Recovery Core',
        score: recoveryIntel.recoveryScore,
        helper: recoveryIntel.recoveryScore == null ? 'Calibrating' : 'Daily recovery blend'
      }
    : metrics.find((metric) => metric.key === selectedMetric) ?? {
        label: 'Recovery Core',
        score: recoveryIntel.recoveryScore,
        helper: 'Daily recovery blend'
      };
  const selectedState = stateFromScore(selected.score);
  const connectionCopy = connectedDevice
    ? `Synced ${compactDate(latestSync?.syncedAtISO)} from ${connectedDevice.model}.`
    : 'Unlock Activity, Sleep, Calm, and Recovery scores from real Health Connect signals.';

  return (
    <Screen contentStyle={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Header
          name={getGreetingName(onboarding?.name)}
          onSearch={() => navigation.navigate('Search')}
          onAdd={() => navigation.navigate('Leadership')}
          onNotifications={() => navigation.navigate('Notifications')}
          onProfile={() => navigation.navigate('Profile')}
        />

        <RecoveryTrendCard values={trendValues} hasData={hasTrendData} />

        <RecoveryCoreCard
          metrics={metrics}
          selectedMetric={selectedMetric}
          selectedLabel={selected.label}
          selectedScore={selected.score}
          selectedHelper={selected.helper}
          selectedState={selectedState}
          onSelectMetric={setSelectedMetric}
          onAssist={() => setSelectedMetric('calm')}
          onSync={() => navigation.navigate('SyncWearable')}
        />

        <View style={styles.twoCardRow}>
          <MiniStatusCard
            title="Medication"
            icon="medical-outline"
            metrics={['0/0', '0/0', '0/0']}
            labels={['Taken', 'Pending', 'Missed']}
            action="Medication Logs +"
            onPress={() => navigation.navigate('MedicationCalendar')}
          />
          <MiniStatusCard
            title="Stress Recovery"
            icon="headset-outline"
            metrics={[recoveryIntel.stressRecoveryScore == null ? '--/100' : `${recoveryIntel.stressRecoveryScore}/100`]}
            labels={['Adjusted by breathing minutes']}
            action="Open Care"
            onPress={() => navigation.getParent()?.navigate('Sessions')}
          />
        </View>

        {!connectedDevice ? (
          <HealthConnectionCard body={connectionCopy} onPress={() => navigation.navigate('SyncWearable')} />
        ) : (
          <SyncStrip body={connectionCopy} onPress={() => navigation.navigate('ConnectedMetrics')} />
        )}

        <HealthSnapshotCard metrics={healthMetrics} />

        {profileCompletion.completionPercent < 85 ? (
          <ProfileStrengthCard
            percent={profileCompletion.completionPercent}
            onPress={() => navigation.navigate('Profile')}
          />
        ) : null}

        <JourneyIntelligenceCard
          title={latestReport ? `${latestReport.labName} analysed` : 'Reports unlock biomarker intelligence'}
          body={
            latestReport
              ? `${latestReport.abnormal} markers need attention from your latest report on ${latestReport.date}.`
              : 'Upload blood reports to unlock HbA1c, vitamin, lipid, thyroid, and CBC intelligence.'
          }
          action={latestReport ? 'Review report' : 'Upload report'}
          onPress={() => navigation.getParent()?.navigate('Reports')}
        />
      </ScrollView>
    </Screen>
  );
};

const Header = ({
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
    <Text style={styles.headerGreeting} numberOfLines={1}>
      Hi!, {name}
    </Text>
    <View style={styles.headerActions}>
      <HeaderIcon icon="search-outline" onPress={onSearch} />
      <HeaderIcon icon="business-outline" onPress={onAdd} />
      <HeaderIcon icon="notifications-outline" onPress={onNotifications} badge="9" />
      <Pressable onPress={onProfile} style={styles.avatar}>
        <Ionicons name="person-outline" size={24} color="#EDF3EE" />
      </Pressable>
    </View>
  </View>
);

const HeaderIcon = ({ icon, onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; badge?: string }) => (
  <Pressable onPress={onPress} style={styles.headerIcon}>
    <Ionicons name={icon} size={22} color="#F4F7F4" />
    {badge ? (
      <View style={styles.headerBadge}>
        <Text style={styles.headerBadgeText}>{badge}</Text>
      </View>
    ) : null}
  </Pressable>
);

const RecoveryTrendCard = ({ values, hasData }: { values: number[]; hasData: boolean }) => (
  <View style={styles.trendCard}>
    <Text style={styles.trendTitle}>Your 7 day’s Recovery Trend</Text>
    <View style={styles.trendRow}>
      {trendDays.map((day, index) => {
        const value = values[index] ?? 0;
        const tone = trendTone(hasData ? value : 0);
        return (
          <View key={`${day}-${index}`} style={styles.trendItem}>
            <View style={[styles.trendPill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.trendValue, { color: tone.text }]}>{hasData ? `${Math.round(value)}%` : '0%'}</Text>
            </View>
            <Text style={styles.trendDay}>{day}</Text>
          </View>
        );
      })}
    </View>
  </View>
);

const RecoveryCoreCard = ({
  metrics,
  selectedMetric,
  selectedLabel,
  selectedScore,
  selectedHelper,
  selectedState,
  onSelectMetric,
  onAssist,
  onSync
}: {
  metrics: RecoveryMetric[];
  selectedMetric: MetricKey;
  selectedLabel: string;
  selectedScore: number | null;
  selectedHelper: string;
  selectedState: { label: string; Asset: SvgAsset };
  onSelectMetric: (metric: MetricKey) => void;
  onAssist: () => void;
  onSync: () => void;
}) => {
  const StateAsset = selectedState.Asset;

  return (
    <View style={styles.recoverySection}>
      <View style={styles.recoveryActions}>
        <ActionPill label="Assist" Icon={AssistIcon} onPress={onAssist} />
        <ActionPill label="Sync" Icon={WearableSyncIcon} onPress={onSync} />
      </View>

      <View style={styles.starWrap}>
        <RecoveryStarAsset width={355} height={430} style={styles.starAsset} />
        <StateAsset width={86} height={120} style={styles.stateAsset} />
        <RecoveryCoreAsset width={155} height={155} style={styles.coreAsset} />

        {metrics.map((metric) => (
          <RecoveryMetricNode
            key={metric.key}
            metric={metric}
            isSelected={selectedMetric === metric.key}
            onPress={() => onSelectMetric(metric.key)}
          />
        ))}

        <Pressable onPress={() => onSelectMetric('recovery')} style={styles.coreCenter}>
          <Text style={styles.coreScore}>{selectedScore == null ? '--/100' : `${selectedScore}/100`}</Text>
          <Text style={styles.coreLabel}>{selectedLabel}</Text>
          <View style={styles.coreState}>
            <Text style={styles.coreStateText}>{selectedState.label}</Text>
          </View>
          <Text style={styles.coreHelper} numberOfLines={1}>{selectedHelper}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const RecoveryMetricNode = ({
  metric,
  isSelected,
  onPress
}: {
  metric: RecoveryMetric;
  isSelected: boolean;
  onPress: () => void;
}) => {
  const Icon = isSelected ? metric.ActiveIcon : metric.DefaultIcon;
  return (
    <Pressable onPress={onPress} style={[styles.metricNode, nodePositions[metric.position]]}>
      <Icon width={isSelected ? 44 : 38} height={isSelected ? 50 : 46} />
      <Text style={[styles.metricLabel, isSelected && styles.metricLabelSelected]}>{metric.label}</Text>
      <Text style={styles.metricScore}>{metric.score == null ? metric.helper : `${metric.score}/100`}</Text>
    </Pressable>
  );
};

const ActionPill = ({
  label,
  Icon,
  onPress
}: {
  label: string;
  Icon: SvgAsset;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={styles.actionPill}>
    <Icon width={18} height={18} />
    <Text style={styles.actionPillText}>{label}</Text>
  </Pressable>
);

const MiniStatusCard = ({
  title,
  icon,
  metrics,
  labels,
  action,
  onPress
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  metrics: string[];
  labels: string[];
  action: string;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={styles.miniCard}>
    <View style={styles.miniTop}>
      <Text style={styles.miniTitle}>{title}</Text>
      <Ionicons name={icon} size={22} color="#F4F7F4" />
    </View>
    <View style={styles.miniMetricRow}>
      {metrics.map((metric, index) => (
        <View key={`${metric}-${labels[index]}`} style={styles.miniMetric}>
          <Text style={styles.miniValue}>{metric}</Text>
          <Text style={styles.miniLabel}>{labels[index]}</Text>
        </View>
      ))}
    </View>
    <Text style={styles.miniAction}>{action}</Text>
  </Pressable>
);

const HealthConnectionCard = ({ body, onPress }: { body: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.connectCard}>
    <View style={styles.connectTop}>
      <View style={styles.alertDot}>
        <Ionicons name="alert-circle-outline" size={22} color="#FFFFFF" />
      </View>
      <Text style={styles.connectTitle}>Connect health data</Text>
    </View>
    <Text style={styles.connectBody}>{body}</Text>
    <Text style={styles.connectAction}>Connect now to strengthen daily health intelligence.</Text>
  </Pressable>
);

const SyncStrip = ({ body, onPress }: { body: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.syncStrip}>
    <Ionicons name="checkmark-circle-outline" size={20} color="#8DF58B" />
    <Text style={styles.syncStripText}>{body}</Text>
    <Ionicons name="chevron-forward" size={18} color="#9FA7A1" />
  </Pressable>
);

const HealthSnapshotCard = ({ metrics }: { metrics: ReturnType<typeof buildHealthSnapshotMetrics> }) => {
  const items = [
    { label: 'BMI', value: metrics.bmi != null ? metrics.bmi.toFixed(1) : 'Pending' },
    { label: 'Daily Energy', value: metrics.calorieTarget ? `${metrics.calorieTarget} kcal` : 'Pending' },
    { label: 'Protein', value: metrics.proteinTargetGrams ? `${metrics.proteinTargetGrams} g` : 'Pending' },
    { label: 'Hydration', value: metrics.hydrationTargetLiters ? `${metrics.hydrationTargetLiters} L` : 'Pending' }
  ];

  return (
    <View style={styles.snapshotCard}>
      <Text style={styles.sectionTitle}>Your Health Snapshot</Text>
      <Text style={styles.sectionSubtitle}>Calculated from saved profile data</Text>
      <View style={styles.snapshotGrid}>
        {items.map((item) => (
          <View key={item.label} style={styles.snapshotTile}>
            <Text style={styles.snapshotLabel}>{item.label}</Text>
            <Text style={styles.snapshotValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const ProfileStrengthCard = ({ percent, onPress }: { percent: number; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.profileCard}>
    <Text style={styles.profileEyebrow}>Your Health Journey</Text>
    <Text style={styles.profileTitle}>Complete your profile to unlock personalised care.</Text>
    <Text style={styles.profileBody}>Profile strength {percent}% · better body metrics, reports, and health history improve every recommendation.</Text>
    <View style={styles.profileProgress}>
      <View style={[styles.profileProgressFill, { width: `${Math.max(8, percent)}%` }]} />
    </View>
    <View style={styles.profileButton}>
      <Text style={styles.profileButtonText}>Update My Health Profile</Text>
    </View>
  </Pressable>
);

const JourneyIntelligenceCard = ({
  title,
  body,
  action,
  onPress
}: {
  title: string;
  body: string;
  action: string;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={styles.journeyCard}>
    <View style={styles.journeyIcon}>
      <Ionicons name="document-text-outline" size={22} color="#DDE6DD" />
    </View>
    <View style={styles.journeyCopy}>
      <Text style={styles.journeyTitle}>{title}</Text>
      <Text style={styles.journeyBody}>{body}</Text>
      <Text style={styles.journeyAction}>{action}</Text>
    </View>
  </Pressable>
);

const nodePositions = StyleSheet.create({
  top: {
    top: 44,
    left: 151
  },
  left: {
    left: 18,
    top: 128
  },
  right: {
    right: 18,
    top: 128
  },
  bottomLeft: {
    left: 64,
    bottom: 44
  },
  bottomRight: {
    right: 64,
    bottom: 44
  }
});

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0
  },
  scrollContent: {
    paddingBottom: 112,
    gap: 18
  },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#303642',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#163923',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4B5C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 9,
    lineHeight: 11
  },
  trendCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2426',
    backgroundColor: '#090A0B',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8
  },
  trendTitle: {
    color: '#FFFFFF',
    fontFamily: font.semiBold,
    fontSize: 12,
    lineHeight: 15
  },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 5
  },
  trendItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6
  },
  trendPill: {
    width: '100%',
    height: 27,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  trendValue: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 14
  },
  trendDay: {
    color: '#E6EAE7',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 13
  },
  recoverySection: {
    gap: 4
  },
  recoveryActions: {
    minHeight: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2
  },
  actionPill: {
    minHeight: 32,
    borderRadius: 18,
    backgroundColor: '#060606',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  actionPillText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 15
  },
  starWrap: {
    height: 360,
    marginTop: -8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  starAsset: {
    position: 'absolute',
    top: -18,
    left: -3
  },
  stateAsset: {
    position: 'absolute',
    top: 112,
    left: 135,
    opacity: 0.5
  },
  coreAsset: {
    position: 'absolute',
    top: 103,
    left: 103,
    opacity: 0.88
  },
  coreCenter: {
    position: 'absolute',
    top: 113,
    left: 102,
    width: 154,
    height: 154,
    borderRadius: 77,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3
  },
  coreScore: {
    color: '#E3E7ED',
    fontFamily: font.bold,
    fontSize: 26,
    lineHeight: 30
  },
  coreLabel: {
    color: '#E2E7E4',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 15
  },
  coreState: {
    minHeight: 25,
    borderRadius: 13,
    backgroundColor: '#F63737',
    paddingHorizontal: 11,
    justifyContent: 'center'
  },
  coreStateText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 10,
    lineHeight: 12
  },
  coreHelper: {
    maxWidth: 118,
    color: '#B3BAB8',
    fontFamily: font.medium,
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center'
  },
  metricNode: {
    position: 'absolute',
    width: 86,
    alignItems: 'center',
    gap: 2
  },
  metricLabel: {
    color: '#F5F7F5',
    fontFamily: font.bold,
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'center'
  },
  metricLabelSelected: {
    color: '#FFFFFF'
  },
  metricScore: {
    color: '#B5BDB9',
    fontFamily: font.medium,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center'
  },
  twoCardRow: {
    flexDirection: 'row',
    gap: 10
  },
  miniCard: {
    flex: 1,
    minHeight: 130,
    borderRadius: 16,
    backgroundColor: '#0E0F0F',
    borderWidth: 1,
    borderColor: '#202423',
    padding: 12,
    gap: 10
  },
  miniTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  miniTitle: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 13,
    lineHeight: 16
  },
  miniMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8
  },
  miniMetric: {
    flex: 1,
    gap: 3
  },
  miniValue: {
    color: '#FFFFFF',
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 19
  },
  miniLabel: {
    color: '#7B817D',
    fontFamily: font.regular,
    fontSize: 8,
    lineHeight: 10
  },
  miniAction: {
    marginTop: 'auto',
    color: '#9BE95E',
    fontFamily: font.bold,
    fontSize: 10,
    lineHeight: 12
  },
  connectCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#384229',
    backgroundColor: '#252A17',
    padding: 16,
    gap: 14
  },
  connectTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  alertDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  connectTitle: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 17,
    lineHeight: 21
  },
  connectBody: {
    color: '#E0E7E0',
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22
  },
  connectAction: {
    color: '#5FC100',
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 22
  },
  syncStrip: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#254633',
    backgroundColor: '#101A14',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  syncStripText: {
    flex: 1,
    color: '#DCE8DE',
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 16
  },
  snapshotCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#203B2D',
    backgroundColor: '#0F1D15',
    padding: 16,
    gap: 12
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 22,
    lineHeight: 27
  },
  sectionSubtitle: {
    color: '#B3C0B6',
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18
  },
  snapshotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  snapshotTile: {
    width: '48%',
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: '#1A3B28',
    padding: 12,
    justifyContent: 'space-between'
  },
  snapshotLabel: {
    color: '#B3C3B7',
    fontFamily: font.semiBold,
    fontSize: 12,
    lineHeight: 15
  },
  snapshotValue: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 18,
    lineHeight: 22
  },
  profileCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#294F3B',
    backgroundColor: '#0D2518',
    padding: 16,
    gap: 12
  },
  profileEyebrow: {
    color: '#5FC100',
    fontFamily: font.bold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  profileTitle: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 25,
    lineHeight: 31
  },
  profileBody: {
    color: '#C7D1CA',
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 23
  },
  profileProgress: {
    height: 10,
    borderRadius: 99,
    backgroundColor: '#244F35',
    overflow: 'hidden'
  },
  profileProgressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: '#62C800'
  },
  profileButton: {
    alignSelf: 'flex-start',
    borderRadius: 99,
    backgroundColor: '#5FC100',
    paddingHorizontal: 26,
    paddingVertical: 16
  },
  profileButtonText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 17,
    lineHeight: 21
  },
  journeyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C332F',
    backgroundColor: '#111211',
    padding: 14,
    flexDirection: 'row',
    gap: 12
  },
  journeyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1B251E',
    alignItems: 'center',
    justifyContent: 'center'
  },
  journeyCopy: {
    flex: 1
  },
  journeyTitle: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 19
  },
  journeyBody: {
    color: '#AFB8B0',
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4
  },
  journeyAction: {
    color: '#9BE95E',
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 15,
    marginTop: 7
  }
});
