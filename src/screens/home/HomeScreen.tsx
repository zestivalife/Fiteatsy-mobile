import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { radius, spacing } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { buildRecoveryIntelligence } from '../../services/recoveryIntelligenceEngine';
import { buildHealthProfileCompletion } from '../../utils/healthProfileCompletion';
import { buildHealthSnapshotMetrics } from '../../utils/healthMetrics';
import { getIdentityScopedStorageKey } from '../../utils/identityScopedStorage';
import { listAnalyzedReports, type ReportDto } from '../../services/reportUploadService';

const REPORT_HISTORY_STORAGE_KEY = 'fiteatsy.reportHistory';
const trendDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const font = {
  regular: 'Exo_400Regular',
  medium: 'Exo_500Medium',
  semiBold: 'Exo_600SemiBold',
  bold: 'Exo_700Bold'
} as const;

type Nav = NativeStackNavigationProp<RootStackParamList>;

type HealthProfileReportSummary = {
  id: string;
  labName: string;
  date: string;
  abnormal: number;
  score: number;
  uploadedAtISO?: string;
};

type RecoveryNode = {
  key: string;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  position: 'top' | 'left' | 'right' | 'bottomLeft' | 'bottomRight';
  active: boolean;
  onPress: () => void;
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

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Hi!,';
  if (hour < 17) return 'Hi!,';
  return 'Hi!,';
};

const firstName = (name?: string | null) => {
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
  if (value >= 80) return { bg: '#8DF58B', text: '#111111' };
  if (value >= 60) return { bg: '#C8FF70', text: '#111111' };
  if (value >= 35) return { bg: '#77D3F6', text: '#111111' };
  if (value >= 16) return { bg: '#F5ED78', text: '#111111' };
  return { bg: '#F75C67', text: '#FFFFFF' };
};

const recoveryStateLabel = (direction: 'improving' | 'declining' | 'stable', score: number | null) => {
  if (score == null) return 'Calibrating';
  if (direction === 'improving') return 'Improving';
  if (direction === 'declining') return 'Lower Today';
  return 'Stable';
};

export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const {
    onboarding,
    assessment,
    wellness,
    checkIns,
    themeMode,
    selectedDeviceId,
    wearableSyncData,
    devices,
    publishedNutritionPlan,
    refreshPublishedNutritionPlan,
    authSession
  } = useAppContext();
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
  const displayScore = recoveryIntel.recoveryScore;
  const cycleLabel = onboarding?.gender === 'Female' ? 'Rhythm' : 'Mind';
  const cycleValue = onboarding?.gender === 'Female'
    ? onboarding?.pcosStatus || onboarding?.pregnancyStatus || 'Track cycle'
    : checkIns.length > 0
      ? `Mood ${Math.max(1, Math.round(wellness.moodScore))}/5`
      : 'Check in';

  const recoveryNodes: RecoveryNode[] = [
    {
      key: 'calm',
      label: 'Calm',
      value: recoveryIntel.calmScore == null ? 'Calibrating' : `${recoveryIntel.calmScore}/100`,
      icon: 'heart',
      position: 'top',
      active: recoveryIntel.calmScore != null,
      onPress: () => navigation.getParent()?.navigate('Sessions')
    },
    {
      key: 'activity',
      label: 'Activity',
      value: hasWearableSignals ? `${Math.round(wellness.movementMinutes)} min` : 'Not connected',
      icon: 'walk-outline',
      position: 'left',
      active: hasWearableSignals,
      onPress: () => navigation.getParent()?.navigate('Tracker')
    },
    {
      key: 'nutrition',
      label: 'Nutrition',
      value: publishedNutritionPlan ? `${publishedNutritionPlan.version.contentSummary.protein}g protein` : 'Plan pending',
      icon: 'leaf-outline',
      position: 'right',
      active: Boolean(publishedNutritionPlan),
      onPress: () => navigation.getParent()?.navigate('Nutrition')
    },
    {
      key: 'rhythm',
      label: cycleLabel,
      value: cycleValue,
      icon: onboarding?.gender === 'Female' ? 'flower-outline' : 'sparkles-outline',
      position: 'bottomLeft',
      active: checkIns.length > 0 || onboarding?.gender === 'Female',
      onPress: () => navigation.getParent()?.navigate('Sessions')
    },
    {
      key: 'sleep',
      label: 'Sleep',
      value: recoveryIntel.signalCoverage.sleep ? `${wellness.sleepHours.toFixed(1)} hrs` : 'No data',
      icon: 'moon-outline',
      position: 'bottomRight',
      active: recoveryIntel.signalCoverage.sleep,
      onPress: () => navigation.getParent()?.navigate('Tracker')
    }
  ];

  const connectionCopy = connectedDevice
    ? `Synced ${compactDate(latestSync?.syncedAtISO)} from ${connectedDevice.model}.`
    : 'Unlock Activity, Sleep, Calm, and Recovery scores from real Health Connect or Apple Health signals.';

  return (
    <Screen contentStyle={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Header
          name={firstName(onboarding?.name)}
          onSearch={() => navigation.navigate('Search')}
          onAdd={() => navigation.navigate('Leadership')}
          onNotifications={() => navigation.navigate('Notifications')}
          onProfile={() => navigation.navigate('Profile')}
        />

        <RecoveryTrendCard values={trendValues} hasData={hasTrendData} />

        <RecoveryCoreCard
          score={displayScore}
          state={recoveryStateLabel(recoveryIntel.recoveryDirection, displayScore)}
          insight={recoveryIntel.contextualInsights[0] ?? recoveryIntel.insufficientReason ?? 'Recovery calibration adapting to your rhythm.'}
          nodes={recoveryNodes}
          onAssist={() => navigation.getParent()?.navigate('Sessions')}
          onSync={() => navigation.navigate('SyncWearable')}
        />

        <View style={styles.twoCardRow}>
          <MiniStatusCard
            title="Medication"
            icon="medical-outline"
            value="Not set"
            body="Add medication reminders to track taken, pending, and missed doses."
            action="Medication Logs +"
            onPress={() => navigation.navigate('MedicationCalendar')}
          />
          <MiniStatusCard
            title="Stress Recovery"
            icon="headset-outline"
            value={recoveryIntel.stressRecoveryScore == null ? 'Calibrating' : `${recoveryIntel.stressRecoveryScore}/100`}
            body={recoveryIntel.stressRecoveryScore == null ? 'Adjusted after sleep, HRV, and calm signals sync.' : 'Based on recent calm, sleep, and HRV signals.'}
            action="Open Care"
            onPress={() => navigation.getParent()?.navigate('Sessions')}
          />
        </View>

        {!connectedDevice ? (
          <HealthConnectionCard status="NOT CONNECTED" body={connectionCopy} onPress={() => navigation.navigate('SyncWearable')} />
        ) : (
          <SyncStrip body={connectionCopy} onPress={() => navigation.navigate('ConnectedMetrics')} />
        )}

        <HealthSnapshotCard metrics={healthMetrics} />

        {profileCompletion.completionPercent < 85 ? (
          <ProfileStrengthCard
            percent={profileCompletion.completionPercent}
            missing={profileCompletion.missingItems.slice(0, 3)}
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
          onPress={() => navigation.navigate('HealthReports')}
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
    <View>
      <Text style={styles.headerHello}>{getGreeting()}</Text>
      <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
    </View>
    <View style={styles.headerActions}>
      <HeaderIcon icon="search-outline" onPress={onSearch} />
      <HeaderIcon icon="add-circle-outline" onPress={onAdd} />
      <HeaderIcon icon="notifications-outline" onPress={onNotifications} badge="9" />
      <Pressable onPress={onProfile} style={styles.avatar}>
        <Ionicons name="person-outline" size={24} color="#E9F0EA" />
      </Pressable>
    </View>
  </View>
);

const HeaderIcon = ({ icon, onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; badge?: string }) => (
  <Pressable onPress={onPress} style={styles.headerIcon}>
    <Ionicons name={icon} size={21} color="#F4F7F4" />
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
        const value = values[index];
        const tone = hasData ? trendTone(value) : { bg: index === 0 || index === 6 ? '#050505' : '#232629', text: '#FFFFFF' };
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

const RecoveryCoreCard = ({
  score,
  state,
  insight,
  nodes,
  onAssist,
  onSync
}: {
  score: number | null;
  state: string;
  insight: string;
  nodes: RecoveryNode[];
  onAssist: () => void;
  onSync: () => void;
}) => (
  <View style={styles.recoveryCard}>
    <View style={styles.recoveryActions}>
      <ActionPill label="Assist" icon="sparkles-outline" onPress={onAssist} />
      <ActionPill label="Sync" icon="watch-outline" onPress={onSync} />
    </View>

    <View style={styles.organicWrap}>
      <Svg width="100%" height="100%" viewBox="0 0 340 310" style={StyleSheet.absoluteFillObject}>
        <Defs>
          <SvgLinearGradient id="organicFill" x1="44" y1="10" x2="300" y2="298" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#24272B" />
            <Stop offset="0.52" stopColor="#141719" />
            <Stop offset="1" stopColor="#0B0D0E" />
          </SvgLinearGradient>
          <SvgLinearGradient id="coreGlow" x1="110" y1="80" x2="220" y2="230" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#7A7E85" stopOpacity="0.38" />
            <Stop offset="1" stopColor="#070808" stopOpacity="0.92" />
          </SvgLinearGradient>
        </Defs>
        <Path
          d="M157.9 21.2C176.5 8.6 201.8 16.1 210.6 36.7L230.4 83.2C235.7 95.7 247.7 104.2 261.2 105L300.8 107.3C324.7 108.7 340.1 133.1 329.8 154.7L312.9 190.1C307.2 202.1 309.1 216.3 317.8 226.4L332.2 243.1C347.2 260.6 335.7 287.8 312.7 289.4L225.9 295.5C218.2 296.1 210.8 299 204.8 303.8C185.6 319.2 158.4 319.2 139.2 303.8C133.2 299 125.8 296.1 118.1 295.5L31.3 289.4C8.3 287.8 -3.2 260.6 11.8 243.1L26.2 226.4C34.9 216.3 36.8 202.1 31.1 190.1L14.2 154.7C3.9 133.1 19.3 108.7 43.2 107.3L82.8 105C96.3 104.2 108.3 95.7 113.6 83.2L133.4 36.7C138.2 25.4 147.1 28.6 157.9 21.2Z"
          fill="url(#organicFill)"
        />
        <Circle cx="170" cy="164" r="73" fill="url(#coreGlow)" />
        <Circle cx="170" cy="164" r="54" fill="#1B1C20" opacity="0.94" />
      </Svg>

      {nodes.map((node) => (
        <RecoveryNodeChip key={node.key} node={node} />
      ))}

      <View style={styles.coreCenter}>
        <Text style={styles.coreScore}>{score == null ? '...' : `${score}/100`}</Text>
        <Text style={styles.coreLabel}>Recovery Core</Text>
        <View style={[styles.coreState, state === 'Lower Today' ? styles.coreStateAlert : styles.coreStateNeutral]}>
          <Text style={styles.coreStateText}>{state}</Text>
        </View>
      </View>
    </View>

    <View style={styles.recoveryFooter}>
      <Text style={styles.recoveryFooterTitle}>{insight}</Text>
      <Text style={styles.recoveryFooterBody}>Tap Activity, Nutrition, Sleep, Recovery, or Mind to open focused intelligence.</Text>
    </View>
  </View>
);

const RecoveryNodeChip = ({ node }: { node: RecoveryNode }) => (
  <Pressable onPress={node.onPress} style={[styles.nodeChip, nodePositions[node.position]]}>
    <View style={[styles.nodeIcon, node.active ? styles.nodeIconActive : null]}>
      <Ionicons name={node.icon} size={24} color={node.active ? '#F4F7F4' : '#A8B1AA'} />
    </View>
    <Text style={styles.nodeLabel}>{node.label}</Text>
    <Text style={styles.nodeValue} numberOfLines={1}>{node.value}</Text>
  </Pressable>
);

const ActionPill = ({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.actionPill}>
    <Ionicons name={icon} size={16} color="#FFFFFF" />
    <Text style={styles.actionPillText}>{label}</Text>
  </Pressable>
);

const MiniStatusCard = ({
  title,
  icon,
  value,
  body,
  action,
  onPress
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  body: string;
  action: string;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={styles.miniCard}>
    <View style={styles.miniTop}>
      <Text style={styles.miniTitle}>{title}</Text>
      <Ionicons name={icon} size={22} color="#F4F7F4" />
    </View>
    <Text style={styles.miniValue}>{value}</Text>
    <Text style={styles.miniBody}>{body}</Text>
    <Text style={styles.miniAction}>{action}</Text>
  </Pressable>
);

const HealthConnectionCard = ({ status, body, onPress }: { status: string; body: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.connectCard}>
    <View style={styles.connectTop}>
      <View style={styles.connectTitleRow}>
        <Ionicons name="link-outline" size={22} color="#7BE2D0" />
        <Text style={styles.connectTitle}>Connect Health Data</Text>
      </View>
      <Text style={styles.connectBadge}>{status}</Text>
    </View>
    <Text style={styles.connectBody}>{body}</Text>
    <Text style={styles.connectAction}>Connect now +</Text>
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

const ProfileStrengthCard = ({ percent, missing, onPress }: { percent: number; missing: string[]; onPress: () => void }) => (
  <LinearGradient colors={['#101713', '#090D0B']} style={styles.profileCard}>
    <Text style={styles.profileEyebrow}>Your Health Journey</Text>
    <Text style={styles.profileTitle}>Strength: {percent}%</Text>
    <Text style={styles.profileBody}>You unlocked basic insights. Complete the next sections to improve consultant recommendations.</Text>
    <View style={styles.profileProgress}>
      <View style={[styles.profileProgressFill, { width: `${Math.max(8, percent)}%` }]} />
    </View>
    {missing.length ? (
      <View style={styles.missingList}>
        {missing.map((item) => (
          <Text key={item} style={styles.missingText}>○ {item}</Text>
        ))}
      </View>
    ) : null}
    <Pressable onPress={onPress} style={styles.profileButton}>
      <Text style={styles.profileButtonText}>Continue Journey</Text>
    </Pressable>
  </LinearGradient>
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
    <View style={{ flex: 1 }}>
      <Text style={styles.journeyTitle}>{title}</Text>
      <Text style={styles.journeyBody}>{body}</Text>
      <Text style={styles.journeyAction}>{action}</Text>
    </View>
  </Pressable>
);

const nodePositions = StyleSheet.create({
  top: {
    top: 32,
    left: '50%',
    marginLeft: -50
  },
  left: {
    left: 12,
    top: 124
  },
  right: {
    right: 12,
    top: 124
  },
  bottomLeft: {
    left: 56,
    bottom: 20
  },
  bottomRight: {
    right: 56,
    bottom: 20
  }
});

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: 0
  },
  scrollContent: {
    paddingBottom: 118,
    gap: 16
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    marginTop: 8
  },
  headerHello: {
    color: '#B9C5BB',
    fontFamily: font.semiBold,
    fontSize: 16,
    lineHeight: 20
  },
  headerName: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 40,
    lineHeight: 42,
    maxWidth: 120
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#153923',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4B5C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 10,
    lineHeight: 12
  },
  trendCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1D2A23',
    backgroundColor: '#070A08',
    padding: 10,
    gap: 9
  },
  trendTitle: {
    color: '#F4F7F4',
    fontFamily: font.semiBold,
    fontSize: 13,
    lineHeight: 17
  },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6
  },
  trendItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5
  },
  trendPill: {
    width: '100%',
    minWidth: 38,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center'
  },
  trendValue: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 14
  },
  trendDay: {
    color: '#D8E0D9',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 13
  },
  recoveryCard: {
    borderRadius: 28,
    backgroundColor: '#0F1D15',
    borderWidth: 1,
    borderColor: '#203B2D',
    padding: 12,
    overflow: 'hidden'
  },
  recoveryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: -6,
    zIndex: 2
  },
  actionPill: {
    minHeight: 32,
    borderRadius: radius.pill,
    backgroundColor: '#050505',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  actionPillText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 12
  },
  organicWrap: {
    height: 318,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center'
  },
  coreCenter: {
    width: 144,
    height: 144,
    borderRadius: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(12,13,14,0.26)'
  },
  coreScore: {
    color: '#E5E9ED',
    fontFamily: font.bold,
    fontSize: 28,
    lineHeight: 32
  },
  coreLabel: {
    color: '#CED4D0',
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 16
  },
  coreState: {
    marginTop: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  coreStateAlert: {
    backgroundColor: '#F63737'
  },
  coreStateNeutral: {
    backgroundColor: '#23262B'
  },
  coreStateText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 14
  },
  nodeChip: {
    position: 'absolute',
    width: 100,
    alignItems: 'center',
    gap: 3
  },
  nodeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#17291E',
    alignItems: 'center',
    justifyContent: 'center'
  },
  nodeIconActive: {
    backgroundColor: '#1C3828'
  },
  nodeLabel: {
    color: '#F4F7F4',
    fontFamily: font.bold,
    fontSize: 14,
    lineHeight: 17,
    textAlign: 'center'
  },
  nodeValue: {
    color: '#AEB8B0',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center'
  },
  recoveryFooter: {
    marginTop: 4,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#143522',
    borderWidth: 1,
    borderColor: '#2B523E',
    gap: 8
  },
  recoveryFooterTitle: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 20,
    lineHeight: 27,
    textAlign: 'center'
  },
  recoveryFooterBody: {
    color: '#B6C5B9',
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  twoCardRow: {
    flexDirection: 'row',
    gap: 10
  },
  miniCard: {
    flex: 1,
    minHeight: 136,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#282E2B',
    backgroundColor: '#111211',
    padding: 12,
    gap: 7
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
    fontSize: 14,
    lineHeight: 17
  },
  miniValue: {
    color: '#E9EFEA',
    fontFamily: font.semiBold,
    fontSize: 17,
    lineHeight: 20
  },
  miniBody: {
    color: '#97A19A',
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 15
  },
  miniAction: {
    marginTop: 'auto',
    color: '#9BE95E',
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 15
  },
  connectCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2B523E',
    backgroundColor: '#102217',
    padding: 16,
    gap: 11
  },
  connectTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  connectTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  connectTitle: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 18,
    lineHeight: 22
  },
  connectBadge: {
    color: '#16B8AA',
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 15
  },
  connectBody: {
    color: '#D4DDD5',
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20
  },
  connectAction: {
    color: '#5FC100',
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 18
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#29342D',
    padding: 16,
    gap: 12
  },
  profileEyebrow: {
    color: '#66BF11',
    fontFamily: font.bold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  profileTitle: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 22,
    lineHeight: 27
  },
  profileBody: {
    color: '#C7D1CA',
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19
  },
  profileProgress: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: '#243B2B',
    overflow: 'hidden'
  },
  profileProgressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: '#62C800'
  },
  missingList: {
    gap: 5
  },
  missingText: {
    color: '#D9E1DA',
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 15
  },
  profileButton: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: '#5FC100',
    paddingHorizontal: 18,
    paddingVertical: 11
  },
  profileButtonText: {
    color: '#FFFFFF',
    fontFamily: font.bold,
    fontSize: 14
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
