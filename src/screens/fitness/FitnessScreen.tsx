import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import type {
  CanonicalHealthMetricState,
  CanonicalHealthSyncSnapshot
} from '../../services/canonicalHealthSyncCoordinator';
import { useAppContext } from '../../state/AppContext';
import { HEALTH_INTELLIGENCE_CONFIG } from '@fiteatsy/health-intelligence';
import { WellnessGoalConfiguration } from './WellnessGoalConfiguration';

type CategoryDefinition = {
  key: 'activity' | 'sleep' | 'heart' | 'recovery' | 'body' | 'mindfulness';
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  metricKeys: readonly string[];
};

const CATEGORIES: readonly CategoryDefinition[] = [
  { key: 'activity', title: 'Activity', icon: 'footsteps-outline', color: '#FF7139', metricKeys: ['steps', 'distance', 'active_energy', 'exercise', 'workout'] },
  { key: 'sleep', title: 'Sleep', icon: 'moon-outline', color: '#7771FF', metricKeys: ['sleep'] },
  { key: 'heart', title: 'Heart', icon: 'heart-outline', color: '#FF375F', metricKeys: ['heart_rate', 'resting_heart_rate'] },
  { key: 'recovery', title: 'Recovery', icon: 'pulse-outline', color: '#FF2D55', metricKeys: ['hrv_sdnn', 'hrv_rmssd', 'spo2', 'respiratory_rate'] },
  { key: 'body', title: 'Body', icon: 'scale-outline', color: '#FFD60A', metricKeys: ['weight', 'hydration'] },
  { key: 'mindfulness', title: 'Mindfulness', icon: 'leaf-outline', color: '#32D74B', metricKeys: [] }
] as const;

const measurementTime = (metric: CanonicalHealthMetricState | null) => {
  if (!metric?.observation) return null;
  const value = Date.parse(metric.observation.measuredAtISO);
  return Number.isFinite(value) ? value : null;
};

const latestMetric = (metrics: CanonicalHealthMetricState[]) => metrics.reduce<CanonicalHealthMetricState | null>((latest, metric) => {
  if (!metric.observation) return latest;
  if (!latest) return metric;
  return (measurementTime(metric) ?? 0) > (measurementTime(latest) ?? 0) ? metric : latest;
}, null);

const formatMeasurement = (metric: CanonicalHealthMetricState | null) => {
  if (!metric?.observation) return 'No current permitted data';
  const { observation } = metric;
  const value = observation.metricType === 'sleep_minutes'
    ? observation.value / 60
    : observation.value;
  const unit = observation.metricType === 'sleep_minutes' ? 'hr' : observation.unit;
  const maximumFractionDigits = ['steps', 'active_minutes', 'workout_minutes'].includes(observation.metricType) ? 0 : 1;
  return `Latest ${metric.definition.displayName}: ${new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value)} ${unit}`.trim();
};

const readStatus = (metrics: CanonicalHealthMetricState[]) => {
  if (metrics.some((metric) => metric.queryState === 'QUERYING')) return 'Reading';
  if (metrics.some((metric) => metric.queryState === 'ERROR')) return 'Needs attention';
  if (metrics.some((metric) => metric.queryState === 'TIMEOUT')) return 'Timed out';
  if (metrics.some((metric) => metric.queryState === 'DATA_AVAILABLE')) return 'Available locally';
  return 'No recent data';
};

const uploadLabel = (health: CanonicalHealthSyncSnapshot) => {
  if (health.uploadState === 'UPLOADING') return 'Uploading';
  if (health.uploadState === 'SYNCED') return 'Uploaded';
  if (health.uploadState === 'PENDING' || health.pendingUploadCount > 0) return 'Upload pending';
  if (health.uploadState === 'ERROR') return 'Upload needs attention';
  return 'Not uploaded';
};

export const FitnessParameterCards = ({ health }: { health: CanonicalHealthSyncSnapshot }) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const rows = useMemo(() => CATEGORIES.map((category) => {
    const metrics = health.metrics.filter((metric) => category.metricKeys.includes(metric.definition.metricKey));
    const supported = metrics.filter((metric) => metric.supported);
    const latest = latestMetric(supported);
    const recordCount = supported.reduce((total, metric) => total + metric.localRecordCount, 0);
    return { category, registered: metrics.length > 0, metrics: supported, latest, recordCount };
  }), [health.metrics]);
  const supportedProgress = useMemo(() => {
    const definitions = [
      { metricKey: 'steps', metricType: 'steps', label: 'Daily steps', target: HEALTH_INTELLIGENCE_CONFIG.displayTargets.steps, unit: 'steps', color: '#FF7139' },
      { metricKey: 'exercise', metricType: 'active_minutes', label: 'Exercise', target: HEALTH_INTELLIGENCE_CONFIG.displayTargets.exerciseMinutes, unit: 'min', color: '#32D74B' }
    ];
    const now = new Date();
    const currentHealthDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return definitions.map((definition) => {
      const aggregate = (health.aggregates ?? []).find((item) => item.healthDay === currentHealthDay && item.metricType === definition.metricType);
      const actual = aggregate?.value ?? null;
      return { ...definition, actual, progress: actual == null ? null : Math.min(1, Math.max(0, actual / definition.target)) };
    });
  }, [health.aggregates]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Health parameters</Text>
        <Text style={[styles.providerStatus, { color: palette.textMuted }]}>{health.providerLabel}</Text>
      </View>
      <View style={styles.progressGrid}>
        {supportedProgress.map((item) => (
          <View key={item.metricKey} accessibilityLabel={`${item.label} ${item.actual == null ? 'has no current data' : `${Math.round(item.progress! * 100)} percent of goal`}`} style={[styles.progressCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
            <Text style={[styles.progressLabel, { color: palette.textSecondary }]}>{item.label}</Text>
            <Text style={[styles.progressValue, { color: palette.textPrimary }]}>{item.actual == null ? 'No data' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(item.actual)} ${item.unit}`}</Text>
            <View style={[styles.progressTrack, { backgroundColor: palette.surfaceAccent }]}><View style={[styles.progressFill, { width: `${(item.progress ?? 0) * 100}%`, backgroundColor: item.color }]} /></View>
            <Text style={[styles.progressTarget, { color: palette.textMuted }]}>Goal {item.target.toLocaleString()} {item.unit}</Text>
          </View>
        ))}
      </View>
      <WellnessGoalConfiguration />
      <View style={styles.parameterList}>
        {rows.map(({ category, registered, metrics, latest, recordCount }) => {
          const measuredAt = measurementTime(latest);
          const unsupported = !registered || metrics.length === 0;
          return (
            <View
              accessibilityLabel={`${category.title} health parameter`}
              key={category.key}
              style={[styles.parameterCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}
            >
              <View style={[styles.parameterIcon, { backgroundColor: `${category.color}20` }]}>
                <Ionicons name={category.icon} size={22} color={category.color} />
              </View>
              <View style={styles.parameterCopy}>
                <Text style={[styles.parameterTitle, { color: palette.textPrimary }]}>{category.title}</Text>
                <Text style={[styles.parameterDetail, { color: palette.textSecondary }]}>
                  {unsupported ? 'Not supported by the current health source' : formatMeasurement(latest)}
                </Text>
                <Text style={[styles.parameterMeta, { color: palette.textMuted }]}>
                  {unsupported
                    ? `${health.sourceName} · Unavailable`
                    : `${health.sourceName} · ${readStatus(metrics)} · ${uploadLabel(health)}`}
                </Text>
                {measuredAt ? (
                  <Text style={[styles.parameterMeta, { color: palette.textMuted }]}>Measured {new Date(measuredAt).toLocaleString()}</Text>
                ) : null}
              </View>
              <View style={styles.countBlock}>
                <Text style={[styles.parameterCount, { color: recordCount > 0 ? palette.success : palette.textMuted }]}>{recordCount}</Text>
                <Text style={[styles.countLabel, { color: palette.textMuted }]}>records</Text>
              </View>
            </View>
          );
        })}
      </View>
      <Text style={[styles.uploadSummary, { color: palette.textSecondary }]}>
        {health.pendingUploadCount > 0
          ? `${health.pendingUploadCount} ${health.pendingUploadCount === 1 ? 'record is' : 'records are'} available locally and awaiting secure upload.`
          : uploadLabel(health)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  sectionHeader: { marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sectionTitle: typography.sectionTitle,
  providerStatus: typography.subtext,
  parameterList: { gap: spacing.sm },
  progressGrid: { marginBottom: spacing.md, flexDirection: 'row', gap: spacing.sm },
  progressCard: { flex: 1, minHeight: 128, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  progressLabel: typography.label,
  progressValue: { ...typography.metricSmall, marginTop: spacing.xs },
  progressTrack: { height: 8, borderRadius: radius.pill, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  progressTarget: { ...typography.subtext, marginTop: spacing.xs },
  parameterCard: { minHeight: 76, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  parameterIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  parameterCopy: { flex: 1 },
  parameterTitle: typography.cardTitle,
  parameterDetail: { ...typography.subtext, marginTop: spacing.xxs },
  parameterMeta: { ...typography.subtext, marginTop: spacing.xxs },
  countBlock: { alignItems: 'center', minWidth: 42 },
  parameterCount: typography.metricSmall,
  countLabel: { ...typography.subtext, marginTop: 2 },
  uploadSummary: { ...typography.subtext, marginTop: spacing.md, textAlign: 'center' }
});
