import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { readCurrentHealthData } from '../../services/healthAppService';
import { useAppContext } from '../../state/AppContext';
import type { HealthObservationDraft, WearableSyncPayload } from '../../types';

type HealthDataRow = {
  key: string;
  label: string;
  value: string;
  status: string;
  source?: string;
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
    value: number | null | undefined,
    unit: string,
    status: string,
    source?: string,
    decimals = 1
  ): HealthDataRow => ({
    key,
    label,
    value: value == null ? 'No accessible data' : `${formatNumber(value, decimals)} ${unit}`.trim(),
    status,
    source
  });

  return [
    row('steps', 'Steps · 12:00 AM to now', steps, 'steps', statusLabel(payload, 'steps'), sourceFor(observations, 'steps'), 0),
    row('distance', 'Walking + running distance · 12:00 AM to now', distance == null ? null : distance / 1000, 'km', statusLabel(payload, 'distance'), sourceFor(observations, 'distance'), 2),
    row('energy', 'Active energy · 12:00 AM to now', activeEnergy, 'kcal', statusLabel(payload, 'calories'), sourceFor(observations, 'active_energy'), 0),
    row('sleep', 'Sleep · 6:00 PM to now', payload.metrics.sleepHours, 'hr', statusLabel(payload, 'sleep'), sourceFor(observations, 'sleep_minutes'), 1),
    row('heart', 'Resting heart rate · 12:00 AM to now', payload.metrics.heartRateAvg, 'bpm', statusLabel(payload, 'heart_rate'), sourceFor(observations, 'resting_heart_rate'), 0),
    row('hrv', 'HRV · 12:00 AM to now', payload.metrics.hrvMs, 'ms', statusLabel(payload, 'hrv'), sourceFor(observations, 'hrv_ms'), 1)
  ];
};

export const HealthDataScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'HealthData'>>();
  const { themeMode, selectedDeviceId, wearableSyncData } = useAppContext();
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

      <View style={[styles.notice, { backgroundColor: palette.blueSoft, borderColor: palette.blue }]}>
        <Ionicons name="shield-checkmark-outline" size={22} color={palette.blue} />
        <Text style={[styles.noticeText, { color: palette.textPrimary }]}>Read-only device data. Pull down or tap Refresh to read again.</Text>
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
            accessibilityLabel={`Sync with ${healthAppName}`}
            onPress={() => navigation.navigate('SyncWearable', { autoSync: true })}
            style={({ pressed }) => [styles.connectButton, { backgroundColor: palette.blue, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="sync" size={20} color="#FFFFFF" />
            <Text style={styles.refreshText}>Sync with {healthAppName}</Text>
          </Pressable>
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
          {rows.map((item) => (
            <View key={item.key} style={[styles.metricCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
              <View style={styles.metricTopRow}>
                <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>{item.label}</Text>
                <Text style={[styles.status, { color: item.status === 'synced' ? palette.success : palette.textMuted }]}>{item.status}</Text>
              </View>
              <Text style={[styles.metricValue, { color: palette.textPrimary }]}>{item.value}</Text>
              {item.source ? <Text style={[styles.source, { color: palette.textMuted }]}>Source: {item.source}</Text> : null}
            </View>
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
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  noticeText: { ...typography.bodySmall, flex: 1 },
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
  list: { marginTop: spacing.lg, gap: spacing.sm },
  metricCard: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  metricTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  metricLabel: typography.label,
  status: { ...typography.badge, textTransform: 'capitalize' },
  metricValue: { ...typography.metric, marginTop: spacing.xs },
  source: { ...typography.subtext, marginTop: spacing.xxs },
  refreshButton: { minHeight: 52, marginTop: spacing.lg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  refreshText: { ...typography.button, color: '#FFFFFF' },
  updatedAt: { ...typography.subtext, marginTop: spacing.sm, textAlign: 'center' }
});
