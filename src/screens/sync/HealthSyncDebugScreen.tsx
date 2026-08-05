import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppBackButton } from '../../components/AppBackButton';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { getHealthConnectRuntimeDiagnostics, HealthConnectRuntimeDiagnostics } from '../../services/healthConnectService';
import { getHealthScores, HealthScore, getHealthScoreSummary, HealthScoreSummary } from '../../services/healthIntelligenceService';
import {
  getHealthSyncStatus,
  getLatestHealthObservations,
  HealthObservationDto,
  HealthSyncStatus,
  runHealthSync
} from '../../services/healthSyncManager';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'HealthSyncDebug'>;

type SyncStats = {
  recordsRead: number;
  recordsSent: number;
  recordsStored: number;
};

const permissionRows: Array<{ key: keyof HealthConnectRuntimeDiagnostics['permissionStates']; label: string }> = [
  { key: 'Steps', label: 'steps' },
  { key: 'SleepSession', label: 'sleep' },
  { key: 'RestingHeartRate', label: 'heart rate' },
  { key: 'HeartRateVariabilityRmssd', label: 'HRV' },
  { key: 'ExerciseSession', label: 'exercise' }
];

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return 'Not synced';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const statusLabel = (status?: string | null) => status ?? 'UNKNOWN';

const countDiagnosticsRecords = (diagnostics: HealthConnectRuntimeDiagnostics | null) => {
  if (!diagnostics) return 0;
  return Object.values(diagnostics.metricDebug).reduce((sum, metric) => sum + metric.recordCount, 0);
};

const scoreText = (value: number | null | undefined) => (typeof value === 'number' ? String(value) : 'INSUFFICIENT_DATA');

const formatInputSummary = (inputSummary: Record<string, unknown>) => {
  const keys = Object.keys(inputSummary);
  if (keys.length === 0) return 'No input summary recorded';
  return keys.slice(0, 4).map((key) => `${key}: ${String(inputSummary[key])}`).join(' • ');
};

export const HealthSyncDebugScreen = ({ navigation }: Props) => {
  const {
    themeMode,
    wellness,
    addWearableSyncData,
    setSelectedDeviceId,
    setWellness
  } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [diagnostics, setDiagnostics] = useState<HealthConnectRuntimeDiagnostics | null>(null);
  const [syncStatus, setSyncStatus] = useState<HealthSyncStatus | null>(null);
  const [observations, setObservations] = useState<HealthObservationDto[]>([]);
  const [scores, setScores] = useState<HealthScoreSummary | null>(null);
  const [detailedScores, setDetailedScores] = useState<HealthScore[]>([]);
  const [stats, setStats] = useState<SyncStats>({ recordsRead: 0, recordsSent: 0, recordsStored: 0 });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDiagnostics, nextStatus, nextObservations, nextScores, nextDetailedScores] = await Promise.all([
        getHealthConnectRuntimeDiagnostics(),
        getHealthSyncStatus(),
        getLatestHealthObservations(10),
        getHealthScoreSummary(),
        getHealthScores()
      ]);
      setDiagnostics(nextDiagnostics);
      setSyncStatus(nextStatus);
      setObservations(nextObservations.items);
      setScores(nextScores);
      setDetailedScores(nextDetailedScores.items);
      setStats((previous) => ({
        recordsRead: countDiagnosticsRecords(nextDiagnostics),
        recordsSent: previous.recordsSent,
        recordsStored: nextStatus.recordsSynced
      }));
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'health_sync_debug_refresh_failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runRealSync = async () => {
    setSyncing(true);
    setError(null);
    console.info('[HealthSyncDebug] HealthSyncManager started');
    try {
      const result = await runHealthSync('health-connect', wellness);
      console.info('[HealthSyncDebug] Platform data read', { observations: result.observations.length });
      console.info('[HealthSyncDebug] Backend sync request completed', {
        accepted: result.accepted,
        duplicate: result.duplicate,
        rejected: result.rejected
      });
      addWearableSyncData(result.payload);
      setSelectedDeviceId('health-connect');
      setWellness(result.wellness);
      setStats({
        recordsRead: result.observations.length,
        recordsSent: result.observations.length,
        recordsStored: result.status.recordsSynced
      });
      await refresh();
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'health_sync_failed';
      console.warn('[HealthSyncDebug] Sync failed', message);
      setError(message);
    } finally {
      setSyncing(false);
    }
  };

  if (!__DEV__) {
    return (
      <Screen>
        <AppBackButton onPress={() => navigation.goBack()} />
        <View style={styles.unavailable}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Health Sync Debug</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>This internal screen is only available in development builds.</Text>
        </View>
      </Screen>
    );
  }

  const platformStatus =
    Platform.OS === 'android'
      ? statusLabel(syncStatus?.healthConnect.status)
      : Platform.OS === 'ios'
        ? statusLabel(syncStatus?.appleHealth.status)
        : 'NOT_SUPPORTED';
  const pipelineRows = [
    { label: 'Health Platform', status: platformStatus === 'CONNECTED' ? 'OK' : platformStatus },
    { label: 'Mobile Sync', status: diagnostics && countDiagnosticsRecords(diagnostics) > 0 ? 'OK' : 'WAITING_FOR_RECORDS' },
    { label: 'API', status: syncStatus ? 'OK' : 'UNKNOWN' },
    { label: 'Backend', status: syncStatus ? 'OK' : 'UNKNOWN' },
    { label: 'Database', status: syncStatus && syncStatus.recordsSynced > 0 ? 'OK' : 'WAITING_FOR_STORED_RECORDS' },
    { label: 'Calculation Engine', status: scores?.status === 'calculated' ? 'OK' : 'INSUFFICIENT_DATA' },
    { label: 'Homepage', status: scores?.status === 'calculated' ? 'READY' : 'CALIBRATING' }
  ];

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppBackButton onPress={() => navigation.goBack()} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh health sync debug data"
          style={[styles.iconButton, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }]}
          onPress={refresh}
          disabled={loading}
        >
          {loading ? <ActivityIndicator size="small" color={palette.textPrimary} /> : <Ionicons name="refresh" size={18} color={palette.textPrimary} />}
        </Pressable>
      </View>

      <Text style={[styles.title, { color: palette.textPrimary }]}>Health Sync Debug</Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>
        Development-only validation for the real Health Connect sync pipeline. No mock values are generated here.
      </Text>

      {error ? (
        <View style={[styles.errorCard, { borderColor: palette.warning, backgroundColor: palette.cardMuted }]}>
          <Text style={[styles.errorTitle, { color: palette.warning }]}>Debug Error</Text>
          <Text style={[styles.body, { color: palette.textPrimary }]}>{error}</Text>
        </View>
      ) : null}

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Connection Status</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: palette.textSecondary }]}>Health platform</Text>
          <Text style={[styles.value, { color: palette.textPrimary }]}>{platformStatus}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: palette.textSecondary }]}>Runtime platform</Text>
          <Text style={[styles.value, { color: palette.textPrimary }]}>{Platform.OS}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: palette.textSecondary }]}>SDK status</Text>
          <Text style={[styles.value, { color: palette.textPrimary }]}>{diagnostics?.sdkStatus ?? 'UNKNOWN'}</Text>
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Permission Status</Text>
        {permissionRows.map((permission) => {
          const granted = diagnostics?.permissionStates?.[permission.key] === true;
          return (
            <View key={permission.key} style={styles.row}>
              <Text style={[styles.label, { color: palette.textSecondary }]}>{permission.label}</Text>
              <Text style={[styles.value, { color: granted ? palette.success : palette.textPrimary }]}>
                {granted ? 'GRANTED' : 'NOT_GRANTED'}
              </Text>
            </View>
          );
        })}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Last Sync</Text>
        <Text style={[styles.valuePrimary, { color: palette.textPrimary }]}>{formatDateTime(syncStatus?.lastSyncISO)}</Text>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Sync Statistics</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Records read</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{stats.recordsRead}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Records sent</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{stats.recordsSent}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Records stored</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{stats.recordsStored}</Text></View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Latest Observations</Text>
        {observations.length === 0 ? (
          <Text style={[styles.body, { color: palette.textSecondary }]}>No persisted observations found for this authenticated client.</Text>
        ) : (
          observations.map((observation) => (
            <View key={observation.id} style={[styles.observationRow, { borderColor: palette.stroke }]}>
              <Text style={[styles.observationMetric, { color: palette.textPrimary }]}>{observation.metricType}</Text>
              <Text style={[styles.observationValue, { color: palette.textSecondary }]}>
                {observation.value} {observation.unit}
              </Text>
              <Text style={[styles.observationMeta, { color: palette.textSecondary }]}>
                {observation.sourceProvider} • {formatDateTime(observation.measuredAtISO)}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Intelligence Output</Text>
        <View style={styles.scoreGrid}>
          <ScoreTile label="Activity Score" value={scoreText(scores?.activityScore)} />
          <ScoreTile label="Sleep Score" value={scoreText(scores?.sleepScore)} />
          <ScoreTile label="Calm Score" value={scoreText(scores?.calmScore)} />
          <ScoreTile label="Recovery Score" value={scoreText(scores?.recoveryScore)} />
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Calculation Inputs</Text>
        {detailedScores.length === 0 ? (
          <Text style={[styles.body, { color: palette.textSecondary }]}>No backend calculation records found for this client.</Text>
        ) : (
          detailedScores.map((score) => (
            <View key={score.id} style={[styles.observationRow, { borderColor: palette.stroke }]}>
              <Text style={[styles.observationMetric, { color: palette.textPrimary }]}>{score.scoreType}</Text>
              <Text style={[styles.observationValue, { color: palette.textSecondary }]}>
                {score.scoreStatus} • confidence {score.confidence}
              </Text>
              <Text style={[styles.observationMeta, { color: palette.textSecondary }]}>{formatInputSummary(score.inputSummary)}</Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Pipeline Status</Text>
        {pipelineRows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={[styles.label, { color: palette.textSecondary }]}>{row.label}</Text>
            <Text style={[styles.value, { color: row.status === 'OK' || row.status === 'READY' ? palette.success : palette.textPrimary }]}>
              {row.status}
            </Text>
          </View>
        ))}
      </Card>

      <PrimaryButton title={syncing ? 'Syncing Real Data...' : 'Run Real Health Connect Sync'} onPress={runRealSync} disabled={syncing} />
    </Screen>
  );
};

const ScoreTile = ({ label, value }: { label: string; value: string }) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  return (
    <View style={[styles.scoreTile, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }]}>
      <Text style={[styles.scoreLabel, { color: palette.textSecondary }]}>{label}</Text>
      <Text style={[styles.scoreValue, { color: palette.textPrimary }]}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  unavailable: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm
  },
  title: {
    ...typography.section,
    fontSize: 24,
    marginBottom: spacing.xs
  },
  body: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginVertical: spacing.md,
    gap: spacing.xs
  },
  errorTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  sectionTitle: {
    ...typography.bodyStrong,
    fontSize: 15,
    marginBottom: spacing.sm
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 7
  },
  label: {
    ...typography.caption,
    flex: 1,
    fontSize: 13,
    textTransform: 'capitalize'
  },
  value: {
    ...typography.bodyStrong,
    flex: 1,
    fontSize: 13,
    textAlign: 'right'
  },
  valuePrimary: {
    ...typography.bodyStrong,
    fontSize: 16
  },
  observationRow: {
    borderTopWidth: 1,
    paddingVertical: spacing.sm,
    gap: 2
  },
  observationMetric: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  observationValue: {
    ...typography.body,
    fontSize: 13
  },
  observationMeta: {
    ...typography.caption,
    fontSize: 12
  },
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  scoreTile: {
    width: '48%',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4
  },
  scoreLabel: {
    ...typography.caption,
    fontSize: 12
  },
  scoreValue: {
    ...typography.bodyStrong,
    fontSize: 18
  }
});
