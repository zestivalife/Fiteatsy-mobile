import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { HealthTrendChart } from '../../components/HealthTrendChart';
import { Screen } from '../../components/Screen';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { useCanonicalHealthSyncCoordinator } from '../../services/canonicalHealthSyncCoordinator';
import { buildHealthTrend, displayUnit, displayValue, metricFreshness, type HealthRange } from '../../services/healthOverviewViewModel';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'HealthMetricDetail'>;
const RANGES: HealthRange[] = ['D', 'W', 'M', 'Y'];

const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

export const HealthMetricDetailScreen = ({ route }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const health = useCanonicalHealthSyncCoordinator();
  const [range, setRange] = useState<HealthRange>('W');
  const metric = health.metrics.find((item) => item.definition.metricKey === route.params.metricKey) ?? null;
  const observation = metric?.observation ?? null;
  const trend = useMemo(() => metric ? buildHealthTrend(health.aggregates, metric.definition.backendCanonicalType, range) : [], [health.aggregates, metric, range]);
  const freshness = metric ? metricFreshness(metric) : 'UNSUPPORTED';
  const source = typeof observation?.sourceMetadata?.sourceApplication === 'string'
    ? observation.sourceMetadata.sourceApplication
    : observation?.sourceProvider ? observation.sourceProvider.replaceAll('_', ' ') : health.sourceName;
  const unit = metric ? displayUnit(metric.definition.backendCanonicalType, metric.definition.unit) : '';
  const value = observation && metric ? displayValue(metric.definition.backendCanonicalType, observation.value) : null;
  const denied = metric?.errorClass?.toLowerCase().includes('permission') || metric?.errorClass?.toLowerCase().includes('denied');
  const latestSleepDay = metric?.definition.metricKey === 'sleep'
    ? health.aggregates.filter((row) => row.metricType.startsWith('sleep_')).sort((a, b) => b.healthDay.localeCompare(a.healthDay))[0]?.healthDay
    : null;
  const sleepStages = latestSleepDay
    ? health.aggregates.filter((row) => row.healthDay === latestSleepDay && ['sleep_deep_minutes', 'sleep_core_minutes', 'sleep_rem_minutes', 'sleep_awake_minutes'].includes(row.metricType))
    : [];

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <AppBackButton iconOnly />
        <Text style={[styles.title, { color: palette.textPrimary }]}>{metric?.definition.displayName ?? 'Health metric'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.hero, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
        <Text style={[styles.eyebrow, { color: palette.blue }]}>{freshness === 'CURRENT' ? 'CURRENT' : freshness.replace('_', ' ')}</Text>
        {value == null ? (
          <>
            <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>{denied ? 'Permission not granted' : metric?.queryState === 'ERROR' ? 'Unable to read this metric' : 'No measurements available'}</Text>
            <Text style={[styles.emptyBody, { color: palette.textSecondary }]}>{denied ? `Review ${health.sourceName} permissions to share this metric.` : `No actual ${metric?.definition.displayName.toLowerCase() ?? 'health'} records are available for this period.`}</Text>
          </>
        ) : (
          <>
            <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.value, { color: palette.textPrimary }]}>{formatNumber(value)} <Text style={styles.unit}>{unit}</Text></Text>
            <Text style={[styles.measured, { color: palette.textSecondary }]}>Measured {new Date(observation!.measuredAtISO).toLocaleString()}</Text>
          </>
        )}
        <View style={[styles.divider, { backgroundColor: palette.stroke }]} />
        <View style={styles.metaRow}>
          <View style={styles.metaItem}><Text style={[styles.metaLabel, { color: palette.textMuted }]}>SOURCE</Text><Text style={[styles.metaValue, { color: palette.textPrimary }]}>{source}</Text></View>
          <View style={styles.metaItem}><Text style={[styles.metaLabel, { color: palette.textMuted }]}>QUALITY</Text><Text style={[styles.metaValue, { color: palette.textPrimary }]}>{freshness === 'CURRENT' ? 'Fresh' : freshness === 'STALE' ? 'Stale' : 'Unavailable'}</Text></View>
        </View>
      </View>

      <View style={[styles.chartCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
        <View style={styles.chartHeader}>
          <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>History</Text>
          <Text style={[styles.pointCount, { color: palette.textMuted }]}>{trend.length} points</Text>
        </View>
        <View style={[styles.rangeControl, { backgroundColor: palette.surfaceTint }]}>
          {RANGES.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === range }} accessibilityLabel={`${item} health history`} onPress={() => setRange(item)} style={[styles.rangeButton, item === range && { backgroundColor: palette.blue }]}><Text style={[styles.rangeText, { color: item === range ? '#FFFFFF' : palette.textSecondary }]}>{item}</Text></Pressable>)}
        </View>
        <HealthTrendChart points={trend} color={palette.blue} textColor={palette.textPrimary} mutedColor={palette.textMuted} unit={unit} />
      </View>

      {observation?.startAtISO || observation?.endAtISO ? (
        <View style={[styles.infoCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Session</Text>
          {observation.startAtISO ? <Text style={[styles.infoText, { color: palette.textSecondary }]}>Started {new Date(observation.startAtISO).toLocaleString()}</Text> : null}
          {observation.endAtISO ? <Text style={[styles.infoText, { color: palette.textSecondary }]}>Ended {new Date(observation.endAtISO).toLocaleString()}</Text> : null}
        </View>
      ) : null}
      {sleepStages.length ? (
        <View style={[styles.infoCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Available sleep stages</Text>
          {sleepStages.map((stage) => <View key={`${stage.healthDay}:${stage.metricType}`} style={styles.stageRow}><Text style={[styles.infoText, { color: palette.textSecondary }]}>{stage.metricType.replace('sleep_', '').replace('_minutes', '')}</Text><Text style={[styles.stageValue, { color: palette.textPrimary }]}>{formatNumber(stage.value)} min</Text></View>)}
        </View>
      ) : null}
      <View style={[styles.infoCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
        <View style={styles.diagnosticTitle}><Ionicons name="information-circle-outline" size={20} color={palette.blue} /><Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Read-only diagnostics</Text></View>
        <Text style={[styles.infoText, { color: palette.textSecondary }]}>Provider: {health.sourceName}</Text>
        <Text style={[styles.infoText, { color: palette.textSecondary }]}>Last successful sync: {health.lifecycle.lastFullySyncedAtISO ? new Date(health.lifecycle.lastFullySyncedAtISO).toLocaleString() : 'Not synced yet'}</Text>
        <Text style={[styles.infoText, { color: palette.textSecondary }]}>Local canonical records: {metric?.localRecordCount ?? 0}</Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.screenTitle, flex: 1, textAlign: 'center' },
  headerSpacer: { width: 48 },
  hero: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  eyebrow: { ...typography.badge, letterSpacing: 1.1 },
  value: { ...typography.titleXL, fontSize: 44, lineHeight: 54, marginTop: spacing.sm },
  unit: typography.sectionTitle,
  measured: { ...typography.subtext, marginTop: spacing.xxs },
  emptyTitle: { ...typography.sectionTitle, marginTop: spacing.sm },
  emptyBody: { ...typography.bodySmall, marginTop: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.lg },
  metaRow: { flexDirection: 'row', gap: spacing.md },
  metaItem: { flex: 1 },
  metaLabel: typography.badge,
  metaValue: { ...typography.bodyMedium, marginTop: spacing.xxs },
  chartCard: { marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: typography.sectionTitle,
  pointCount: typography.subtext,
  rangeControl: { flexDirection: 'row', borderRadius: radius.sm, padding: spacing.xxs, marginVertical: spacing.md },
  rangeButton: { flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rangeText: typography.label,
  infoCard: { marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs },
  diagnosticTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  infoText: { ...typography.bodySmall, textTransform: 'capitalize' },
  stageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageValue: typography.bodyMedium
});
