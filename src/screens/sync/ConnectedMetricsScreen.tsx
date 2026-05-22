import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { getThemeColors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectedMetrics'>;

type MetricKey =
  | 'sleep'
  | 'steps'
  | 'heart_rate'
  | 'hrv'
  | 'calories'
  | 'workouts'
  | 'stress'
  | 'cycle'
  | 'spo2'
  | 'respiratory_rate';

const metricLabels: Record<MetricKey, string> = {
  sleep: 'Sleep Recovery',
  steps: 'Movement Steps',
  heart_rate: 'Heart Rhythm',
  hrv: 'Recovery Balance',
  calories: 'Energy Burn',
  workouts: 'Movement Sessions',
  stress: 'Calm Load',
  cycle: 'Cycle Rhythm',
  spo2: 'Oxygen Recovery',
  respiratory_rate: 'Breathing Recovery'
};

const statusColor = (
  status: 'synced' | 'missing' | 'unsupported' | 'estimated' | 'no_permission' | 'no_recent_data' | 'unavailable',
  isLight: boolean
) => {
  if (status === 'synced') return isLight ? '#166534' : '#86EFAC';
  if (status === 'no_permission') return isLight ? '#9A3412' : '#FDBA74';
  if (status === 'no_recent_data') return isLight ? '#92400E' : '#FCD34D';
  if (status === 'unavailable') return isLight ? '#B91C1C' : '#FCA5A5';
  if (status === 'missing') return isLight ? '#92400E' : '#FCD34D';
  if (status === 'unsupported') return isLight ? '#475569' : '#94A3B8';
  return isLight ? '#0F766E' : '#5EEAD4';
};

const statusLabel = (
  status: 'synced' | 'missing' | 'unsupported' | 'estimated' | 'no_permission' | 'no_recent_data' | 'unavailable'
) => {
  if (status === 'synced') return 'REAL';
  if (status === 'no_permission') return 'NO PERMISSION';
  if (status === 'no_recent_data') return 'NO RECENT DATA';
  if (status === 'unavailable') return 'UNAVAILABLE';
  if (status === 'unsupported') return 'UNSUPPORTED';
  if (status === 'estimated') return 'ESTIMATED';
  return 'UNAVAILABLE';
};

const statusIcon = (
  status: 'synced' | 'missing' | 'unsupported' | 'estimated' | 'no_permission' | 'no_recent_data' | 'unavailable'
) => {
  if (status === 'synced') return 'checkmark-circle';
  if (status === 'no_permission') return 'lock-closed-outline';
  if (status === 'no_recent_data') return 'time-outline';
  if (status === 'unavailable') return 'alert-circle-outline';
  if (status === 'unsupported') return 'remove-circle-outline';
  if (status === 'estimated') return 'time-outline';
  return 'alert-circle-outline';
};

export const ConnectedMetricsScreen = ({ navigation }: Props) => {
  const { themeMode, wearableSyncData } = useAppContext();
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const latest = wearableSyncData[0] ?? null;

  const metricStatus = useMemo(() => {
    const defaults: Record<MetricKey, 'synced' | 'missing' | 'unsupported' | 'estimated' | 'no_permission' | 'no_recent_data' | 'unavailable'> = {
      sleep: 'missing',
      steps: 'missing',
      heart_rate: 'missing',
      hrv: 'missing',
      calories: 'missing',
      workouts: 'missing',
      stress: 'missing',
      cycle: 'missing',
      spo2: 'missing',
      respiratory_rate: 'missing'
    };
    return {
      ...defaults,
      ...(latest?.dataQuality.connectedMetrics ?? {})
    };
  }, [latest]);

  const normalizedDomains = latest?.dataQuality.normalizedDomains;

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <AppBackButton iconOnly onPress={() => navigation.goBack()} />
        <Text style={[styles.title, { color: palette.textPrimary }]}>Connected Metrics</Text>
        <View style={styles.iconSpacer} />
      </View>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Sync Summary</Text>
        <Text style={[styles.summary, { color: palette.textSecondary }]}>
          Provider: {latest?.provider ?? 'Not connected'}
        </Text>
        <Text style={[styles.summary, { color: palette.textSecondary }]}>
          Last Sync: {latest ? new Date(latest.syncedAtISO).toLocaleString() : 'Not available'}
        </Text>
        <Text style={[styles.summary, { color: palette.textSecondary }]}>
          Source: {latest?.source ?? 'None'}
        </Text>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Metrics Status</Text>
        {(Object.keys(metricLabels) as MetricKey[]).map((key) => (
          <View key={key} style={styles.row}>
            <Text style={[styles.label, { color: palette.textPrimary }]}>{metricLabels[key]}</Text>
            <View style={styles.statusWrap}>
              <Ionicons name={statusIcon(metricStatus[key])} size={14} color={statusColor(metricStatus[key], isLight)} />
              <Text style={[styles.value, { color: statusColor(metricStatus[key], isLight) }]}>{statusLabel(metricStatus[key])}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Normalized Domains</Text>
        {normalizedDomains ? (
          (Object.keys(normalizedDomains) as Array<keyof typeof normalizedDomains>).map((domain) => (
            <View key={domain} style={styles.row}>
              <Text style={[styles.label, { color: palette.textPrimary }]}>{domain}</Text>
              <Text style={[styles.value, { color: palette.textSecondary }]}>
                {normalizedDomains[domain] == null ? 'Not available' : `${normalizedDomains[domain]}`}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.summary, { color: palette.textSecondary }]}>No normalized domain values yet.</Text>
        )}
      </Card>

      {latest?.dataQuality.warnings?.length ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Warnings</Text>
          {latest.dataQuality.warnings.map((warning) => (
            <Text key={warning} style={[styles.warning, { color: palette.textSecondary }]}>• {warning}</Text>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconSpacer: {
    width: 34,
    height: 34
  },
  title: {
    ...typography.section,
    fontSize: 20
  },
  sectionTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginBottom: 8
  },
  summary: {
    ...typography.body,
    fontSize: 12,
    marginBottom: 4
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8
  },
  label: {
    ...typography.body,
    fontSize: 12
  },
  value: {
    ...typography.bodyStrong,
    fontSize: 12,
    textTransform: 'uppercase'
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  warning: {
    ...typography.body,
    fontSize: 12,
    marginBottom: 4
  }
});
