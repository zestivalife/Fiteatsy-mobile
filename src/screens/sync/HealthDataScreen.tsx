import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { readCurrentHealthData } from '../../services/healthAppService';
import { requestAppleHealthPermissions } from '../../services/appleHealthService';
import { requestHealthConnectPermissionsOnly } from '../../services/healthConnectService';
import { runHealthSync } from '../../services/healthSyncManager';
import { useAppContext } from '../../state/AppContext';
import type { HealthObservationDraft, WearableSyncPayload } from '../../types';

type HealthDataRow = {
  key: string;
  label: string;
  period: string;
  value: string;
  status: string;
  source?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
  section: 'Activity' | 'Sleep' | 'Heart & Vitals' | 'Body & Mind';
};

const APPLE_HEALTH_COLORS = {
  activity: '#FF6B35',
  distance: '#32D74B',
  energy: '#FF453A',
  sleep: '#7D7AFF',
  heart: '#FF375F',
  hrv: '#FF2D55'
} as const;

const sectionForKey = (key: string): HealthDataRow['section'] => {
  if (['steps', 'distance', 'energy', 'exercise', 'workout'].includes(key)) return 'Activity';
  if (key.startsWith('sleep')) return 'Sleep';
  if (['heart', 'resting-heart', 'hrv', 'oxygen', 'respiratory'].includes(key)) return 'Heart & Vitals';
  return 'Body & Mind';
};

const sumMetric = (observations: HealthObservationDraft[], metricType: string) => {
  const values = observations.filter((item) => item.metricType === metricType).map((item) => item.value);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
};

const latestMetric = (observations: HealthObservationDraft[], metricType: string) => {
  const matches = observations
    .filter((item) => item.metricType === metricType)
    .sort((a, b) => Date.parse(b.measuredAtISO) - Date.parse(a.measuredAtISO));
  return matches[0] ?? null;
};

const formatNumber = (value: number, maximumFractionDigits = 1) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);

const statusLabel = (payload: WearableSyncPayload, key: keyof NonNullable<WearableSyncPayload['dataQuality']['connectedMetrics']>) => {
  const status = payload.dataQuality.connectedMetrics?.[key] ?? 'missing';
  return status.replaceAll('_', ' ');
};

const sourceFor = (observations: HealthObservationDraft[], metricType: string) => {
  const item = latestMetric(observations, metricType);
  return item?.sourceMetadata?.sourceApplication ?? item?.sourceProvider;
};

const buildRows = (payload: WearableSyncPayload): HealthDataRow[] => {
  const observations = payload.observations ?? [];
  const steps = sumMetric(observations, 'steps');
  const activeEnergy = sumMetric(observations, 'active_energy');
  const distance = sumMetric(observations, 'distance');

  const row = (
    key: string,
    label: string,
    period: string,
    value: number | null | undefined,
    unit: string,
    status: string,
    source?: string,
    decimals = 1,
    icon: HealthDataRow['icon'] = 'heart-outline',
    accent: string = APPLE_HEALTH_COLORS.heart
  ): HealthDataRow => ({
    key,
    label,
    period,
    value: value == null ? 'No Data' : `${formatNumber(value, decimals)} ${unit}`.trim(),
    status,
    source,
    icon,
    accent,
    section: sectionForKey(key)
  });

  return [
    row('steps', 'Steps', '12:00 AM – Now', steps, 'steps', statusLabel(payload, 'steps'), sourceFor(observations, 'steps'), 0, 'footsteps-outline', APPLE_HEALTH_COLORS.activity),
    row('distance', 'Walking + Running Distance', '12:00 AM – Now', distance == null ? null : distance / 1000, 'km', statusLabel(payload, 'distance'), sourceFor(observations, 'distance'), 2, 'walk-outline', APPLE_HEALTH_COLORS.distance),
    row('energy', 'Active Energy', '12:00 AM – Now', activeEnergy, 'kcal', statusLabel(payload, 'calories'), sourceFor(observations, 'active_energy'), 1, 'flame-outline', APPLE_HEALTH_COLORS.energy),
    row('exercise', 'Exercise', '12:00 AM – Now', sumMetric(observations, 'active_minutes'), 'min', statusLabel(payload, 'workouts'), sourceFor(observations, 'active_minutes'), 0, 'fitness-outline', '#FF9F0A'),
    row('workout', 'Workouts', '12:00 AM – Now', sumMetric(observations, 'workout_minutes'), 'min', statusLabel(payload, 'workouts'), sourceFor(observations, 'workout_minutes'), 0, 'barbell-outline', '#BF5AF2'),
    row('sleep', 'Sleep', 'Yesterday 6:00 PM – Now', payload.metrics.sleepHours, 'hr', statusLabel(payload, 'sleep'), sourceFor(observations, 'sleep_minutes'), 1, 'bed-outline', APPLE_HEALTH_COLORS.sleep),
    row('sleep-core', 'Core Sleep', 'Last sleep window', sumMetric(observations, 'sleep_core_minutes'), 'min', statusLabel(payload, 'sleep'), sourceFor(observations, 'sleep_core_minutes'), 0, 'moon-outline', '#64D2FF'),
    row('sleep-deep', 'Deep Sleep', 'Last sleep window', sumMetric(observations, 'sleep_deep_minutes'), 'min', statusLabel(payload, 'sleep'), sourceFor(observations, 'sleep_deep_minutes'), 0, 'moon', '#5E5CE6'),
    row('sleep-rem', 'REM Sleep', 'Last sleep window', sumMetric(observations, 'sleep_rem_minutes'), 'min', statusLabel(payload, 'sleep'), sourceFor(observations, 'sleep_rem_minutes'), 0, 'cloudy-night-outline', '#BF5AF2'),
    row('heart', 'Heart Rate', 'Latest today', latestMetric(observations, 'heart_rate')?.value, 'bpm', statusLabel(payload, 'heart_rate'), sourceFor(observations, 'heart_rate'), 0, 'heart', APPLE_HEALTH_COLORS.heart),
    row('resting-heart', 'Resting Heart Rate', '12:00 AM – Now', payload.metrics.heartRateAvg, 'bpm', statusLabel(payload, 'heart_rate'), sourceFor(observations, 'resting_heart_rate'), 0, 'heart-outline', APPLE_HEALTH_COLORS.heart),
    row('hrv', 'Heart Rate Variability', '12:00 AM – Now', payload.metrics.hrvMs, 'ms', statusLabel(payload, 'hrv'), sourceFor(observations, 'hrv_ms'), 1, 'pulse-outline', APPLE_HEALTH_COLORS.hrv),
    row('oxygen', 'Blood Oxygen', 'Latest 7 days', payload.metrics.spo2Pct, '%', statusLabel(payload, 'spo2'), sourceFor(observations, 'spo2_pct'), 1, 'water-outline', '#30D5C8'),
    row('respiratory', 'Respiratory Rate', 'Latest 7 days', payload.metrics.respiratoryRateBrpm, 'brpm', statusLabel(payload, 'respiratory_rate'), sourceFor(observations, 'respiratory_rate_brpm'), 1, 'analytics-outline', '#64D2FF'),
    row('weight', 'Weight', 'Latest 7 days', latestMetric(observations, 'weight')?.value, 'kg', statusLabel(payload, 'weight'), sourceFor(observations, 'weight'), 1, 'scale-outline', '#FFD60A'),
    row('mindfulness', 'Mindful Minutes', 'Latest 7 days', sumMetric(observations, 'mindfulness_minutes'), 'min', statusLabel(payload, 'stress'), sourceFor(observations, 'mindfulness_minutes'), 0, 'leaf-outline', '#32D74B')
  ];
};

export const HealthDataScreen = () => {
  const {
    themeMode,
    selectedDeviceId,
    wearableSyncData,
    addWearableSyncData,
    setSelectedDeviceId,
    wellness,
    setWellness
  } = useAppContext();
  const palette = getThemeColors(themeMode);
  const healthAppId = Platform.OS === 'ios' ? 'apple-health' : 'health-connect';
  const healthAppName = Platform.OS === 'ios' ? 'Apple Health' : 'Google Health';
  const isConnected = selectedDeviceId === healthAppId || wearableSyncData.some(
    (item) => item.provider === (Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect')
  );
  const [payload, setPayload] = useState<WearableSyncPayload | null>(null);
  const [loading, setLoading] = useState(isConnected);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const loadHealthData = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setPayload(await readCurrentHealthData());
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Health data could not be read.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const connectHealthData = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      if (Platform.OS === 'ios') {
        await requestAppleHealthPermissions();
      } else if (Platform.OS === 'android') {
        const permission = await requestHealthConnectPermissionsOnly();
        if (permission.grantedCount === 0) throw new Error('Health access was not granted.');
      } else {
        throw new Error('Health data is not supported on this device.');
      }

      const result = await runHealthSync(healthAppId, wellness);
      addWearableSyncData(result.payload);
      setSelectedDeviceId(healthAppId);
      setWellness(result.wellness);
      setPayload(result.payload);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Health access could not be completed.');
    } finally {
      setConnecting(false);
    }
  }, [addWearableSyncData, connecting, healthAppId, setSelectedDeviceId, setWellness, wellness]);

  useEffect(() => {
    if (isConnected) {
      void loadHealthData();
    } else {
      setLoading(false);
      setPayload(null);
    }
  }, [isConnected, loadHealthData]);

  const rows = useMemo(() => payload ? buildRows(payload) : [], [payload]);
  const updatedAt = payload ? new Date(payload.syncedAtISO).toLocaleString() : null;

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      refreshControl={isConnected ? <RefreshControl refreshing={refreshing} onRefresh={() => { void loadHealthData(true); }} /> : undefined}
    >
      <View style={styles.header}>
        <AppBackButton iconOnly={false} />
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Health Data</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Live data available from {healthAppName}</Text>
        </View>
      </View>

      <View style={[styles.notice, { backgroundColor: palette.card }]}>
        <View style={styles.healthIcon}><Ionicons name="heart" size={20} color="#FF2D55" /></View>
        <View style={styles.noticeCopy}>
          <Text style={[styles.noticeTitle, { color: palette.textPrimary }]}>Apple Health</Text>
          <Text style={[styles.noticeText, { color: palette.textSecondary }]}>Read-only data from this iPhone</Text>
        </View>
        <Ionicons name="checkmark-circle" size={22} color={palette.success} />
      </View>

      {!isConnected ? (
        <View style={[styles.connectCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <View style={[styles.connectIcon, { backgroundColor: palette.blueSoft }]}>
            <Ionicons name={Platform.OS === 'ios' ? 'heart' : 'fitness'} size={30} color={palette.blue} />
          </View>
          <Text style={[styles.connectTitle, { color: palette.textPrimary }]}>{healthAppName} is not synced</Text>
          <Text style={[styles.connectBody, { color: palette.textSecondary }]}>Connect your health app to securely read the health records you choose to share.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Connect ${healthAppName}`}
            disabled={connecting}
            onPress={() => { void connectHealthData(); }}
            style={({ pressed }) => [styles.connectButton, { backgroundColor: palette.blue, opacity: pressed ? 0.7 : 1 }]}
          >
            {connecting ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="link-outline" size={20} color="#FFFFFF" />}
            <Text style={styles.refreshText}>{connecting ? 'Connecting…' : `Connect ${healthAppName}`}</Text>
          </Pressable>
          {error ? <Text style={[styles.connectError, { color: palette.danger }]}>{error}</Text> : null}
          {Platform.OS === 'android' ? <Text style={[styles.platformNote, { color: palette.textMuted }]}>Uses Health Connect on this Android device.</Text> : null}
        </View>
      ) : loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.blue} size="large" />
          <Text style={[styles.stateText, { color: palette.textSecondary }]}>Reading health data…</Text>
        </View>
      ) : error ? (
        <View style={[styles.errorCard, { backgroundColor: palette.dangerSoft, borderColor: palette.danger }]}>
          <Text style={[styles.errorTitle, { color: palette.textPrimary }]}>Unable to read health data</Text>
          <Text style={[styles.stateText, { color: palette.textSecondary }]}>{error}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((item, index) => (
            <React.Fragment key={item.key}>
            {index === 0 || rows[index - 1]?.section !== item.section ? <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>{item.section.toUpperCase()}</Text> : null}
            <View style={[styles.metricCard, { backgroundColor: palette.card }]}>
              <View style={styles.metricTopRow}>
                <View style={styles.metricIdentity}>
                  <Ionicons name={item.icon} size={20} color={item.accent} />
                  <Text style={[styles.metricLabel, { color: item.accent }]}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
              </View>
              <Text style={[styles.metricValue, { color: palette.textPrimary }]}>{item.value}</Text>
              <View style={styles.metricFooter}>
                <Text style={[styles.period, { color: palette.textSecondary }]}>{item.period}</Text>
                <Text style={[styles.status, { color: item.status === 'synced' ? palette.success : palette.textMuted }]}>{item.status}</Text>
              </View>
              {item.source ? <Text style={[styles.source, { color: palette.textMuted }]}>Source: {item.source}</Text> : null}
            </View>
            </React.Fragment>
          ))}
        </View>
      )}

      {isConnected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh health data"
          disabled={loading || refreshing}
          onPress={() => { void loadHealthData(true); }}
          style={({ pressed }) => [styles.refreshButton, { backgroundColor: palette.blue, opacity: pressed || refreshing ? 0.7 : 1 }]}
        >
          {refreshing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="refresh" size={20} color="#FFFFFF" />}
          <Text style={styles.refreshText}>{refreshing ? 'Refreshing…' : 'Refresh Health Data'}</Text>
        </Pressable>
      ) : null}

      {updatedAt ? <Text style={[styles.updatedAt, { color: palette.textMuted }]}>Last read: {updatedAt}</Text> : null}
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
  errorCard: { marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs },
  errorTitle: typography.cardTitle,
  connectCard: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center' },
  connectIcon: { width: 60, height: 60, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  connectTitle: { ...typography.cardTitle, marginTop: spacing.md, textAlign: 'center' },
  connectBody: { ...typography.bodySmall, marginTop: spacing.xs, textAlign: 'center' },
  connectButton: { width: '100%', minHeight: 52, marginTop: spacing.lg, paddingHorizontal: spacing.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  platformNote: { ...typography.subtext, marginTop: spacing.sm, textAlign: 'center' },
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
  updatedAt: { ...typography.subtext, marginTop: spacing.sm, textAlign: 'center' }
});
