import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import type { RootStackParamList } from '../../navigation/types';
import {
  useCanonicalHealthSyncCoordinator,
  type CanonicalHealthMetricState
} from '../../services/canonicalHealthSyncCoordinator';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'HealthData'>;
type Section = 'Activity' | 'Sleep' | 'Heart & Vitals' | 'Body & Mind';
type MetricPresentation = {
  section: Section;
  period: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
};

const metricPresentation: Record<string, MetricPresentation> = {
  steps: { section: 'Activity', period: '12:00 AM – Now', icon: 'footsteps-outline', accent: '#FF6B35' },
  distance: { section: 'Activity', period: '12:00 AM – Now', icon: 'walk-outline', accent: '#32D74B' },
  active_energy: { section: 'Activity', period: '12:00 AM – Now', icon: 'flame-outline', accent: '#FF453A' },
  exercise: { section: 'Activity', period: '12:00 AM – Now', icon: 'fitness-outline', accent: '#FF9F0A' },
  workout: { section: 'Activity', period: '12:00 AM – Now', icon: 'barbell-outline', accent: '#BF5AF2' },
  sleep: { section: 'Sleep', period: 'Last sleep window', icon: 'bed-outline', accent: '#7D7AFF' },
  heart_rate: { section: 'Heart & Vitals', period: 'Latest today', icon: 'heart', accent: '#FF375F' },
  resting_heart_rate: { section: 'Heart & Vitals', period: '12:00 AM – Now', icon: 'heart-outline', accent: '#FF375F' },
  hrv_sdnn: { section: 'Heart & Vitals', period: 'Latest 35 days', icon: 'pulse-outline', accent: '#FF2D55' },
  hrv_rmssd: { section: 'Heart & Vitals', period: 'Latest 35 days', icon: 'pulse-outline', accent: '#FF2D55' },
  spo2: { section: 'Heart & Vitals', period: 'Latest 35 days', icon: 'water-outline', accent: '#30D5C8' },
  respiratory_rate: { section: 'Heart & Vitals', period: 'Latest 35 days', icon: 'analytics-outline', accent: '#64D2FF' },
  weight: { section: 'Body & Mind', period: 'Latest measurement', icon: 'scale-outline', accent: '#FFD60A' },
  hydration: { section: 'Body & Mind', period: '12:00 AM – Now', icon: 'water-outline', accent: '#32D74B' }
};

const sectionOrder: Section[] = ['Activity', 'Sleep', 'Heart & Vitals', 'Body & Mind'];

const formatValue = (metric: CanonicalHealthMetricState) => {
  const observation = metric.observation;
  if (!observation) return 'No Data';
  if (observation.metricType === 'sleep_minutes') {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(observation.value / 60)} hr`;
  }
  const maximumFractionDigits = ['steps', 'active_minutes', 'workout_minutes'].includes(observation.metricType) ? 0 : 1;
  const value = new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(observation.value);
  return `${value} ${observation.unit}`.trim();
};

const statusLabel = (metric: CanonicalHealthMetricState) => {
  if (metric.queryState === 'DATA_AVAILABLE') return 'synced';
  if (metric.queryState === 'QUERYING') return 'reading';
  if (metric.queryState === 'TIMEOUT') return 'timed out';
  if (metric.queryState === 'ERROR') return 'needs attention';
  return 'no recent data';
};

export const HealthDataScreen = ({ navigation, route }: Props) => {
  const { themeMode, onboarding, setOnboarding, setWearableSetupCompleted } = useAppContext();
  const palette = getThemeColors(themeMode);
  const health = useCanonicalHealthSyncCoordinator();
  const connected = health.providerState === 'CONNECTED';
  const loading = !health.localHydrated;
  const refreshing = health.metrics.some((metric) => metric.queryState === 'QUERYING');

  const rows = useMemo(() => health.metrics
    .filter((metric) => metric.supported && metricPresentation[metric.definition.metricKey])
    .sort((left, right) => {
      const leftSection = metricPresentation[left.definition.metricKey].section;
      const rightSection = metricPresentation[right.definition.metricKey].section;
      return sectionOrder.indexOf(leftSection) - sectionOrder.indexOf(rightSection);
    }), [health.metrics]);

  const refresh = useCallback(() => {
    void health.syncLocalMetrics();
  }, [health]);

  const syncWithHealthProvider = useCallback(() => {
    void health.requestAccess();
  }, [health]);

  const finishOnboarding = useCallback(() => {
    setWearableSetupCompleted(true);
    if (onboarding) setOnboarding({ ...onboarding, wearablePreference: connected ? 'sync' : 'later' });
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }, [connected, navigation, onboarding, setOnboarding, setWearableSetupCompleted]);

  const updatedAt = health.lifecycle.lastHealthReadAtISO
    ? new Date(health.lifecycle.lastHealthReadAtISO).toLocaleString()
    : null;

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      refreshControl={connected ? <RefreshControl refreshing={refreshing} onRefresh={refresh} /> : undefined}
    >
      <View style={styles.header}>
        <AppBackButton iconOnly={false} />
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Health Data</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Live data available from {health.sourceName}</Text>
        </View>
      </View>

      <View style={[styles.notice, { backgroundColor: palette.card }]}>
        <View style={styles.healthIcon}>
          <Ionicons name={Platform.OS === 'ios' ? 'heart' : 'fitness'} size={20} color={Platform.OS === 'ios' ? '#FF2D55' : '#32D74B'} />
        </View>
        <View style={styles.noticeCopy}>
          <Text style={[styles.noticeTitle, { color: palette.textPrimary }]}>{health.sourceName}</Text>
          <Text style={[styles.noticeText, { color: palette.textSecondary }]}>Read-only data from this {Platform.OS === 'ios' ? 'iPhone' : 'device'}</Text>
        </View>
        <Ionicons name={connected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={connected ? palette.success : palette.textMuted} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sync with ${health.sourceName}`}
        accessibilityHint={`Requests permission to read supported health data from ${health.sourceName}, then starts syncing it.`}
        disabled={refreshing}
        onPress={syncWithHealthProvider}
        style={({ pressed }) => [styles.syncButton, { backgroundColor: palette.blue, opacity: pressed || refreshing ? 0.7 : 1 }]}
      >
        {refreshing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="sync" size={20} color="#FFFFFF" />}
        <Text style={styles.refreshText}>{refreshing ? 'Syncing…' : 'Sync'}</Text>
      </Pressable>

      {!connected ? (
        <View style={[styles.connectCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <View style={[styles.connectIcon, { backgroundColor: palette.blueSoft }]}>
            <Ionicons name={Platform.OS === 'ios' ? 'heart' : 'fitness'} size={30} color={palette.blue} />
          </View>
          <Text style={[styles.connectTitle, { color: palette.textPrimary }]}>{health.sourceName} is not connected</Text>
          <Text style={[styles.connectBody, { color: palette.textSecondary }]}>Tap Sync to choose the health records you want to share. Fiteatsy only requests read access.</Text>
          {health.message ? <Text style={[styles.connectError, { color: palette.textSecondary }]}>{health.message}</Text> : null}
        </View>
      ) : loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.blue} size="large" />
          <Text style={[styles.stateText, { color: palette.textSecondary }]}>Restoring saved health data…</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((metric, index) => {
            const presentation = metricPresentation[metric.definition.metricKey];
            const previous = rows[index - 1];
            const previousSection = previous ? metricPresentation[previous.definition.metricKey].section : null;
            const status = statusLabel(metric);
            return (
              <React.Fragment key={metric.definition.metricKey}>
                {presentation.section !== previousSection ? (
                  <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>{presentation.section.toUpperCase()}</Text>
                ) : null}
                <View style={[styles.metricCard, { backgroundColor: palette.card }]}>
                  <View style={styles.metricTopRow}>
                    <View style={styles.metricIdentity}>
                      <Ionicons name={presentation.icon} size={20} color={presentation.accent} />
                      <Text style={[styles.metricLabel, { color: presentation.accent }]}>{metric.definition.displayName}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
                  </View>
                  <Text style={[styles.metricValue, { color: palette.textPrimary }]}>{formatValue(metric)}</Text>
                  <View style={styles.metricFooter}>
                    <Text style={[styles.period, { color: palette.textSecondary }]}>{presentation.period}</Text>
                    <Text style={[styles.status, { color: status === 'synced' ? palette.success : palette.textMuted }]}>{status}</Text>
                  </View>
                  {metric.observation?.sourceMetadata?.sourceApplication ? (
                    <Text style={[styles.source, { color: palette.textMuted }]}>Source: {metric.observation.sourceMetadata.sourceApplication}</Text>
                  ) : null}
                </View>
              </React.Fragment>
            );
          })}
        </View>
      )}

      {connected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh health data"
          disabled={loading || refreshing}
          onPress={refresh}
          style={({ pressed }) => [styles.refreshButton, { backgroundColor: palette.blue, opacity: pressed || refreshing ? 0.7 : 1 }]}
        >
          {refreshing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="refresh" size={20} color="#FFFFFF" />}
          <Text style={styles.refreshText}>{refreshing ? 'Refreshing…' : 'Refresh Health Data'}</Text>
        </Pressable>
      ) : null}

      {updatedAt ? <Text style={[styles.updatedAt, { color: palette.textMuted }]}>Last read: {updatedAt}</Text> : null}
      {health.pendingUploadCount > 0 ? (
        <Text style={[styles.pending, { color: palette.warning }]}>{health.pendingUploadCount} records are safely stored on this device and awaiting secure upload.</Text>
      ) : null}
      {route.params?.entryContext === 'ONBOARDING' ? (
        <Pressable accessibilityRole="button" onPress={finishOnboarding} style={[styles.continueButton, { borderColor: palette.stroke }]}>
          <Text style={[styles.continueText, { color: palette.textPrimary }]}>{connected ? 'Continue' : 'Set Up Later'}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headingCopy: { flex: 1 },
  title: typography.title,
  subtitle: { ...typography.subtext, marginTop: spacing.xxs },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: 16 },
  healthIcon: { width: 36, height: 36, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  noticeCopy: { flex: 1 },
  noticeTitle: { ...typography.label, fontWeight: '700' },
  noticeText: typography.bodySmall,
  centerState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  stateText: typography.bodySmall,
  connectCard: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center' },
  connectIcon: { width: 60, height: 60, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  connectTitle: { ...typography.cardTitle, marginTop: spacing.md, textAlign: 'center' },
  connectBody: { ...typography.bodySmall, marginTop: spacing.xs, textAlign: 'center' },
  syncButton: { minHeight: 52, marginTop: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  connectError: { ...typography.bodySmall, marginTop: spacing.sm, textAlign: 'center' },
  list: { marginTop: spacing.lg, gap: 12 },
  sectionTitle: { ...typography.label, letterSpacing: 1.1, marginLeft: 6, marginTop: 8 },
  metricCard: { minHeight: 154, padding: 20, borderRadius: 22 },
  metricTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  metricIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricLabel: { ...typography.label, fontWeight: '700' },
  status: { ...typography.badge, textTransform: 'capitalize' },
  metricValue: { ...typography.metric, fontSize: 34, lineHeight: 42, marginTop: spacing.lg },
  metricFooter: { marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  period: typography.subtext,
  source: { ...typography.subtext, marginTop: spacing.xxs },
  refreshButton: { minHeight: 52, marginTop: spacing.lg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  refreshText: { ...typography.button, color: '#FFFFFF' },
  updatedAt: { ...typography.subtext, marginTop: spacing.sm, textAlign: 'center' },
  pending: { ...typography.subtext, marginTop: spacing.sm, textAlign: 'center' },
  continueButton: { minHeight: 52, marginTop: spacing.lg, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  continueText: typography.button
});
