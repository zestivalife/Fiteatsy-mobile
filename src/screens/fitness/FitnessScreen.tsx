import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import type {
  CanonicalHealthMetricState,
  CanonicalHealthSyncSnapshot
} from '../../services/canonicalHealthSyncCoordinator';
import { useAppContext } from '../../state/AppContext';

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
  return `Latest ${new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value)} ${unit}`.trim();
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
    return { category, metrics: supported, latest, recordCount };
  }), [health.metrics]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Health parameters</Text>
        <Text style={[styles.providerStatus, { color: palette.textMuted }]}>{health.providerLabel}</Text>
      </View>
      <View style={styles.parameterList}>
        {rows.map(({ category, metrics, latest, recordCount }) => {
          const measuredAt = measurementTime(latest);
          const unsupported = metrics.length === 0;
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
