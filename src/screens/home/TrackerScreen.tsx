import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Polyline, Rect, Stop } from 'react-native-svg';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { MainTabParamList, RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import {
  getTrackerImprovementInsights,
  TrackerSectionImprovementResult,
  TrackerTab
} from '../../services/trackerAnalysisService';
import { toDayKey } from '../../utils/date';
import { buildRecoveryIntelligence } from '../../services/recoveryIntelligenceEngine';
import type { WearableSyncPayload } from '../../types';

type RangeMode = '7D' | '30D';
type HealthSubTab = 'overview' | 'activity' | 'heart' | 'sleep';
type TrackerNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Tracker'>,
  NativeStackNavigationProp<RootStackParamList>
>;

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
const BRAND_GREEN = '#60AF00';
const TRACKER_CARD = '#0F1010';
const TRACKER_MUTED = '#8F96A3';
const TRACKER_TEXT = '#FFFFFF';
const MIND_ACCENT = '#8D7CFF';
const CURVED_TAB_PATH =
  'M0 92 C26 92 39 87 44 73 L58 22 C61 10 76 3 97 3 L139 3 C160 3 175 10 178 22 L192 73 C197 87 210 92 236 92';
const CURVED_TAB_FILL_PATH = `${CURVED_TAB_PATH} Z`;
const PARTICLE_FIELD_SIZE = 384;
const PARTICLE_COUNT = 360;
const PARTICLE_INNER_RADIUS = 0.235;
const PARTICLE_OUTER_RADIUS = 0.465;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;
const HEART_PARTICLE_FIELD_SIZE = 356;
const HEART_PARTICLE_COUNT = 1100;
const HEART_PARTICLE_COLORS = ['#FF5489', '#FF3B67', '#E31C42', '#B01236', '#780E2A', '#43081A'];
const SLEEP_PARTICLE_FIELD_SIZE = 356;
const SLEEP_PARTICLE_COUNT = 1650;
const SLEEP_PARTICLE_INNER_RADIUS = 0.245;
const SLEEP_PARTICLE_CORE_RADIUS = 0.395;
const SLEEP_PARTICLE_OUTER_RADIUS = 0.525;
const SLEEP_PARTICLE_COLORS = ['#506CFF', '#544DE6', '#7E5BFF', '#A869FF', '#48A4FF', '#5BD0FF'];
const SLEEP_FRAME_DELTA = 0.029952;

const healthSubTabs: Array<{
  key: HealthSubTab;
  label: string;
  gradientStart: string;
  gradientEnd: string;
  glow: string;
  surface: string;
}> = [
  { key: 'overview', label: 'Overview', gradientStart: '#315B9E', gradientEnd: '#8E6BFF', glow: 'rgba(110,198,255,0.2)', surface: 'rgba(110,198,255,0.1)' },
  { key: 'activity', label: 'Activity', gradientStart: '#8A5A12', gradientEnd: '#FF7A59', glow: 'rgba(255,168,74,0.2)', surface: 'rgba(255,168,74,0.09)' },
  { key: 'heart', label: 'Heart', gradientStart: '#6D1A25', gradientEnd: '#E63946', glow: 'rgba(230,57,70,0.2)', surface: 'rgba(230,57,70,0.09)' },
  { key: 'sleep', label: 'Sleep', gradientStart: '#343A86', gradientEnd: '#8A5CFF', glow: 'rgba(122,140,255,0.2)', surface: 'rgba(122,140,255,0.1)' }
];

const toPct = (value: number, min: number, max: number) => {
  if (max <= min) {
    return 0;
  }
  return (value - min) / (max - min);
};

const scoreLabel = (score: number | null | undefined) => (score == null ? 'Calibrating' : `${score}/100`);
const numberLabel = (value: number | null | undefined, suffix = '') =>
  value == null || !Number.isFinite(value) || value <= 0 ? 'No data' : `${Math.round(value).toLocaleString()}${suffix}`;
const decimalLabel = (value: number | null | undefined, suffix = '') =>
  value == null || !Number.isFinite(value) || value <= 0 ? 'No data' : `${value.toFixed(1)}${suffix}`;

const statusLabel = (score: number | null | undefined) => {
  if (score == null) return 'Calibrating';
  if (score >= 80) return 'Strong Today';
  if (score >= 60) return 'Stable Today';
  return 'Needs Attention';
};

const particlePoints = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
  const q = index / (PARTICLE_COUNT - 1);
  const rr = Math.sqrt(
    PARTICLE_INNER_RADIUS * PARTICLE_INNER_RADIUS +
      q * (PARTICLE_OUTER_RADIUS * PARTICLE_OUTER_RADIUS - PARTICLE_INNER_RADIUS * PARTICLE_INNER_RADIUS)
  );
  const angle = index * GOLDEN_ANGLE;
  const normalized = (rr - PARTICLE_INNER_RADIUS) / (PARTICLE_OUTER_RADIUS - PARTICLE_INNER_RADIUS);
  const edgeFade = Math.sin(Math.PI * Math.min(1, normalized));
  const radiusValue = rr * PARTICLE_FIELD_SIZE;
  const x = PARTICLE_FIELD_SIZE / 2 + Math.cos(angle) * radiusValue;
  const y = PARTICLE_FIELD_SIZE / 2 + Math.sin(angle) * radiusValue;
  const size = 0.7 + 1.7 * (1 - q) + (index % 7) * 0.06;
  const color = normalized > 0.66 ? '#FF4FD8' : normalized > 0.34 ? '#9D62FF' : '#5D4DFF';
  const opacity = 0.22 + 0.48 * edgeFade;

  return {
    key: `particle-${index}`,
    x,
    y,
    size,
    color,
    opacity
  };
});

const seededFraction = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

const isInsideHeartField = (x: number, y: number) => {
  const value = x * x + y * y - 1;
  return value * value * value - x * x * y * y * y <= 0;
};

const buildHeartParticlePosition = (index: number) => {
  for (let attempt = 0; attempt < 28; attempt += 1) {
    const seed = index * 43 + attempt * 17;
    const x = -1.42 + seededFraction(seed + 3) * 2.84;
    const y = -1.32 + seededFraction(seed + 7) * 2.64;

    if (isInsideHeartField(x, y)) {
      return { x, y, attempt };
    }
  }

  const angle = seededFraction(index + 17) * TAU;
  return {
    x: Math.sin(angle) * 0.72,
    y: Math.cos(angle) * 0.72,
    attempt: 28
  };
};

const heartParticlePoints = Array.from({ length: HEART_PARTICLE_COUNT }, (_, index) => {
  const point = buildHeartParticlePosition(index);
  const normalized = Math.min(1, Math.hypot(point.x * 0.72, point.y * 0.82));
  const x = HEART_PARTICLE_FIELD_SIZE / 2 + point.x * 116;
  const y = HEART_PARTICLE_FIELD_SIZE / 2 - point.y * 103 + 22;
  const hollowDistance = Math.hypot((x - HEART_PARTICLE_FIELD_SIZE / 2) / 50, (y - (HEART_PARTICLE_FIELD_SIZE / 2 + 28)) / 68);
  const bodyGlow = 0.58 + 0.42 * Math.sin(Math.PI * Math.min(1, normalized));
  const sampleStrength = 0.7 + 0.3 * (1 - point.attempt / 28);
  const alphaBase = 0.45 + seededFraction(index + 47) * 0.5;
  const hollowFade = hollowDistance < 1 ? 0 : Math.min(1, (hollowDistance - 1) / 0.32);
  const opacity = alphaBase * bodyGlow * sampleStrength * hollowFade;
  const q = seededFraction(index + 73);
  const size = (0.65 + seededFraction(index + 97) * 0.9 + q * 2.1) * (0.9 + 0.45 * normalized);

  return {
    key: `heart-particle-${index}`,
    x,
    y,
    size,
    phase: seededFraction(index + 167) * TAU,
    depth: 0.72 + seededFraction(index + 181) * 0.62,
    normalized,
    color: HEART_PARTICLE_COLORS[Math.floor(seededFraction(index + 131) * HEART_PARTICLE_COLORS.length)],
    opacity: hollowFade <= 0 ? 0 : Math.max(0.08, Math.min(0.95, opacity))
  };
});

const sleepParticlePoints = Array.from({ length: SLEEP_PARTICLE_COUNT }, (_, index) => {
  const q = seededFraction(index + 211);
  const radiusRatio = SLEEP_PARTICLE_INNER_RADIUS + Math.pow(q, 1.65) * (SLEEP_PARTICLE_OUTER_RADIUS - SLEEP_PARTICLE_INNER_RADIUS);
  const angle = seededFraction(index + 233) * TAU;
  const normalized = (radiusRatio - SLEEP_PARTICLE_INNER_RADIUS) / (SLEEP_PARTICLE_OUTER_RADIUS - SLEEP_PARTICLE_INNER_RADIUS);
  const radiusValue = radiusRatio * SLEEP_PARTICLE_FIELD_SIZE;
  const x = SLEEP_PARTICLE_FIELD_SIZE / 2 + Math.cos(angle) * radiusValue;
  const y = SLEEP_PARTICLE_FIELD_SIZE / 2 + Math.sin(angle) * radiusValue;
  const fade =
    radiusRatio < SLEEP_PARTICLE_CORE_RADIUS
      ? Math.min(1, (radiusRatio - SLEEP_PARTICLE_INNER_RADIUS) / 0.035) *
        (0.58 +
          0.42 *
            Math.sin(
              Math.PI *
                Math.min(
                  1,
                  (radiusRatio - SLEEP_PARTICLE_INNER_RADIUS) / (SLEEP_PARTICLE_CORE_RADIUS - SLEEP_PARTICLE_INNER_RADIUS)
                )
            ))
      : Math.max(0, (SLEEP_PARTICLE_OUTER_RADIUS - radiusRatio) / (SLEEP_PARTICLE_OUTER_RADIUS - SLEEP_PARTICLE_CORE_RADIUS)) * 0.72;

  return {
    key: `sleep-particle-${index}`,
    x,
    y,
    base: radiusRatio,
    angle,
    phase: seededFraction(index + 307) * TAU,
    depth: 0.7 + seededFraction(index + 331) * 0.55,
    normalized,
    size: (0.65 + seededFraction(index + 251) * 0.9 + q * 2.1) * (0.9 + 0.45 * normalized),
    color:
      SLEEP_PARTICLE_COLORS[
        Math.min(
          SLEEP_PARTICLE_COLORS.length - 1,
          Math.floor(Math.pow(seededFraction(index + 277), 1.35) * SLEEP_PARTICLE_COLORS.length)
        )
      ],
    opacity: Math.max(0.07, Math.min(0.84, fade * (0.78 + 0.22 * seededFraction(index + 293))))
  };
});

const latestObservationValue = (
  observations: WearableSyncPayload['observations'] | undefined,
  metricType: string
) => observations?.find((item) => item.metricType === metricType)?.value ?? null;

const latestObservationValueFor = (
  observations: WearableSyncPayload['observations'] | undefined,
  metricTypes: string[]
) => observations?.find((item) => metricTypes.includes(item.metricType))?.value ?? null;

const compactMetricValue = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)}`;

const formatMinutesDuration = (minutes: number | null | undefined) => {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return 'No data';
  }
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours <= 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

const toClockMinutes = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoDate = new Date(trimmed);
  if (!Number.isNaN(isoDate.getTime()) && /[TZ]/i.test(trimmed)) {
    return {
      minutes: isoDate.getHours() * 60 + isoDate.getMinutes(),
      timestamp: isoDate.getTime(),
      display: isoDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    };
  }

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) {
    return { minutes: null, timestamp: null, display: trimmed };
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    return { minutes: null, timestamp: null, display: trimmed };
  }
  if (meridiem) {
    if (hours < 1 || hours > 12) return { minutes: null, timestamp: null, display: trimmed };
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }
  if (hours < 0 || hours > 23) {
    return { minutes: null, timestamp: null, display: trimmed };
  }

  const date = new Date(2000, 0, 1, hours, minutes);
  return {
    minutes: hours * 60 + minutes,
    timestamp: null,
    display: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  };
};

const calculateSleepMinutes = (
  bedtime: ReturnType<typeof toClockMinutes>,
  wakeTime: ReturnType<typeof toClockMinutes>,
  fallbackHours: number | null | undefined
) => {
  if (bedtime?.timestamp != null && wakeTime?.timestamp != null) {
    let diff = (wakeTime.timestamp - bedtime.timestamp) / 60000;
    while (diff < 0) diff += 24 * 60;
    return diff > 0 ? diff : null;
  }
  if (bedtime?.minutes != null && wakeTime?.minutes != null) {
    let diff = wakeTime.minutes - bedtime.minutes;
    if (diff < 0) diff += 24 * 60;
    return diff > 0 ? diff : null;
  }
  return fallbackHours != null && Number.isFinite(fallbackHours) && fallbackHours > 0 ? fallbackHours * 60 : null;
};

const formatSleepStage = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}%`;
};

const RecoveryParticleMetric = ({
  value,
  label
}: {
  value: number | null | undefined;
  label: string;
}) => {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [breathe]);

  const scale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9904, 1.0096]
  });
  const rotate = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '3deg']
  });
  const opacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1]
  });

  return (
    <View style={styles.particleMetricField}>
      <View
        style={styles.particleMetricWrap}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Recovery Score ${value == null ? 'calibrating' : `${Math.round(value)} out of 100`}`}
      >
        <Animated.View style={[styles.particleCanvas, { opacity, transform: [{ scale }, { rotate }] }]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${PARTICLE_FIELD_SIZE} ${PARTICLE_FIELD_SIZE}`}>
            <Defs>
              <SvgLinearGradient id="particleCoreGlow" x1="20%" y1="10%" x2="80%" y2="90%">
                <Stop offset="0%" stopColor="#24153A" stopOpacity="0.44" />
                <Stop offset="65%" stopColor="#07030D" stopOpacity="0.2" />
                <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Circle cx={160} cy={160} r={118} fill="url(#particleCoreGlow)" />
            {particlePoints.map((particle) => (
              <Circle
                key={particle.key}
                cx={particle.x}
                cy={particle.y}
                r={particle.size}
                fill={particle.color}
                opacity={particle.opacity}
              />
            ))}
          </Svg>
        </Animated.View>
        <View style={styles.particleMetricCenter}>
          <Text style={styles.particleMetricValue}>
            {value == null ? '--' : Math.round(value)}
          </Text>
          <Text style={styles.particleMetricLabel}>{label}</Text>
        </View>
      </View>
    </View>
  );
};

const HeartParticleMetric = ({
  restingHeartRate,
  hrv
}: {
  restingHeartRate: number | null | undefined;
  hrv: number | null | undefined;
}) => {
  const heartbeat = useRef(new Animated.Value(0)).current;
  const [heartTime, setHeartTime] = useState(0);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(heartbeat, {
        toValue: 1,
        duration: 2100,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true
      })
    );

    animation.start();
    return () => {
      animation.stop();
      heartbeat.setValue(0);
    };
  }, [heartbeat]);

  useEffect(() => {
    let frame = 0;
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      setHeartTime((current) => current + 0.036);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  const renderedHeartParticles = useMemo(
    () =>
      heartParticlePoints.map((particle) => {
        const orbit = Math.sin(heartTime * 3.1 + particle.phase);
        const sparkle = (Math.sin(heartTime * 7.4 + particle.phase * 1.3 + particle.normalized * 4.2) + 1) / 2;
        const ripple = (Math.sin(heartTime * 4.8 - particle.normalized * 7 + particle.phase * 0.28) + 1) / 2;
        const centerX = HEART_PARTICLE_FIELD_SIZE / 2;
        const centerY = HEART_PARTICLE_FIELD_SIZE / 2 + 18;
        const outwardX = (particle.x - centerX) / 160;
        const outwardY = (particle.y - centerY) / 150;
        const driftStrength = (0.6 + ripple * 1.05) * particle.depth;

        return {
          ...particle,
          x:
            particle.x +
            Math.cos(particle.phase + heartTime * 1.2) * driftStrength +
            outwardX * orbit * 1.8,
          y:
            particle.y +
            Math.sin(particle.phase * 0.8 + heartTime * 1.05) * driftStrength * 0.72 +
            outwardY * orbit * 1.25,
          size: particle.size * (0.34 + sparkle * 0.1 + ripple * 0.04),
          opacity: particle.opacity * (0.44 + sparkle * 0.42 + ripple * 0.28),
          color: sparkle > 0.86 ? '#FF7EA3' : particle.color
        };
      }),
    [heartTime]
  );

  const fieldOpacity = heartbeat.interpolate({
    inputRange: [0, 0.28, 0.62, 1],
    outputRange: [0.96, 1, 0.94, 0.98]
  });
  const bloomDrift = heartbeat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-1, 1, -1]
  });
  const haloOpacity = heartbeat.interpolate({
    inputRange: [0, 0.34, 0.7, 1],
    outputRange: [0.2, 0.42, 0.24, 0.34]
  });

  return (
    <View style={styles.heartParticleField}>
      <View
        style={styles.heartParticleWrap}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Heart metrics. Resting HR ${compactMetricValue(restingHeartRate)} beats per minute. HRV ${compactMetricValue(hrv)} milliseconds.`}
      >
        <Animated.View
          style={[
            styles.heartParticleCanvas,
            styles.heartParticleBloom,
            {
              opacity: haloOpacity,
              transform: [{ translateX: bloomDrift }, { scale: 1.4 }]
            }
          ]}
        >
          <Svg width="100%" height="100%" viewBox={`0 0 ${HEART_PARTICLE_FIELD_SIZE} ${HEART_PARTICLE_FIELD_SIZE}`}>
            {renderedHeartParticles.map((particle) => (
              <Circle
                key={`bloom-${particle.key}`}
                cx={particle.x}
                cy={particle.y}
                r={particle.size * 0.82}
                fill={particle.color}
                opacity={particle.opacity * 0.42}
              />
            ))}
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.heartParticleCanvas, { opacity: fieldOpacity, transform: [{ scale: 1.4 }] }]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${HEART_PARTICLE_FIELD_SIZE} ${HEART_PARTICLE_FIELD_SIZE}`}>
            {renderedHeartParticles.map((particle) => (
              <Circle
                key={particle.key}
                cx={particle.x}
                cy={particle.y}
                r={particle.size}
                fill={particle.color}
                opacity={particle.opacity}
              />
            ))}
          </Svg>
        </Animated.View>
        <View style={styles.heartParticleCenter}>
          <Svg width={42} height={42} viewBox="0 0 64 64">
            <Defs>
              <SvgLinearGradient id="heartCenterStroke" x1="0" y1="0" x2="64" y2="64">
                <Stop offset="0%" stopColor="#FF6B9A" />
                <Stop offset="52%" stopColor="#FF3B66" />
                <Stop offset="100%" stopColor="#A3153A" />
              </SvgLinearGradient>
            </Defs>
            <Path
              d="M32 55 C29 51 12 40 9 28 C6 17 13 9 23 9 C28 9 31 12 32 15 C33 12 36 9 41 9 C51 9 58 17 55 28 C52 40 35 51 32 55Z"
              fill="none"
              stroke="url(#heartCenterStroke)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M8 31H21L26 24L33 38L39 29L44 34H56"
              fill="none"
              stroke="#FF577F"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.heartMetricEyebrow}>Resting HR</Text>
          <View style={styles.heartMetricValueRow}>
            <Text style={styles.heartMetricValue}>{compactMetricValue(restingHeartRate)}</Text>
            {restingHeartRate != null ? <Text style={styles.heartMetricUnit}>bpm</Text> : null}
          </View>
          <View style={styles.heartMetricDivider} />
          <Text style={styles.heartMetricEyebrow}>HRV</Text>
          <View style={styles.heartMetricValueRow}>
            <Text style={styles.heartMetricSecondaryValue}>{compactMetricValue(hrv)}</Text>
            {hrv != null ? <Text style={styles.heartMetricSecondaryUnit}>ms</Text> : null}
          </View>
        </View>
      </View>
    </View>
  );
};

const SleepParticleMetric = ({
  durationMinutes,
  bedtimeDisplay,
  wakeTimeDisplay,
  sleepScore,
  stages
}: {
  durationMinutes: number | null | undefined;
  bedtimeDisplay: string | null | undefined;
  wakeTimeDisplay: string | null | undefined;
  sleepScore: number | null | undefined;
  stages: string[];
}) => {
  const [sleepTime, setSleepTime] = useState(0);

  useEffect(() => {
    let frame = 0;
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      setSleepTime((current) => current + SLEEP_FRAME_DELTA);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  const renderedSleepParticles = useMemo(() => {
    const fieldSize = SLEEP_PARTICLE_FIELD_SIZE;
    const center = fieldSize / 2;
    const breath = 1 + Math.sin(sleepTime * 1.755) * 0.008;

    return sleepParticlePoints.map((particle) => {
      const n = particle.normalized;
      const radialWave = Math.sin(sleepTime * 3.64 + particle.phase) * (0.0015 + 0.003 * n);
      const radiusValue = (particle.base + radialWave) * fieldSize * breath;
      const baseX = Math.cos(particle.angle) * radiusValue;
      const baseY = Math.sin(particle.angle) * radiusValue;
      const travelPhase = (sleepTime * 3.185 + particle.phase) % TAU;
      const horizontalWave = Math.sin(travelPhase) * fieldSize * (0.01 + 0.018 * n) * particle.depth;
      const verticalRipple = Math.sin(travelPhase * 0.72 + particle.angle * 2) * fieldSize * 0.0045 * n;
      const sweep = (Math.sin(sleepTime * 3.185 - (baseX / (fieldSize * 0.52)) * 1.8) + 1) / 2;
      const sweepPush = sweep * fieldSize * 0.008 * n;

      const fade =
        particle.base < SLEEP_PARTICLE_CORE_RADIUS
          ? Math.min(1, (particle.base - SLEEP_PARTICLE_INNER_RADIUS) / 0.035) *
            (0.58 +
              0.42 *
                Math.sin(
                  Math.PI *
                    Math.min(
                      1,
                      (particle.base - SLEEP_PARTICLE_INNER_RADIUS) /
                        (SLEEP_PARTICLE_CORE_RADIUS - SLEEP_PARTICLE_INNER_RADIUS)
                    )
                ))
          : Math.max(
              0,
              (SLEEP_PARTICLE_OUTER_RADIUS - particle.base) /
                (SLEEP_PARTICLE_OUTER_RADIUS - SLEEP_PARTICLE_CORE_RADIUS)
            ) * 0.72;
      const shimmer = 0.78 + 0.22 * Math.sin(sleepTime * 3.185 + particle.phase);

      return {
        ...particle,
        x: center + baseX + horizontalWave + sweepPush,
        y: center + baseY + verticalRipple,
        size: particle.size * (0.9 + 0.45 * n),
        opacity: Math.max(0, Math.min(0.95, fade * shimmer))
      };
    });
  }, [sleepTime]);
  const durationLabel = formatMinutesDuration(durationMinutes);

  return (
    <View style={styles.sleepParticleField}>
      <View
        style={styles.sleepParticleWrap}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Last Night's Sleep. Duration ${durationLabel}. Bedtime ${bedtimeDisplay ?? 'not available'}. Wake Time ${wakeTimeDisplay ?? 'not available'}.`}
      >
        <View style={styles.sleepParticleCanvas}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${SLEEP_PARTICLE_FIELD_SIZE} ${SLEEP_PARTICLE_FIELD_SIZE}`}>
            <Defs>
              <SvgLinearGradient id="sleepAura" x1="12%" y1="14%" x2="88%" y2="86%">
                <Stop offset="0%" stopColor="#243BFF" stopOpacity="0.16" />
                <Stop offset="54%" stopColor="#20164B" stopOpacity="0.1" />
                <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Circle cx={178} cy={178} r={122} fill="url(#sleepAura)" />
          </Svg>
        </View>
        <View style={styles.sleepParticleCanvas}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${SLEEP_PARTICLE_FIELD_SIZE} ${SLEEP_PARTICLE_FIELD_SIZE}`}>
            {renderedSleepParticles.map((particle) => (
              <Circle
                key={particle.key}
                cx={particle.x}
                cy={particle.y}
                r={particle.size}
                fill={particle.color}
                opacity={particle.opacity}
              />
            ))}
          </Svg>
        </View>
        <View style={styles.sleepParticleCenter}>
          <Svg width={46} height={46} viewBox="0 0 64 64">
            <Defs>
              <SvgLinearGradient id="sleepMoonGradient" x1="0" y1="0" x2="64" y2="64">
                <Stop offset="0%" stopColor="#6EC8FF" />
                <Stop offset="55%" stopColor="#8E7CFF" />
                <Stop offset="100%" stopColor="#BD79FF" />
              </SvgLinearGradient>
            </Defs>
            <Path
              d="M38 8C27 11 20 21 22 33C24 46 36 54 49 51C43 57 33 60 24 56C11 51 5 36 11 23C16 12 27 6 38 8Z"
              fill="none"
              stroke="url(#sleepMoonGradient)"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <Path
              d="M45 13L47 17L51 17.7L48 20.7L48.7 25L45 23L41.2 25L42 20.7L38.9 17.7L43.1 17Z"
              fill="none"
              stroke="#BD87FF"
              strokeWidth="2"
            />
          </Svg>
          <Text style={styles.sleepMetricEyebrow}>Last Night's Sleep</Text>
          <Text style={styles.sleepMetricDuration}>{durationLabel}</Text>
          <View style={styles.sleepMetricDivider} />
          <View style={styles.sleepTimesRow}>
            <View style={styles.sleepTimeBlock}>
              <Text style={styles.sleepTimeLabel}>Bedtime</Text>
              <Text style={styles.sleepTimeValue}>{bedtimeDisplay ?? '—'}</Text>
            </View>
            <View style={styles.sleepTimeBlock}>
              <Text style={styles.sleepTimeLabel}>Wake Time</Text>
              <Text style={styles.sleepTimeValue}>{wakeTimeDisplay ?? '—'}</Text>
            </View>
          </View>
          {sleepScore != null ? (
            <View style={styles.sleepScoreBlock}>
              <Text style={styles.sleepScoreLabel}>Sleep Score</Text>
              <Text style={styles.sleepScoreValue}>{Math.round(sleepScore)} <Text style={styles.sleepScoreSuffix}>/ 100</Text></Text>
            </View>
          ) : null}
          {stages.length > 0 ? (
            <Text style={styles.sleepStages}>{stages.join('  •  ')}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const CurvedTabIcon = ({
  tabKey,
  active,
  gradientStart,
  gradientEnd
}: {
  tabKey: HealthSubTab;
  active: boolean;
  gradientStart: string;
  gradientEnd: string;
}) => {
  const muted = active ? undefined : '#5F586F';
  const gradientId = `tracker-tab-${tabKey}`;

  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Defs>
        <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24">
          <Stop offset="0%" stopColor={gradientStart} />
          <Stop offset="100%" stopColor={gradientEnd} />
        </SvgLinearGradient>
      </Defs>
      {tabKey === 'overview' ? (
        <>
          <Rect x="3" y="3" width="7" height="7" rx="1.8" fill={muted ?? `url(#${gradientId})`} />
          <Rect x="14" y="3" width="7" height="7" rx="1.8" fill={muted ?? '#66D9C9'} />
          <Rect x="3" y="14" width="7" height="7" rx="1.8" fill={muted ?? '#A47CFF'} />
          <Rect x="14" y="14" width="7" height="7" rx="1.8" fill={muted ?? '#73A8FF'} />
        </>
      ) : null}
      {tabKey === 'activity' ? (
        <>
          <Circle cx="14" cy="4.5" r="2" fill={muted ?? '#FFD166'} />
          <Path
            d="M10 9l3-2 3 2 3 1 M12.5 8.5l-1 5.5-3 3 M12 14l4 2 1 4 M8.5 10.5L6 13H3.5"
            stroke={muted ?? `url(#${gradientId})`}
            strokeWidth="2.15"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {tabKey === 'heart' ? (
        <>
          <Path
            d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.8l-1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8z"
            fill={muted ?? `url(#${gradientId})`}
          />
          <Path d="M5.5 12h3l1.5-3 2.5 6 1.7-3H18" stroke="#FFFFFF" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {tabKey === 'sleep' ? (
        <>
          <Path
            d="M20.5 15.2A8.2 8.2 0 0 1 8.8 3.5 8.7 8.7 0 1 0 20.5 15.2z"
            fill={muted ?? `url(#${gradientId})`}
          />
          <Path d="M16.2 4.8h3.2l-3.2 3.2h3.2" stroke={active ? '#B8D7FF' : '#5F586F'} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
    </Svg>
  );
};

const CurvedHealthTabs = ({
  activeTab,
  onChange
}: {
  activeTab: HealthSubTab;
  onChange: (tab: HealthSubTab) => void;
}) => {
  const [barWidth, setBarWidth] = useState(0);
  const activeX = useRef(new Animated.Value(0)).current;
  const activeIndex = Math.max(0, healthSubTabs.findIndex((tab) => tab.key === activeTab));
  const activePalette = healthSubTabs[activeIndex] ?? healthSubTabs[0];
  const tabWidth = barWidth > 0 ? barWidth / healthSubTabs.length : 0;
  const sliderWidth = tabWidth + 40;

  useEffect(() => {
    if (!tabWidth) return;
    activeX.stopAnimation();
    Animated.timing(activeX, {
      toValue: activeIndex * tabWidth,
      duration: 420,
      useNativeDriver: true
    }).start();
  }, [activeIndex, activeX, tabWidth]);

  return (
    <View
      style={styles.curvedTabsShell}
      onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      accessibilityLabel="Health Tracker"
    >
      {barWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.curvedActiveSlider,
            {
              width: sliderWidth,
              transform: [{ translateX: activeX }],
              shadowColor: activePalette.gradientEnd
            }
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 236 92" preserveAspectRatio="none">
            <Defs>
              <SvgLinearGradient id="activeTrackerTabBorder" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={activePalette.gradientStart} />
                <Stop offset="100%" stopColor={activePalette.gradientEnd} />
              </SvgLinearGradient>
            </Defs>
            <Path d={CURVED_TAB_FILL_PATH} fill="#0B0910" />
            <Path d={CURVED_TAB_PATH} fill="none" stroke="url(#activeTrackerTabBorder)" strokeWidth="2" />
          </Svg>
          <View style={[styles.curvedActiveGlow, { backgroundColor: activePalette.surface }]} />
        </Animated.View>
      ) : null}

      {healthSubTabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={styles.curvedTab}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} health tracker tab`}
          >
            <Svg style={styles.curvedTabOutline} viewBox="0 0 236 92" preserveAspectRatio="none" pointerEvents="none">
              <Path d={CURVED_TAB_PATH} fill="transparent" stroke={isActive ? 'transparent' : '#26222F'} strokeWidth="1.1" />
            </Svg>
            <View style={[styles.curvedTabContent, isActive && styles.curvedTabContentActive]}>
              <CurvedTabIcon tabKey={tab.key} active={isActive} gradientStart={tab.gradientStart} gradientEnd={tab.gradientEnd} />
              <Text style={[styles.curvedTabLabel, isActive && styles.curvedTabLabelActive]}>{tab.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

const ProgressRing = ({
  value,
  color = BRAND_GREEN,
  size = 100,
  stroke = 10,
  label
}: {
  value: number | null | undefined;
  color?: string;
  size?: number;
  stroke?: number;
  label: string;
}) => {
  const safeValue = value == null ? 0 : Math.max(0, Math.min(100, value));
  const radiusValue = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const dashOffset = circumference - (safeValue / 100) * circumference;

  return (
    <View style={[styles.progressRingWrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radiusValue} stroke="#222A30" strokeWidth={stroke} fill="none" />
        {value != null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radiusValue}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            rotation="-90"
            originX={size / 2}
            originY={size / 2}
          />
        ) : null}
      </Svg>
      <View style={styles.progressRingCenter}>
        <Text style={styles.progressRingValue}>{value == null ? '—' : Math.round(value)}</Text>
        <Text style={styles.progressRingLabel}>{label}</Text>
      </View>
    </View>
  );
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
        <Text style={[styles.metricMeta, { color: isLight ? '#1F2937' : '#FFFFFF' }]} numberOfLines={1}>
          {signalState} • {recoveryImpact}
        </Text>
        <Text style={[styles.metricMetaSub, { color: isLight ? '#4B5563' : '#FFFFFF' }]} numberOfLines={1}>
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
        <Text style={[styles.metricMeta, { color: isLight ? '#1F2937' : '#FFFFFF' }]} numberOfLines={1}>
          {signalState} • {recoveryImpact}
        </Text>
        <Text style={[styles.metricMetaSub, { color: isLight ? '#4B5563' : '#FFFFFF' }]} numberOfLines={1}>
          {freshness} • Confidence {confidence}
        </Text>
      </Card>
    </Pressable>
  );
};

export const TrackerScreen = () => {
  const navigation = useNavigation<TrackerNavigation>();
  const { themeMode, checkIns, onboarding, wearableSyncData, wellness } = useAppContext();
  const isLight = themeMode === 'light';
  const todayWeekIndex = new Date().getDay();

  const [activeTab, setActiveTab] = useState<TrackerTab>('health');
  const [activeHealthTab, setActiveHealthTab] = useState<HealthSubTab>('overview');
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
    const base = new Date();
    const weekStart = new Date(base);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(base.getDate() - base.getDay());

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dayKey = toDayKey(d.toISOString());
      const sync = wearableSyncData.find((item) => toDayKey(item.syncedAtISO) === dayKey);
      const calories = sync?.metrics.caloriesKcal ?? 0;
      const heartRate = sync?.metrics.heartRateAvg ?? 0;
      const activityEnergy = sync ? [sync.metrics.movementMinutes] : [];
      const stressLoad = sync?.metrics.stressScore == null ? [] : [sync.metrics.stressScore];
      const focusTrend = sync ? [sync.metrics.focusMinutes] : [];

      return {
        key: dayKey,
        dayLabel: dayShort[d.getDay()],
        dateNum: d.getDate(),
        calories,
        distanceKm: 0,
        steps: 0,
        heartRate,
        activityEnergy,
        cardioRecovery: [],
        sleepScoreBars: [],
        stressLoad,
        focusTrend,
        wellnessTrend: []
      };
    });
  }, [wearableSyncData]);

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
  const latestSync = wearableSyncData[0] ?? null;
  const latestObservations = latestSync?.observations;
  const stepsValue = latestObservationValue(latestObservations, 'steps');
  const caloriesValue = latestSync?.metrics.caloriesKcal ?? latestObservationValue(latestObservations, 'calories_kcal');
  const workoutMinutesValue = latestSync?.metrics.workoutMinutes ?? latestSync?.metrics.movementMinutes ?? null;
  const activityScoreValue = recoveryIntel.signalCoverage.workouts ? driverMap['Movement / Workouts']?.score ?? null : null;
  const restingHeartRateValue = recoveryIntel.signalCoverage.restingHeartRate ? latestSync?.metrics.heartRateAvg ?? null : null;
  const hrvValue = recoveryIntel.signalCoverage.hrv ? latestSync?.metrics.hrvMs ?? null : null;
  const sleepHoursValue = recoveryIntel.signalCoverage.sleep ? latestSync?.metrics.sleepHours ?? null : null;
  const sleepScoreValue = recoveryIntel.signalCoverage.sleep ? driverMap.Sleep?.score ?? null : null;
  const bedtimeValue = toClockMinutes(onboarding?.sleepTime);
  const wakeTimeValue = toClockMinutes(onboarding?.wakeTime);
  const sleepDurationMinutes = calculateSleepMinutes(bedtimeValue, wakeTimeValue, sleepHoursValue);
  const sleepStages = [
    ['Deep', formatSleepStage(latestObservationValueFor(latestObservations, ['deep_sleep_pct', 'deep_sleep_percent', 'sleep_deep_pct']))],
    ['REM', formatSleepStage(latestObservationValueFor(latestObservations, ['rem_sleep_pct', 'rem_sleep_percent', 'sleep_rem_pct']))],
    ['Light', formatSleepStage(latestObservationValueFor(latestObservations, ['light_sleep_pct', 'light_sleep_percent', 'sleep_light_pct']))],
    ['Awake', formatSleepStage(latestObservationValueFor(latestObservations, ['awake_sleep_pct', 'awake_sleep_percent', 'sleep_awake_pct']))]
  ]
    .filter((stage): stage is [string, string] => Boolean(stage[1]))
    .map(([label, value]) => `${label} ${value}`);
  const hydrationValue = wellness.hydrationLiters > 0 ? wellness.hydrationLiters : null;
  const activeMinutesValue = wellness.movementMinutes > 0 ? wellness.movementMinutes : workoutMinutesValue;
  const recommendationText = recoveryIntel.highestImpactActions[0] ?? recoveryIntel.insufficientReason ?? 'Sync health data to unlock personalized guidance.';

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

  const renderMiniStat = (
    label: string,
    value: string,
    icon: keyof typeof Ionicons.glyphMap,
    helper?: string,
    accent = BRAND_GREEN
  ) => (
    <View style={styles.healthMiniCard}>
      <View style={[styles.healthMiniIcon, { backgroundColor: `${accent}22` }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.healthMiniValue}>{value}</Text>
      <Text style={styles.healthMiniLabel}>{label}</Text>
      {helper ? <Text style={[styles.healthMiniHelper, { color: accent }]}>{helper}</Text> : null}
    </View>
  );

  const renderMetricRow = (label: string, value: string, target: string, progress: number | null, color = BRAND_GREEN) => (
    <View style={styles.healthMetricRow}>
      <View style={styles.healthMetricLabelWrap}>
        <Text style={styles.healthMetricLabel}>{label}</Text>
        <Text style={styles.healthMetricValue}>{value}{target ? <Text style={styles.healthMetricTarget}>/{target}</Text> : null}</Text>
      </View>
      <View style={styles.healthMetricTrack}>
        {progress != null ? <View style={[styles.healthMetricFill, { width: `${Math.max(4, Math.min(100, progress))}%`, backgroundColor: color }]} /> : null}
      </View>
    </View>
  );

  const renderTrend = () => (
    <Card style={styles.healthPanel}>
      <Text style={styles.healthPanelTitle}>7-Day Recovery Trend</Text>
      <View style={styles.recoveryTrendRow}>
        {recoveryIntel.trendValues7d.map((value, index) => {
          const hasTrend = !recoveryIntel.isCalibrating || checkIns.length > 0;
          const color = value >= 70 ? '#41B96B' : value >= 50 ? '#B7686C' : '#FF8188';
          return (
            <View key={`${index}-${value}`} style={styles.recoveryTrendItem}>
              <View style={styles.recoveryTrendBar}>
                {hasTrend ? <View style={[styles.recoveryTrendFill, { height: `${Math.max(6, value)}%`, backgroundColor: color }]} /> : null}
              </View>
              <Text style={styles.recoveryTrendLabel}>{dayShort[index].slice(0, 1)}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );

  const renderHealthOverview = () => (
    <View style={styles.healthContentStack}>
      <RecoveryParticleMetric value={recoveryIntel.recoveryScore} label={statusLabel(recoveryIntel.recoveryScore)} />
      {renderTrend()}
      <View style={styles.healthMiniGrid}>
        {renderMiniStat('Steps', numberLabel(stepsValue), 'walk-outline', recoveryIntel.signalCoverage.steps ? 'Synced' : 'Sync health data')}
        {renderMiniStat('Calories', numberLabel(caloriesValue, ' kcal'), 'flame-outline')}
        {renderMiniStat('Hydration', decimalLabel(hydrationValue, ' L'), 'water-outline')}
        {renderMiniStat('Active', numberLabel(activeMinutesValue, ' min'), 'pulse-outline')}
      </View>
    </View>
  );

  const renderActivityTab = () => {
    const stepTarget = 5000;
    const workoutTarget = 30;
    const calorieTarget = 2100;
    return (
      <View style={styles.healthContentStack}>
        <Card style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <View>
              <Text style={styles.healthPanelTitle}>Today's Movement</Text>
              <Text style={styles.healthMuted}>Activity Score: {scoreLabel(activityScoreValue)}</Text>
            </View>
            <ProgressRing value={activityScoreValue} label="Activity" />
          </View>
          {renderMetricRow('Steps', numberLabel(stepsValue), stepsValue ? stepTarget.toLocaleString() : '', stepsValue ? (stepsValue / stepTarget) * 100 : null)}
          {renderMetricRow('Workout', numberLabel(workoutMinutesValue, ' min'), workoutMinutesValue ? `${workoutTarget} min` : '', workoutMinutesValue ? (workoutMinutesValue / workoutTarget) * 100 : null, '#BFFFA9')}
          {renderMetricRow('Calories', numberLabel(caloriesValue, ' kcal'), caloriesValue ? `${calorieTarget} kcal` : '', caloriesValue ? (caloriesValue / calorieTarget) * 100 : null, '#FF8188')}
        </Card>
        <Card style={styles.recommendationCard}>
          <Text style={styles.recommendationTitle}>Activity Recommendation</Text>
          <Text style={styles.recommendationCopy}>{activityScoreValue == null ? 'Sync activity data to unlock movement guidance.' : recommendationText}</Text>
        </Card>
      </View>
    );
  };

  const renderHeartTab = () => (
    <View style={styles.healthContentStack}>
      <HeartParticleMetric restingHeartRate={restingHeartRateValue} hrv={hrvValue} />
      <Card style={styles.healthPanel}>
        <Text style={styles.healthPanelTitle}>Cardiovascular Stability</Text>
        {renderMetricRow('Cardio Efficiency', scoreLabel(driverMap['Resting heart load']?.score ?? null), '', driverMap['Resting heart load']?.score ?? null, '#BFFFA9')}
        {renderMetricRow('Recovery Signal', scoreLabel(driverMap['HRV / Recovery balance']?.score ?? null), '', driverMap['HRV / Recovery balance']?.score ?? null, '#FF8188')}
        {renderMetricRow('Heart Recovery Score', scoreLabel(recoveryIntel.recoveryScore), '', recoveryIntel.recoveryScore, '#6FD3FF')}
      </Card>
      <Card style={[styles.recommendationCard, styles.heartInsightCard]}>
        <Text style={[styles.recommendationTitle, { color: '#FF8188' }]}>Recovery Insight</Text>
        <Text style={styles.recommendationCopy}>{recoveryIntel.contextualInsights[0] ?? 'Heart recovery insight will appear after enough synced signals are available.'}</Text>
      </Card>
    </View>
  );

  const renderSleepTab = () => (
    <View style={styles.healthContentStack}>
      <SleepParticleMetric
        durationMinutes={sleepDurationMinutes}
        bedtimeDisplay={bedtimeValue?.display ?? null}
        wakeTimeDisplay={wakeTimeValue?.display ?? null}
        sleepScore={sleepScoreValue}
        stages={sleepStages}
      />
      <Card style={styles.recommendationCard}>
        <Text style={[styles.recommendationTitle, { color: '#6FD3FF' }]}>Sleep Recommendation</Text>
        <Text style={styles.recommendationCopy}>{sleepScoreValue == null ? 'Sync sleep data to unlock sleep recommendations.' : recommendationText}</Text>
      </Card>
    </View>
  );

  const renderHealthTabContent = () => {
    if (activeHealthTab === 'activity') return renderActivityTab();
    if (activeHealthTab === 'heart') return renderHeartTab();
    if (activeHealthTab === 'sleep') return renderSleepTab();
    return renderHealthOverview();
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

      {activeTab === 'health' ? (
        <>
          <CurvedHealthTabs activeTab={activeHealthTab} onChange={setActiveHealthTab} />
          {renderHealthTabContent()}
        </>
      ) : (
        <>
          <Card style={[styles.summaryCard, !isLight && styles.summaryCardDark]}>
        <View style={styles.summaryStatsRow}>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, !isLight && styles.summaryValueDark]}>{selected.calories.toFixed(1)}</Text>
            <Text style={[styles.summaryLabel, !isLight && styles.summaryLabelDark]}>Cal</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, !isLight && styles.summaryValueDark]}>{selected.distanceKm.toFixed(1)}</Text>
            <Text style={[styles.summaryLabel, !isLight && styles.summaryLabelDark]}>Km</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, !isLight && styles.summaryValueDark]}>{selected.steps}</Text>
            <Text style={[styles.summaryLabel, !isLight && styles.summaryLabelDark]}>Steps</Text>
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

      <Pressable
        style={[styles.pssEntryCard, !isLight && styles.pssEntryCardDark]}
        onPress={() => navigation.navigate('Pss10Assessment')}
        accessibilityRole="button"
        accessibilityLabel="Open perceived stress assessment"
      >
        <View style={styles.pssEntryIcon}>
          <Ionicons name="sparkles-outline" size={22} color={MIND_ACCENT} />
        </View>
        <View style={styles.pssEntryText}>
          <Text style={styles.pssEntryKicker}>Mind / Stress</Text>
          <Text style={styles.pssEntryTitle}>Stress Test</Text>
          <Text style={styles.pssEntryCopy}>Stress score and history, stored as a self-reported trend.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#C9C7FF" />
      </Pressable>

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
        </>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 12,
    paddingHorizontal: 12,
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
    fontFamily: 'Exo_700Bold',
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
    fontFamily: 'Exo_700Bold',
    color: colors.textSecondary
  },
  rangeTextActive: {
    color: colors.white
  },
  rangeChipDark: {
    backgroundColor: colors.cardRaised,
    borderColor: colors.strokeStrong
  },
  pssEntryCard: {
    minHeight: 92,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(141,124,255,0.28)',
    backgroundColor: '#111116',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16
  },
  pssEntryCardDark: {
    backgroundColor: '#0F1010'
  },
  pssEntryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(141,124,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(141,124,255,0.34)'
  },
  pssEntryText: {
    flex: 1,
    gap: 2
  },
  pssEntryKicker: {
    ...typography.caption,
    fontFamily: 'Exo_600SemiBold',
    color: MIND_ACCENT
  },
  pssEntryTitle: {
    ...typography.bodyStrong,
    fontFamily: 'Exo_700Bold',
    color: '#FFFFFF'
  },
  pssEntryCopy: {
    ...typography.caption,
    color: '#A5A7B1'
  },
  curvedTabsShell: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 88,
    marginBottom: 18,
    overflow: 'visible',
    borderBottomWidth: 1,
    borderBottomColor: '#24202D'
  },
  curvedActiveSlider: {
    position: 'absolute',
    zIndex: 2,
    left: -20,
    top: 10,
    bottom: 0,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  curvedActiveGlow: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    top: '18%',
    bottom: '5%',
    borderRadius: 999,
    opacity: 0.75
  },
  curvedTab: {
    flex: 1,
    position: 'relative',
    zIndex: 4,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent'
  },
  curvedTabOutline: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -20,
    right: -20,
    opacity: 0.72
  },
  curvedTabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    transform: [{ translateY: 2 }]
  },
  curvedTabContentActive: {
    transform: [{ translateY: -1 }]
  },
  curvedTabLabel: {
    ...typography.bodyStrong,
    fontSize: 12,
    lineHeight: 12,
    fontFamily: 'Exo_600SemiBold',
    letterSpacing: 0.1,
    color: '#6E6878'
  },
  curvedTabLabelActive: {
    color: '#FFFFFF'
  },
  healthContentStack: {
    gap: 16
  },
  healthPanel: {
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: TRACKER_CARD,
    borderColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1
  },
  healthPanelTitle: {
    ...typography.section,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Exo_700Bold',
    color: TRACKER_TEXT
  },
  particleMetricField: {
    alignSelf: 'stretch',
    paddingHorizontal: 0,
    paddingVertical: 0,
    height: 392,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  particleMetricWrap: {
    width: '100%',
    height: 392,
    alignItems: 'center',
    justifyContent: 'center'
  },
  particleCanvas: {
    position: 'absolute',
    width: '100%',
    height: '100%'
  },
  particleMetricCenter: {
    position: 'absolute',
    width: '31%',
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,4,20,0.34)'
  },
  particleMetricValue: {
    fontSize: 52,
    lineHeight: 54,
    letterSpacing: -1.76,
    fontFamily: 'Exo_700Bold',
    color: '#FFFFFF'
  },
  particleMetricLabel: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Exo_600SemiBold',
    color: '#A9A2B6'
  },
  heartParticleField: {
    alignSelf: 'stretch',
    paddingHorizontal: 0,
    paddingVertical: 0,
    height: 352,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heartParticleWrap: {
    width: '283%',
    height: 352,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heartParticleCanvas: {
    position: 'absolute',
    width: '100%',
    height: '100%'
  },
  heartParticleBloom: {
    opacity: 0.5
  },
  heartParticleCenter: {
    position: 'absolute',
    width: '35%',
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.14)'
  },
  heartMetricEyebrow: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontFamily: 'Exo_700Bold',
    color: '#FF5D83'
  },
  heartMetricValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 2
  },
  heartMetricValue: {
    fontSize: 34,
    lineHeight: 34,
    letterSpacing: -1.7,
    fontFamily: 'Exo_400Regular',
    color: '#FFFFFF'
  },
  heartMetricUnit: {
    marginLeft: 4,
    marginBottom: 3,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Exo_600SemiBold',
    color: '#FF4F79'
  },
  heartMetricDivider: {
    width: 42,
    height: 1,
    marginTop: 7,
    marginBottom: 1,
    backgroundColor: 'rgba(255,93,131,0.28)'
  },
  heartMetricSecondaryValue: {
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -1,
    fontFamily: 'Exo_500Medium',
    color: '#F4EEF0'
  },
  heartMetricSecondaryUnit: {
    marginLeft: 4,
    marginBottom: 2,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Exo_600SemiBold',
    color: '#9D6A77'
  },
  sleepParticleField: {
    alignSelf: 'stretch',
    paddingHorizontal: 0,
    paddingVertical: 0,
    height: 392,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sleepParticleWrap: {
    width: '100%',
    height: 392,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sleepParticleCanvas: {
    position: 'absolute',
    width: '100%',
    height: '100%'
  },
  sleepParticleCenter: {
    position: 'absolute',
    width: '38%',
    minWidth: 132,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(5,6,20,0.16)'
  },
  sleepMetricEyebrow: {
    marginTop: 4,
    marginBottom: 5,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1.25,
    textTransform: 'uppercase',
    textAlign: 'center',
    fontFamily: 'Exo_700Bold',
    color: '#A997FF'
  },
  sleepMetricDuration: {
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -1.15,
    fontFamily: 'Exo_400Regular',
    color: '#FFFFFF'
  },
  sleepMetricDivider: {
    width: '58%',
    height: 1,
    marginTop: 8,
    marginBottom: 7,
    backgroundColor: 'rgba(91,78,145,0.44)'
  },
  sleepTimesRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10
  },
  sleepTimeBlock: {
    alignItems: 'center',
    flexShrink: 1
  },
  sleepTimeLabel: {
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: 'Exo_700Bold',
    color: '#9188BD'
  },
  sleepTimeValue: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'Exo_600SemiBold',
    color: '#D8D8FF'
  },
  sleepScoreBlock: {
    marginTop: 7,
    alignItems: 'center'
  },
  sleepScoreLabel: {
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    fontFamily: 'Exo_700Bold',
    color: '#9188BD'
  },
  sleepScoreValue: {
    marginTop: 1,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Exo_500Medium',
    color: '#55C9FF'
  },
  sleepScoreSuffix: {
    fontSize: 10,
    lineHeight: 13,
    color: '#777B9B'
  },
  sleepStages: {
    marginTop: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(111,103,190,0.22)',
    backgroundColor: 'rgba(12,12,31,0.35)',
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Exo_600SemiBold',
    color: '#66BAFF',
    textAlign: 'center'
  },
  healthMuted: {
    ...typography.body,
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Exo_500Medium',
    color: TRACKER_MUTED
  },
  healthScoreCard: {
    minHeight: 154,
    justifyContent: 'space-between'
  },
  recoveryScoreLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 22
  },
  recoveryScoreValue: {
    fontSize: 58,
    lineHeight: 64,
    fontFamily: 'Exo_400Regular',
    color: '#FFFFFF'
  },
  recoveryScoreSuffix: {
    fontSize: 28,
    lineHeight: 38,
    fontFamily: 'Exo_500Medium',
    color: TRACKER_MUTED,
    marginBottom: 8,
    marginLeft: 8
  },
  scoreBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: '#FF2630',
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 10
  },
  healthMiniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16
  },
  healthMiniCard: {
    flex: 1,
    flexBasis: '47%',
    minHeight: 148,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: TRACKER_CARD,
    borderColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1
  },
  healthMiniIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  healthMiniValue: {
    ...typography.section,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: 'Exo_600SemiBold',
    color: '#FFFFFF'
  },
  healthMiniLabel: {
    ...typography.body,
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: TRACKER_MUTED
  },
  healthMiniHelper: {
    ...typography.caption,
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Exo_700Bold'
  },
  recoveryTrendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 18
  },
  recoveryTrendItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8
  },
  recoveryTrendBar: {
    width: '100%',
    height: 78,
    borderRadius: 12,
    backgroundColor: '#20262B',
    overflow: 'hidden',
    justifyContent: 'flex-end'
  },
  recoveryTrendFill: {
    width: '100%',
    borderRadius: 12,
    minHeight: 4
  },
  recoveryTrendLabel: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Exo_700Bold',
    color: TRACKER_MUTED
  },
  activityCard: {
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: TRACKER_CARD,
    borderColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16
  },
  progressRingWrap: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  progressRingCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  },
  progressRingValue: {
    ...typography.section,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: 'Exo_700Bold',
    color: '#FFFFFF'
  },
  progressRingLabel: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'Exo_600SemiBold',
    color: TRACKER_MUTED
  },
  healthMetricRow: {
    marginTop: 14
  },
  healthMetricLabelWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12
  },
  healthMetricLabel: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Exo_600SemiBold',
    color: TRACKER_MUTED
  },
  healthMetricValue: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Exo_700Bold',
    color: '#FFFFFF'
  },
  healthMetricTarget: {
    color: TRACKER_MUTED
  },
  healthMetricTrack: {
    height: 9,
    borderRadius: 8,
    backgroundColor: '#222A30',
    overflow: 'hidden'
  },
  healthMetricFill: {
    height: '100%',
    borderRadius: 8
  },
  recommendationCard: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: 'rgba(96,175,0,0.07)',
    borderColor: 'rgba(96,175,0,0.32)',
    borderWidth: 1
  },
  recommendationTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Exo_700Bold',
    color: BRAND_GREEN,
    marginBottom: 10
  },
  recommendationCopy: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Exo_500Medium',
    color: TRACKER_MUTED
  },
  heartInsightCard: {
    backgroundColor: 'rgba(255,38,48,0.08)',
    borderColor: 'rgba(255,129,136,0.28)'
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
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Exo_700Bold'
  },
  summaryLabel: {
    ...typography.bodyStrong,
    fontSize: 16,
    fontFamily: 'Exo_700Bold',
    color: colors.textSecondary
  },
  summaryValueDark: {
    color: '#FFFFFF'
  },
  summaryLabelDark: {
    color: '#FFFFFF'
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
    fontFamily: 'Exo_700Bold'
  },
  dayNameDark: {
    color: '#FFFFFF'
  },
  dayNameActive: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold'
  },
  dayDate: {
    ...typography.section,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Exo_700Bold',
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
    borderColor: colors.stroke,
    justifyContent: 'space-between'
  },
  metricCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1'
  },
  metricCardDark: {
    backgroundColor: colors.cardRaised,
    borderColor: 'transparent',
    borderWidth: 0
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
    fontFamily: 'Exo_700Bold'
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
    fontFamily: 'Exo_700Bold'
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
    fontFamily: 'Exo_700Bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 10
  },
  metricMeta: {
    ...typography.caption,
    fontSize: 12,
    fontFamily: 'Exo_700Bold',
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 6
  },
  metricMetaSub: {
    ...typography.caption,
    fontSize: 12,
    fontFamily: 'Exo_400Regular',
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
    borderColor: 'transparent',
    borderWidth: 0
  },
  insightTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    fontFamily: 'Exo_700Bold',
    marginBottom: 4,
    color: '#000000'
  },
  insightTitleDark: {
    color: '#FFFFFF'
  },
  insightCopy: {
    ...typography.body,
    fontSize: 12,
    fontFamily: 'Exo_400Regular',
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
