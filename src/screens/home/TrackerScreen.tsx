import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import {
  getTrackerImprovementInsights,
  TrackerSectionImprovementResult,
  TrackerTab
} from '../../services/trackerAnalysisService';
import { toDayKey } from '../../utils/date';
import { buildRecoveryIntelligence } from '../../services/recoveryIntelligenceEngine';

type RangeMode = '7D' | '30D';

type DayData = {
  key: string;
  dayLabel: string;
  dateNum: number;
  calories: number;
  distanceKm: number;
  steps: number;
  heartRate: number;
  activityEnergy: number[];
  cardioRecovery: number[];
  sleepScoreBars: number[];
  stressLoad: number[];
  focusTrend: number[];
  wellnessTrend: number[];
};

type MetricKind = 'spark' | 'bars';

type MetricConfig = {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  unit: string;
  kind: MetricKind;
  color: string;
  values: number[];
  latestValue: number;
  compareValues: number[];
  recoveryImpact: 'Supporting Recovery' | 'Neutral' | 'Reducing Recovery' | 'Needs Attention' | 'Positive';
  signalState: 'Improving' | 'Stable' | 'Declining' | 'Recovering' | 'Overloaded' | 'Settling';
  freshness: 'Synced Recently' | 'Manual Input' | 'No Recent Data' | 'Calibration Mode';
  confidence: 'High' | 'Moderate' | 'Low';
  primary?: boolean;
};

const chartW = 130;
const chartH = 56;
const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toPct = (value: number, min: number, max: number) => {
  if (max <= min) {
    return 0;
  }
  return (value - min) / (max - min);
};

const MetricSparkCard = ({
  title,
  subtitle,
  data,
  color,
  value,
  unit,
  icon,
  signalState,
  recoveryImpact,
  freshness,
  confidence,
  primary,
  onOpen,
  isLight
}: {
  title: string;
  subtitle: string;
  data: number[];
  color: string;
  value: number;
  unit: string;
  icon: string;
  signalState: string;
  recoveryImpact: string;
  freshness: string;
  confidence: string;
  primary?: boolean;
  onOpen: () => void;
  isLight: boolean;
}) => {
  const [selectedPoint, setSelectedPoint] = useState(data.length - 1);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setSelectedPoint(data.length - 1);
  }, [data]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 120, useNativeDriver: true })
    ]).start();
  }, [selectedPoint, pulse]);

  const min = Math.min(...data);
  const max = Math.max(...data);

  const points = data.map((pointValue, index) => {
    const x = 4 + (index * (chartW - 8)) / Math.max(1, data.length - 1);
    const y = chartH - 4 - toPct(pointValue, min, max) * (chartH - 12);
    return { x, y, value: pointValue };
  });

  const pointsString = points.map((p) => `${p.x},${p.y}`).join(' ');
  const selected = points[selectedPoint];

  return (
    <Pressable onPress={onOpen} style={[styles.metricTile, primary && styles.metricTilePrimary]}>
      <Card style={[styles.metricCard, isLight ? styles.metricCardLight : styles.metricCardDark]}>
        <View style={styles.metricHeaderRow}>
          <View style={[styles.metricIconWrap, !isLight && styles.metricIconWrapDark]}>
            <Text style={styles.metricIcon}>{icon}</Text>
          </View>
          <View style={styles.metricHeaderTextWrap}>
            <Text style={[styles.metricTitle, { color: isLight ? '#000000' : '#FFFFFF' }]} numberOfLines={1}>{title}</Text>
            <Text style={[styles.metricSubtitle, { color: isLight ? '#000000' : '#FFFFFF' }]} numberOfLines={1}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.sparkWrap}>
          <Svg width={chartW} height={chartH}>
            <Polyline points={pointsString} fill="none" stroke="#D2CFF2" strokeWidth={2} strokeOpacity={0.45} />
            <Polyline
              points={pointsString}
              fill="none"
              stroke={color}
              strokeWidth={2.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeOpacity={0.88}
            />
            {selected ? <Circle cx={selected.x} cy={selected.y} r={4} fill={color} /> : null}
          </Svg>

          <View style={styles.sparkTapRow}>
            {points.map((point, index) => (
              <Pressable key={`${title}-${index}`} onPress={() => setSelectedPoint(index)} style={styles.sparkTapHit}>
                <View style={[styles.sparkTapDot, !isLight && styles.sparkTapDotDark, index === selectedPoint && styles.sparkTapDotActive]} />
              </Pressable>
            ))}
          </View>
        </View>

        <Animated.Text style={[styles.metricValue, { color: isLight ? '#000000' : '#FFFFFF' }, { transform: [{ scale: pulse }] }]}> 
          {selected ? selected.value : value} {unit}
        </Animated.Text>
        <Text style={[styles.metricMeta, { color: isLight ? '#1F2937' : '#D1D5DB' }]} numberOfLines={1}>
          {signalState} • {recoveryImpact}
        </Text>
        <Text style={[styles.metricMetaSub, { color: isLight ? '#4B5563' : '#9CA3AF' }]} numberOfLines={1}>
          {freshness} • Confidence {confidence}
        </Text>
      </Card>
    </Pressable>
  );
};

const MetricBarsCard = ({
  title,
  subtitle,
  bars,
  color,
  icon,
  unit,
  signalState,
  recoveryImpact,
  freshness,
  confidence,
  primary,
  onOpen,
  isLight
}: {
  title: string;
  subtitle: string;
  bars: number[];
  color: string;
  icon: string;
  unit: string;
  signalState: string;
  recoveryImpact: string;
  freshness: string;
  confidence: string;
  primary?: boolean;
  onOpen: () => void;
  isLight: boolean;
}) => {
  const [selectedBar, setSelectedBar] = useState(Math.max(0, bars.length - 2));
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setSelectedBar(Math.max(0, bars.length - 2));
  }, [bars]);

  useEffect(() => {
    lift.setValue(0);
    Animated.timing(lift, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [selectedBar, lift]);

  const max = Math.max(...bars, 1);

  return (
    <Pressable onPress={onOpen} style={[styles.metricTile, primary && styles.metricTilePrimary]}>
      <Card style={[styles.metricCard, isLight ? styles.metricCardLight : styles.metricCardDark]}>
        <View style={styles.metricHeaderRow}>
          <View style={[styles.metricIconWrap, !isLight && styles.metricIconWrapDark]}>
            <Text style={styles.metricIcon}>{icon}</Text>
          </View>
          <View style={styles.metricHeaderTextWrap}>
            <Text style={[styles.metricTitle, { color: isLight ? '#000000' : '#FFFFFF' }]} numberOfLines={1}>{title}</Text>
            <Text style={[styles.metricSubtitle, { color: isLight ? '#000000' : '#FFFFFF' }]} numberOfLines={1}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.barsRow}>
          {bars.map((bar, index) => {
            const active = index === selectedBar;
            const height = 14 + Math.round((bar / max) * 56);
            return (
              <Pressable key={`${title}-bar-${index}`} onPress={() => setSelectedBar(index)} style={styles.barTapArea}>
                <Animated.View
                  style={[
                    styles.bar,
                    {
                      height,
                      backgroundColor: active ? color : isLight ? '#939393' : '#323232',
                      transform: [
                        {
                          translateY: active
                            ? lift.interpolate({ inputRange: [0, 1], outputRange: [2, -3] })
                            : 0
                        }
                      ]
                    }
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.metricValue, { color: isLight ? '#000000' : '#FFFFFF' }]}>
          {bars[selectedBar]} {unit}
        </Text>
        <Text style={[styles.metricMeta, { color: isLight ? '#1F2937' : '#D1D5DB' }]} numberOfLines={1}>
          {signalState} • {recoveryImpact}
        </Text>
        <Text style={[styles.metricMetaSub, { color: isLight ? '#4B5563' : '#9CA3AF' }]} numberOfLines={1}>
          {freshness} • Confidence {confidence}
        </Text>
      </Card>
    </Pressable>
  );
};

export const TrackerScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { themeMode, checkIns, wearableSyncData, wellness } = useAppContext();
  const isLight = themeMode === 'light';
  const todayWeekIndex = new Date().getDay();

  const [activeTab, setActiveTab] = useState<TrackerTab>('health');
  const sectionHighlight = activeTab === 'wellness' ? '#60AF00' : '#60AF00';
  const badgeHighlight = activeTab === 'wellness' ? '#60AF00' : '#60AF00';
  const [rangeMode, setRangeMode] = useState<RangeMode>('7D');
  const [selectedDay, setSelectedDay] = useState(todayWeekIndex);
  const [compareYesterday, setCompareYesterday] = useState(false);
  const [trackerInsightsLoading, setTrackerInsightsLoading] = useState(false);
  const [trackerInsights, setTrackerInsights] = useState<TrackerSectionImprovementResult>({
    summary: "Fiteatsy is preparing personalized guidance for today's tracker values.",
    suggestions: [
      'Keep one steady routine around meals, sleep, and movement today.',
      'Review recovery direction and keep one consistency anchor for tomorrow.',
      'Tap a metric card to view the deeper health trend behind the number.'
    ],
    generatedAtISO: new Date().toISOString(),
    model: 'fiteatsy-seed-v1'
  });
  const contentAnim = useRef(new Animated.Value(1)).current;

  const days = useMemo<DayData[]>(() => {
    const latestSync = wearableSyncData[0];
    const baseHeart = latestSync?.metrics.heartRateAvg ?? wellness.heartRateAvg;
    const baseSteps = Math.max(1600, Math.round((latestSync?.metrics.movementMinutes ?? wellness.movementMinutes) * 210));
    const baseCal = Math.round(1000 + (latestSync?.metrics.focusMinutes ?? wellness.focusMinutes) * 18);
    const baseDistance = Number((Math.max(2.2, wellness.movementMinutes / 8)).toFixed(1));

    const base = new Date();
    const weekStart = new Date(base);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(base.getDate() - base.getDay());

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const stressNoise = ((i + 3) % 5) - 2;
      const moodEnergy = checkIns.length > 0 ? checkIns[Math.max(0, checkIns.length - 1)] : null;
      const moodFactor = moodEnergy ? (moodEnergy.mood + moodEnergy.energy + moodEnergy.sleepQuality) / 3 : 3;

      const steps = Math.max(1200, baseSteps + (i - 3) * 210 + stressNoise * 55 + Math.round(moodFactor * 45));
      const calories = Math.max(850, baseCal + (i - 3) * 64 + stressNoise * 18);
      const distanceKm = Number(Math.max(1.8, baseDistance + (i - 3) * 0.28 + stressNoise * 0.04).toFixed(1));
      const heartRate = Math.max(58, Math.min(122, baseHeart + stressNoise * 2 + (i % 2 === 0 ? 1 : -1)));

      const activityEnergy = [38, 52, 31, 58, 78, 56, 24].map((v, idx) => Math.max(16, v + stressNoise * 2 + (idx === i ? 6 : 0)));
      const cardioRecovery = [62, 66, 61, 70, 79, 74, 68].map((v, idx) => Math.max(40, v + Math.round(moodFactor) - 3 + (idx === i ? 4 : 0)));
      const sleepScoreBars = [58, 66, 51, 72, 81, 69, 63].map((v, idx) => Math.max(35, v + (idx === i ? 5 : 0) - stressNoise));
      const stressLoad = [61, 58, 64, 56, 51, 49, 53].map((v, idx) => Math.max(28, v + stressNoise + (idx === i ? -4 : 0)));
      const focusTrend = [48, 52, 50, 58, 61, 63, 66].map((v, idx) => Math.max(25, v + Math.round(moodFactor) - 3 + (idx === i ? 3 : 0)));
      const wellnessTrend = [57, 60, 59, 64, 67, 70, 72].map((v, idx) => Math.max(30, v + Math.round(moodFactor) - 3 + (idx === i ? 2 : 0)));

      return {
        key: toDayKey(d.toISOString()),
        dayLabel: dayShort[d.getDay()],
        dateNum: d.getDate(),
        calories,
        distanceKm,
        steps,
        heartRate,
        activityEnergy,
        cardioRecovery,
        sleepScoreBars,
        stressLoad,
        focusTrend,
        wellnessTrend
      };
    });
  }, [checkIns, wearableSyncData, wellness.focusMinutes, wellness.heartRateAvg, wellness.movementMinutes]);

  const selected = days[selectedDay] ?? days[days.length - 1];
  const yesterday = days[Math.max(0, selectedDay - 1)] ?? selected;

  const recoveryIntel = useMemo(() => {
    return buildRecoveryIntelligence({
      wellness,
      checkIns,
      medication: { scheduledToday: 0, takenToday: 0, pendingToday: 0, skippedToday: 0, missedToday: 0 },
      hasWearable: wearableSyncData.length > 0,
      wearableSyncData
    });
  }, [wellness, checkIns, wearableSyncData]);

  useEffect(() => {
    contentAnim.setValue(0.86);
    Animated.timing(contentAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true
    }).start();
  }, [activeTab, selectedDay, contentAnim]);

  const fallbackSummaryText = useMemo(() => {
    const stepDelta = selected.steps - yesterday.steps;
    const hrDelta = selected.heartRate - yesterday.heartRate;
    const stepLabel = `${stepDelta >= 0 ? '+' : ''}${stepDelta} steps`;
    const hrLabel = `${hrDelta >= 0 ? '+' : ''}${hrDelta} bpm`;
    return recoveryIntel.isCalibrating
      ? (recoveryIntel.insufficientReason ?? 'Recovery calibration adapting to your rhythm.')
      : `Recovery ${recoveryIntel.recoveryDirection} vs yesterday (${stepLabel}, ${hrLabel}).`;
  }, [selected, yesterday, recoveryIntel]);

  const statusToFreshness = (status?: string): MetricConfig['freshness'] => {
    if (recoveryIntel.isCalibrating) return 'Calibration Mode';
    if (status === 'synced') return 'Synced Recently';
    if (status === 'no_recent_data') return 'No Recent Data';
    if (status === 'no_permission') return 'No Recent Data';
    return 'Manual Input';
  };

  const trendState = (series: number[]): MetricConfig['signalState'] => {
    if (recoveryIntel.isCalibrating) return 'Settling';
    if (series.length < 2) return 'Stable';
    const delta = series[series.length - 1] - series[Math.max(0, series.length - 2)];
    if (delta > 1.5) return 'Improving';
    if (delta < -1.5) return 'Declining';
    return 'Stable';
  };

  const impactState = (score: number): MetricConfig['recoveryImpact'] => {
    if (recoveryIntel.isCalibrating) return 'Needs Attention';
    if (score >= 75) return 'Supporting Recovery';
    if (score >= 55) return 'Neutral';
    if (score >= 40) return 'Reducing Recovery';
    return 'Needs Attention';
  };

  const confidenceState = (): MetricConfig['confidence'] => {
    const syncedCount = Object.values(recoveryIntel.signalCoverage).filter(Boolean).length;
    if (syncedCount >= 4 && !recoveryIntel.isCalibrating) return 'High';
    if (syncedCount >= 2) return 'Moderate';
    return 'Low';
  };

  const driverMap = useMemo(() => Object.fromEntries(recoveryIntel.recoveryDrivers.map((d) => [d.label, d])), [recoveryIntel.recoveryDrivers]);

  const healthMetrics: MetricConfig[] = [
    {
      key: 'heart-rate',
      title: 'Heart Recovery',
      subtitle: 'Resting heart load signal',
      icon: '❤️',
      unit: 'index',
      kind: 'spark',
      color: '#60AF00',
      values: recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 4 + idx * 0.3)))),
      latestValue: driverMap['Resting heart load']?.score ?? 0,
      compareValues: recoveryIntel.trendValues7d,
      signalState: trendState(recoveryIntel.trendValues7d),
      recoveryImpact: impactState(driverMap['Resting heart load']?.score ?? 0),
      freshness: statusToFreshness(wearableSyncData[0]?.dataQuality.connectedMetrics?.heart_rate),
      confidence: confidenceState()
    },
    {
      key: 'activity-energy',
      title: 'Activity Load',
      subtitle: 'Movement + workout recovery',
      icon: '🏃',
      unit: 'index',
      kind: 'bars',
      color: '#60AF00',
      values: recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 10 + idx)))),
      latestValue: driverMap['Movement / Workouts']?.score ?? 0,
      compareValues: recoveryIntel.trendValues7d,
      signalState: trendState(recoveryIntel.trendValues7d),
      recoveryImpact: impactState(driverMap['Movement / Workouts']?.score ?? 0),
      freshness: statusToFreshness(wearableSyncData[0]?.dataQuality.connectedMetrics?.workouts),
      confidence: confidenceState()
    },
    {
      key: 'cardio-recovery',
      title: 'HRV Stability',
      subtitle: 'Recovery balance rhythm',
      icon: '❤️',
      unit: 'index',
      kind: 'spark',
      color: '#60AF00',
      values: recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 6 + idx * 0.7)))),
      latestValue: driverMap['HRV / Recovery balance']?.score ?? 0,
      compareValues: recoveryIntel.trendValues7d,
      signalState: trendState(recoveryIntel.trendValues7d),
      recoveryImpact: impactState(driverMap['HRV / Recovery balance']?.score ?? 0),
      freshness: statusToFreshness(wearableSyncData[0]?.dataQuality.connectedMetrics?.hrv),
      confidence: confidenceState()
    },
    {
      key: 'sleep-score',
      title: 'Sleep Recovery',
      subtitle: 'Sleep continuity signal',
      icon: '🛌',
      unit: 'index',
      kind: 'bars',
      color: '#60AF00',
      values: recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 2 + idx * 0.2)))),
      latestValue: driverMap.Sleep?.score ?? 0,
      compareValues: recoveryIntel.trendValues7d,
      signalState: trendState(recoveryIntel.trendValues7d),
      recoveryImpact: impactState(driverMap.Sleep?.score ?? 0),
      freshness: statusToFreshness(wearableSyncData[0]?.dataQuality.connectedMetrics?.sleep),
      confidence: confidenceState()
    }
  ];

  const wellnessMetrics: MetricConfig[] = [
    {
      key: 'wellness-trend',
      title: 'Recovery Momentum',
      subtitle: '7-day continuity',
      icon: '✨',
      unit: 'index',
      kind: 'spark',
      color: '#60AF00',
      values: recoveryIntel.trendValues7d,
      latestValue: recoveryIntel.recoveryScore ?? 0,
      compareValues: recoveryIntel.trendValues7d,
      signalState: trendState(recoveryIntel.trendValues7d),
      recoveryImpact: impactState(recoveryIntel.recoveryScore ?? 0),
      freshness: recoveryIntel.isCalibrating ? 'Calibration Mode' : 'Synced Recently',
      confidence: confidenceState()
    },
    {
      key: 'stress-load',
      title: 'Stress Load',
      subtitle: 'Resilience under load',
      icon: '🧠',
      unit: 'load',
      kind: 'bars',
      color: '#60AF00',
      values: recoveryIntel.trendValues7d.map((v) => Math.max(0, Math.min(100, 100 - v))),
      latestValue: recoveryIntel.stressRecoveryScore == null ? 0 : Math.max(0, 100 - recoveryIntel.stressRecoveryScore),
      compareValues: recoveryIntel.trendValues7d.map((v) => Math.max(0, Math.min(100, 100 - v))),
      signalState: trendState(recoveryIntel.trendValues7d.map((v) => 100 - v)),
      recoveryImpact: impactState(100 - (recoveryIntel.stressRecoveryScore ?? 0)),
      freshness: recoveryIntel.isCalibrating ? 'Calibration Mode' : 'Synced Recently',
      confidence: confidenceState()
    },
    {
      key: 'focus-stability',
      title: 'Focus Stability',
      subtitle: 'Session consistency signal',
      icon: '🎯',
      unit: 'index',
      kind: 'spark',
      color: '#60AF00',
      values: recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 5 + idx * 0.4)))),
      latestValue: driverMap['Calm sessions']?.score ?? 0,
      compareValues: recoveryIntel.trendValues7d,
      signalState: trendState(recoveryIntel.trendValues7d),
      recoveryImpact: impactState(driverMap['Calm sessions']?.score ?? 0),
      freshness: recoveryIntel.isCalibrating ? 'Calibration Mode' : 'Manual Input',
      confidence: confidenceState()
    },
    {
      key: 'recovery-readiness',
      title: 'Recovery Capacity',
      subtitle: 'Resilience',
      icon: '🌙',
      unit: 'index',
      kind: 'bars',
      color: '#60AF00',
      values: recoveryIntel.trendValues7d,
      latestValue: recoveryIntel.recoveryScore ?? 0,
      compareValues: recoveryIntel.trendValues7d,
      signalState: trendState(recoveryIntel.trendValues7d),
      recoveryImpact: impactState(recoveryIntel.recoveryScore ?? 0),
      freshness: recoveryIntel.isCalibrating ? 'Calibration Mode' : 'Synced Recently',
      confidence: confidenceState()
    }
  ];

  const metrics = useMemo(() => {
    const source = activeTab === 'health' ? healthMetrics : wellnessMetrics;
    const scored = source.map((metric) => {
      const impactRank = metric.recoveryImpact === 'Needs Attention' ? 4 : metric.recoveryImpact === 'Reducing Recovery' ? 3 : metric.recoveryImpact === 'Neutral' ? 2 : 1;
      return { metric, score: impactRank * 100 + (100 - metric.latestValue) };
    });
    const primaryKey = scored.sort((a, b) => b.score - a.score)[0]?.metric.key;
    return source.map((metric) => ({ ...metric, primary: metric.key === primaryKey }));
  }, [activeTab, healthMetrics, wellnessMetrics]);

  useEffect(() => {
    let alive = true;

    const loadInsights = async () => {
      setTrackerInsightsLoading(true);
      try {
        const result = await getTrackerImprovementInsights({
          tab: activeTab,
          rangeMode,
          dayLabel: `${selected.dayLabel} ${selected.dateNum}`,
          compareYesterday,
          metrics: metrics.map((metric) => ({
            metricKey: metric.key,
            metricTitle: metric.title,
            unit: metric.unit,
            values: metric.values,
            compareValues: metric.compareValues
          })),
          context: {
            steps: selected.steps,
            calories: selected.calories,
            distanceKm: selected.distanceKm,
            stressLevel: selected.stressLoad[selected.stressLoad.length - 1],
            sleepQuality: selected.sleepScoreBars[selected.sleepScoreBars.length - 1],
            hydration: wellness.hydrationLiters,
        wellnessScore: wellness.wellnessScore
      }
        });

        if (alive) {
          setTrackerInsights(result);
        }
      } catch {
        if (alive) {
          setTrackerInsights((current) => ({
            ...current,
            summary: fallbackSummaryText
          }));
        }
      } finally {
        if (alive) {
          setTrackerInsightsLoading(false);
        }
      }
    };

    loadInsights();

    return () => {
      alive = false;
    };
  }, [activeTab, compareYesterday, fallbackSummaryText, rangeMode, selectedDay, wellness.hydrationLiters, wellness.wellnessScore]);

  const openDetail = (metric: MetricConfig) => {
    navigation.navigate('TrackerDetail', {
      metricKey: metric.key,
      metricTitle: metric.title,
      subtitle: metric.subtitle,
      icon: metric.icon,
      tab: activeTab,
      unit: metric.unit,
      values: metric.values,
      compareValues: metric.compareValues,
      color: metric.color,
      context: {
        dayLabel: `${selected.dayLabel} ${selected.dateNum}`,
        stressLevel: selected.stressLoad[selected.stressLoad.length - 1],
        sleepQuality: selected.sleepScoreBars[selected.sleepScoreBars.length - 1],
        hydration: wellness.hydrationLiters,
        wellnessScore: wellness.wellnessScore
      }
    });
  };

  return (
    <Screen scroll contentStyle={styles.screenContent}>
      <View style={styles.topRow}>
        <View style={[styles.tabSwitch, isLight ? styles.tabSwitchLight : styles.tabSwitchDark]}>
          <Pressable
            style={[styles.tabButton, activeTab === 'health' && styles.tabButtonActive, activeTab === 'health' && { backgroundColor: sectionHighlight }]}
            onPress={() => setActiveTab('health')}
            accessibilityRole="button"
            accessibilityLabel="Health Tracker tab"
          >
            <Text style={[styles.tabText, !isLight && styles.tabTextDark, activeTab === 'health' && styles.tabTextActive]}>Health Tracker</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, activeTab === 'wellness' && styles.tabButtonActive, activeTab === 'wellness' && { backgroundColor: sectionHighlight }]}
            onPress={() => setActiveTab('wellness')}
            accessibilityRole="button"
            accessibilityLabel="Wellness Tracker tab"
          >
            <Text style={[styles.tabText, !isLight && styles.tabTextDark, activeTab === 'wellness' && styles.tabTextActive]}>Wellness Tracker</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.rangeChip, !isLight && styles.rangeChipDark, rangeMode === '30D' && styles.rangeChipActive, rangeMode === '30D' && { backgroundColor: badgeHighlight, borderColor: badgeHighlight }]}
          onPress={() => setRangeMode((mode) => (mode === '7D' ? '30D' : '7D'))}
          accessibilityRole="button"
          accessibilityLabel="Toggle range mode"
        >
          <Text style={[styles.rangeText, rangeMode === '30D' && styles.rangeTextActive]}>{rangeMode}</Text>
        </Pressable>
      </View>

      <Card style={[styles.summaryCard, !isLight && styles.summaryCardDark]}>
        <View style={styles.summaryStatsRow}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{selected.calories.toFixed(1)}</Text>
            <Text style={styles.summaryLabel}>Cal</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{selected.distanceKm.toFixed(1)}</Text>
            <Text style={styles.summaryLabel}>Km</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{selected.steps}</Text>
            <Text style={styles.summaryLabel}>Steps</Text>
          </View>
        </View>

        <Pressable style={[styles.compareButton, !isLight && styles.compareButtonDark]} onPress={() => setCompareYesterday((v) => !v)} accessibilityRole="button" accessibilityLabel="Toggle recovery comparison">
          <Text style={[styles.compareButtonText, !isLight && styles.compareButtonTextDark]}>{compareYesterday ? 'Hide Comparison' : 'Recovery vs Yesterday'}</Text>
        </Pressable>
      </Card>

      <View style={styles.daysRow}>
        {days.map((day, index) => {
          const active = index === selectedDay;
          return (
            <Pressable
              key={day.key}
              style={[styles.dayCard, isLight ? styles.dayCardLight : styles.dayCardDark, active && styles.dayCardActive, active && { backgroundColor: sectionHighlight, borderColor: sectionHighlight }]}
              onPress={() => setSelectedDay(index)}
            >
              <Text
                style={[
                  styles.dayName,
                  !active && { color: '#FFFFFF' },
                  active && styles.dayNameActive
                ]}
              >
                {day.dayLabel}
              </Text>
              <Text
                style={[
                  styles.dayDate,
                  !active && { color: '#FFFFFF' },
                  active && styles.dayDateActive
                ]}
              >
                {day.dateNum}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Animated.View
        style={{
          opacity: contentAnim,
          transform: [
            {
              translateY: contentAnim.interpolate({ inputRange: [0.86, 1], outputRange: [8, 0] })
            }
          ]
        }}
      >
        <View style={styles.grid}>
          {[0, 2].map((startIndex) => (
            <View key={String(startIndex)} style={styles.metricRow}>
              {metrics.slice(startIndex, startIndex + 2).map((metric) =>
                metric.kind === 'spark' ? (
                  <MetricSparkCard
                    key={metric.key}
                    title={metric.title}
                    subtitle={metric.subtitle}
                    icon={metric.icon}
                    color={metric.color}
                    data={metric.values}
                    value={metric.latestValue}
                    unit={metric.unit}
                    signalState={metric.signalState}
                    recoveryImpact={metric.recoveryImpact}
                    freshness={metric.freshness}
                    confidence={metric.confidence}
                    primary={metric.primary}
                    onOpen={() => openDetail(metric)}
                    isLight={isLight}
                  />
                ) : (
                  <MetricBarsCard
                    key={metric.key}
                    title={metric.title}
                    subtitle={metric.subtitle}
                    icon={metric.icon}
                    color={metric.color}
                    bars={metric.values}
                    unit={metric.unit}
                    signalState={metric.signalState}
                    recoveryImpact={metric.recoveryImpact}
                    freshness={metric.freshness}
                    confidence={metric.confidence}
                    primary={metric.primary}
                    onOpen={() => openDetail(metric)}
                    isLight={isLight}
                  />
                )
              )}
            </View>
          ))}
        </View>
      </Animated.View>

      <Card style={[styles.insightCard, !isLight && styles.insightCardDark]}>
        <Text style={[styles.insightTitle, !isLight && styles.insightTitleDark]}>Fiteatsy Insight</Text>
        <Text style={[styles.insightCopy, !isLight && styles.insightCopyDark]}>
          {trackerInsightsLoading ? "Fiteatsy is analyzing today's trends..." : trackerInsights.summary || fallbackSummaryText}
        </Text>
        <Text style={[styles.insightSub, !isLight && styles.insightSubDark]}>
          Range: {rangeMode} • Day: {selected.dayLabel} {selected.dateNum}
        </Text>
      </Card>

      <Card style={[styles.insightCard, !isLight && styles.insightCardDark, styles.suggestionCard]}>
        <Text style={[styles.insightTitle, !isLight && styles.insightTitleDark]}>Improvement Suggestions</Text>
        <View style={styles.suggestionList}>
          {(trackerInsights.suggestions.length ? trackerInsights.suggestions : [
            'Protect one micro-break before your next work block.',
            'Check whether recovery direction is improving or settling.',
            'Tap any metric card for a deeper trend explanation.'
          ]).slice(0, 3).map((item, index) => (
            <View key={item + '-' + index} style={styles.suggestionRow}>
              <View style={[styles.suggestionDot, { backgroundColor: sectionHighlight }]} />
              <Text style={[styles.suggestionText, !isLight && styles.suggestionTextDark]}>{item}</Text>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: 176
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md
  },
  tabSwitch: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: radius.pill,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 4
  },
  tabSwitchLight: {
    backgroundColor: colors.surfaceTint
  },
  tabSwitchDark: {
    backgroundColor: colors.cardRaised,
    borderColor: colors.strokeStrong
  },
  tabTextDark: {
    color: '#FFFFFF'
  },
  tabButton: {
    flex: 1,
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: 'center'
  },
  tabButtonActive: {
    backgroundColor: colors.blueDark
  },
  tabText: {
    ...typography.bodyStrong,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary
  },
  tabTextActive: {
    color: colors.white
  },
  rangeChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardRaised,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  rangeChipActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blue
  },
  rangeText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary
  },
  rangeTextActive: {
    color: colors.white
  },
  rangeChipDark: {
    backgroundColor: colors.cardRaised,
    borderColor: colors.strokeStrong
  },
  summaryCard: {
    borderRadius: 32,
    backgroundColor: colors.surfaceAccent,
    borderColor: colors.blue,
    marginBottom: spacing.md
  },
  summaryCardDark: {
    borderColor: colors.blue
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center'
  },
  summaryValue: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  summaryLabel: {
    ...typography.bodyStrong,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary
  },
  compareButton: {
    alignSelf: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,26,14,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  compareButtonText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  compareButtonDark: {
    backgroundColor: 'rgba(12,26,40,0.28)'
  },
  compareButtonTextDark: {
    color: colors.white
  },
  daysRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md
  },
  dayCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.29)',
    backgroundColor: 'rgba(0,0,0,0.29)',
    alignItems: 'center',
    paddingVertical: 10
  },
  dayCardLight: {
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted
  },
  dayCardDark: {
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted
  },
  dayCardActive: {
    backgroundColor: '#60AF00',
    borderColor: '#60AF00'
  },
  dayName: {
    ...typography.body,
    fontSize: 12,
    fontWeight: '700'
  },
  dayNameDark: {
    color: '#FFFFFF'
  },
  dayNameActive: {
    color: '#FFFFFF',
    fontWeight: '700'
  },
  dayDate: {
    ...typography.section,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.textPrimary
  },
  dayDateDark: {
    color: colors.white
  },
  dayDateActive: {
    color: '#FFFFFF'
  },
  grid: {
    gap: spacing.xs
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.md
  },
  metricTile: {
    flex: 1
  },
  metricTilePrimary: {
    transform: [{ scale: 1.01 }]
  },
  metricCard: {
    width: '100%',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 208,
    backgroundColor: 'rgba(0,0,0,0.29)',
    borderColor: '#C9CFD4',
    justifyContent: 'space-between'
  },
  metricCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1'
  },
  metricCardDark: {
    backgroundColor: colors.cardRaised,
    borderColor: colors.stroke
  },
  metricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  metricHeaderTextWrap: {
    flex: 1
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A'
  },
  metricIconWrapDark: {
    backgroundColor: colors.surfaceTint
  },
  metricIcon: {
    fontSize: 18
  },
  metricTitle: {
    ...typography.section,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  metricTitleDark: {
    color: '#FFFFFF'
  },
  metricTitleLight: {
    color: '#000000'
  },
  metricSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  metricSubtitleDark: {
    color: '#FFFFFF'
  },
  metricSubtitleLight: {
    color: '#000000'
  },
  sparkWrap: {
    marginTop: 12,
    alignItems: 'center'
  },
  sparkTapRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 3
  },
  sparkTapHit: {
    width: 13,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sparkTapDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.stroke
  },
  sparkTapDotDark: {
    backgroundColor: colors.strokeStrong
  },
  sparkTapDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.blue
  },
  barsRow: {
    marginTop: 14,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4
  },
  barTapArea: {
    width: 16,
    alignItems: 'center'
  },
  bar: {
    width: 12,
    borderRadius: 8
  },
  metricValue: {
    ...typography.section,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 10
  },
  metricMeta: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 6
  },
  metricMetaSub: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 2
  },
  metricValueDark: {
    color: '#FFFFFF'
  },
  metricValueLight: {
    color: '#000000'
  },
  insightCard: {
    marginTop: spacing.sm,
    borderRadius: 16
  },
  insightCardDark: {
    backgroundColor: colors.cardRaised,
    borderColor: colors.strokeStrong
  },
  insightTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    color: '#000000'
  },
  insightTitleDark: {
    color: '#FFFFFF'
  },
  insightCopy: {
    ...typography.body,
    fontSize: 12,
    fontWeight: '400',
    color: '#000000'
  },
  insightCopyDark: {
    color: '#FFFFFF'
  },
  suggestionCard: {
    marginTop: spacing.xs
  },
  suggestionList: {
    gap: 8
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  suggestionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6
  },
  suggestionText: {
    ...typography.body,
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: '#000000'
  },
  suggestionTextDark: {
    color: '#FFFFFF'
  },
  insightSub: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 8,
    color: '#000000'
  },
  insightSubDark: {
    color: '#FFFFFF'
  }
});
