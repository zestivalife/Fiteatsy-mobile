import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, SvgProps } from 'react-native-svg';
import AssistIcon from '../../assets/fiteatsy-home/assist.svg';
import WearableSyncIcon from '../../assets/fiteatsy-home/wearable-sync.svg';
import RecoveryCoreAsset from '../../assets/fiteatsy-home/recovery-core.svg';
import RecoveryStarAsset from '../../assets/fiteatsy-home/recovery-star.svg';
import StateBorderlineAsset from '../../assets/fiteatsy-home/state-borderline.svg';
import StateDeclineAsset from '../../assets/fiteatsy-home/state-decline.svg';
import StateDefaultAsset from '../../assets/fiteatsy-home/state-default.svg';
import StateSuccessAsset from '../../assets/fiteatsy-home/state-success.svg';
import ActivityDefaultIcon from '../../assets/fiteatsy-home/activity-default.png';
import ActivityActiveIcon from '../../assets/fiteatsy-home/activity-active.png';
import NutritionDefaultIcon from '../../assets/fiteatsy-home/nutrition-default.png';
import NutritionActiveIcon from '../../assets/fiteatsy-home/nutrition-active.png';
import MindDefaultIcon from '../../assets/fiteatsy-home/mind-default.svg';
import MindActiveIcon from '../../assets/fiteatsy-home/mind-active.svg';
import SleepDefaultIcon from '../../assets/fiteatsy-home/sleep-default.png';
import SleepActiveIcon from '../../assets/fiteatsy-home/sleep-active.png';
import CalmDefaultIcon from '../../assets/fiteatsy-home/calm-default.png';
import CalmActiveIcon from '../../assets/fiteatsy-home/calm-active.png';
import { RootStackParamList } from '../../navigation/types';
import { buildRecoveryIntelligence, type RecoveryDriver } from '../../services/recoveryIntelligenceEngine';
import { listAnalyzedReports, type ReportDto } from '../../services/reportUploadService';
import { useAppContext } from '../../state/AppContext';
import { getIdentityScopedStorageKey } from '../../utils/identityScopedStorage';

const REPORT_HISTORY_STORAGE_KEY = 'fiteatsy.reportHistory';
const trendDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const ARC_CIRCUMFERENCE = 2 * Math.PI * 42;

const font = {
  regular: 'Exo_400Regular',
  medium: 'Exo_500Medium',
  semiBold: 'Exo_600SemiBold',
  bold: 'Exo_700Bold'
} as const;

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MetricKey = 'recovery' | 'calm' | 'activity' | 'nutrition' | 'mind' | 'sleep';
type SvgAsset = React.FC<SvgProps>;

type RecoveryMetric = {
  key: Exclude<MetricKey, 'recovery'>;
  label: string;
  score: number | null;
  position: 'top' | 'left' | 'right' | 'bottomLeft' | 'bottomRight';
  DefaultIcon: SvgAsset | ImageSourcePropType;
  ActiveIcon: SvgAsset | ImageSourcePropType;
  iconType?: 'svg' | 'image';
};

type HealthProfileReportSummary = {
  id: string;
  labName: string;
  date: string;
  abnormal: number;
  score: number;
  uploadedAtISO?: string;
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
  if (score == null) return { label: 'No data', Asset: StateDefaultAsset };
  if (score >= 80) return { label: 'Strong Today', Asset: StateSuccessAsset };
  if (score >= 55) return { label: 'Borderline', Asset: StateBorderlineAsset };
  return { label: 'Lower Today', Asset: StateDeclineAsset };
};

const driverScore = (drivers: RecoveryDriver[], key: RecoveryDriver['key'], requireSignal: boolean) => {
  if (!requireSignal) return null;
  return drivers.find((driver) => driver.key === key && driver.weight > 0)?.score ?? null;
};

export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const {
    onboarding,
    wellness,
    checkIns,
    wearableSyncData,
    authSession
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

  const hasTrendData = !recoveryIntel.isCalibrating && recoveryIntel.trendValues7d.some((value) => value > 0);
  const trendValues = hasTrendData ? recoveryIntel.trendValues7d.slice(0, 7) : [];
  const metrics: RecoveryMetric[] = [
    {
      key: 'calm',
      label: 'Calm',
      score: recoveryIntel.calmScore,
      position: 'top',
      DefaultIcon: CalmDefaultIcon,
      ActiveIcon: CalmActiveIcon,
      iconType: 'image'
    },
    {
      key: 'activity',
      label: 'Activity',
      score: driverScore(recoveryIntel.recoveryDrivers, 'activity', recoveryIntel.signalCoverage.workouts),
      position: 'left',
      DefaultIcon: ActivityDefaultIcon,
      ActiveIcon: ActivityActiveIcon,
      iconType: 'image'
    },
    {
      key: 'nutrition',
      label: 'Nutrition',
      score: null,
      position: 'right',
      DefaultIcon: NutritionDefaultIcon,
      ActiveIcon: NutritionActiveIcon,
      iconType: 'image'
    },
    {
      key: 'mind',
      label: onboarding?.gender === 'Female' ? 'Rhythm' : 'Mind',
      score: checkIns.length > 0
        ? driverScore(recoveryIntel.recoveryDrivers, 'emotional_checkins', true)
        : null,
      position: 'bottomLeft',
      DefaultIcon: MindDefaultIcon,
      ActiveIcon: MindActiveIcon
    },
    {
      key: 'sleep',
      label: 'Sleep',
      score: driverScore(recoveryIntel.recoveryDrivers, 'sleep', recoveryIntel.signalCoverage.sleep),
      position: 'bottomRight',
      DefaultIcon: SleepDefaultIcon,
      ActiveIcon: SleepActiveIcon,
      iconType: 'image'
    }
  ];

  const selected = selectedMetric === 'recovery'
    ? { label: 'Recovery Core', score: recoveryIntel.recoveryScore }
    : metrics.find((metric) => metric.key === selectedMetric) ?? { label: 'Recovery Core', score: recoveryIntel.recoveryScore };
  const selectedState = stateFromScore(selected.score);

  return (
    <SafeAreaView style={styles.safe}>
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
            <ActionPill label="Assist" Icon={AssistIcon} onPress={() => setSelectedMetric('calm')} />
            <ActionPill label="Sync" Icon={WearableSyncIcon} onPress={() => navigation.navigate('SyncWearable')} />
          </View>

          <RecoveryPanel
            metrics={metrics}
            selectedMetric={selectedMetric}
            selectedLabel={selected.label}
            selectedScore={selected.score}
            selectedState={selectedState}
            onSelectMetric={setSelectedMetric}
          />

          <View style={styles.summaryRow}>
            <MedicationCard />
            <StressCard score={recoveryIntel.stressRecoveryScore} />
          </View>
        </View>
      </ScrollView>
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
  selectedState,
  onSelectMetric
}: {
  metrics: RecoveryMetric[];
  selectedMetric: MetricKey;
  selectedLabel: string;
  selectedScore: number | null;
  selectedState: { label: string; Asset: SvgAsset };
  onSelectMetric: (metric: MetricKey) => void;
}) => {
  const StateAsset = selectedState.Asset;
  const dashOffset = selectedScore == null ? ARC_CIRCUMFERENCE : ARC_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, selectedScore)) / 100);

  return (
    <View style={styles.recoveryPanel}>
      <RecoveryStarAsset width={338} height={410} style={styles.starAsset} />
      <RecoveryCoreAsset width={151} height={159} style={styles.coreAsset} />
      <StateAsset width={72} height={100} style={styles.stateAsset} />
      <Svg width={118} height={118} viewBox="0 0 118 118" style={styles.arcLayer}>
        <Circle cx="59" cy="59" r="42" stroke="rgba(255,255,255,0.04)" strokeWidth={15} fill="transparent" />
        {selectedScore != null ? (
          <Circle
            cx="59"
            cy="59"
            r="42"
            stroke="#D5062D"
            strokeWidth={15}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={`${ARC_CIRCUMFERENCE} ${ARC_CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            rotation="-84"
            originX="59"
            originY="59"
          />
        ) : null}
      </Svg>

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
        <View style={styles.stateChip}>
          <Text style={styles.stateChipText}>{selectedState.label}</Text>
        </View>
      </Pressable>
    </View>
  );
};

const RecoveryNode = ({ metric, selected, onPress }: { metric: RecoveryMetric; selected: boolean; onPress: () => void }) => {
  const Icon = selected ? metric.ActiveIcon : metric.DefaultIcon;
  const isImage = metric.iconType === 'image';
  const SvgIcon = Icon as SvgAsset;
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
        <SvgIcon width={selected ? 41 : 37} height={selected ? 50 : 45} />
      )}
    </Pressable>
  );
};

const MedicationCard = () => (
  <Pressable style={styles.infoCard} accessibilityRole="button" accessibilityLabel="Open medication logs">
    <View style={styles.cardTitleRow}>
      <Text style={styles.cardTitle}>Medication</Text>
      <Ionicons name="medical-outline" size={22} color="#F4F7F4" />
    </View>
    <View style={styles.medicationMetrics}>
      {[
        ['5/10', 'Taken'],
        ['2/10', 'Pending'],
        ['3/10', 'Missed']
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

const StressCard = ({ score }: { score: number | null }) => (
  <View style={styles.infoCard}>
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
  </View>
);

const nodePositions = StyleSheet.create({
  top: {
    top: 42,
    left: 150
  },
  left: {
    top: 119,
    left: 40
  },
  right: {
    top: 119,
    right: 36
  },
  bottomLeft: {
    left: 88,
    bottom: 42
  },
  bottomRight: {
    right: 84,
    bottom: 42
  }
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1C2225'
  },
  scrollContent: {
    paddingBottom: 116
  },
  referenceFrame: {
    width: '100%',
    maxWidth: 390,
    alignSelf: 'center',
    paddingHorizontal: 16,
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
    height: 311,
    marginTop: -4,
    position: 'relative',
    alignItems: 'center',
    overflow: 'visible'
  },
  starAsset: {
    position: 'absolute',
    top: -54,
    left: 10
  },
  coreAsset: {
    position: 'absolute',
    top: 72,
    left: 103,
    opacity: 0.94
  },
  stateAsset: {
    position: 'absolute',
    top: 98,
    left: 142,
    opacity: 0.08
  },
  arcLayer: {
    position: 'absolute',
    top: 94,
    left: 118
  },
  coreCenter: {
    position: 'absolute',
    top: 100,
    left: 118,
    width: 118,
    height: 118,
    borderRadius: 59,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  coreScore: {
    color: '#E4E8ED',
    fontFamily: font.bold,
    fontSize: 25,
    lineHeight: 29
  },
  coreLabel: {
    color: '#E1E4E3',
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 13
  },
  stateChip: {
    minHeight: 22,
    borderRadius: 12,
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
    width: 66,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center'
  },
  recoveryNodeSelected: {
    transform: [{ scale: 1.04 }]
  },
  nodeImage: {
    width: 45,
    height: 50
  },
  nodeImageCalmActive: {
    width: 42,
    height: 58
  },
  nodeImageCalmDefault: {
    width: 33,
    height: 53
  },
  summaryRow: {
    marginTop: -3,
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
