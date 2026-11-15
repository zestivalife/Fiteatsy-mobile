import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { requestAppleHealthPermissions } from '../../services/appleHealthService';
import { readCurrentHealthData } from '../../services/healthAppService';
import { requestHealthConnectPermissionsOnly } from '../../services/healthConnectService';
import { runHealthSync } from '../../services/healthSyncManager';
import { useAppContext } from '../../state/AppContext';
import type { HealthObservationDraft, WearableSyncPayload } from '../../types';

type SyncPhase = 'idle' | 'requesting' | 'reading' | 'complete' | 'error';

type ParameterDefinition = {
  key: string;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  observationTypes: string[];
};

const PARAMETERS: ParameterDefinition[] = [
  { key: 'activity', title: 'Activity', icon: 'footsteps-outline', color: '#FF7139', observationTypes: ['steps', 'distance', 'active_energy', 'active_minutes', 'workout_minutes'] },
  { key: 'sleep', title: 'Sleep', icon: 'moon-outline', color: '#7771FF', observationTypes: ['sleep_minutes', 'sleep_core_minutes', 'sleep_deep_minutes', 'sleep_rem_minutes'] },
  { key: 'heart', title: 'Heart', icon: 'heart-outline', color: '#FF375F', observationTypes: ['heart_rate', 'resting_heart_rate'] },
  { key: 'recovery', title: 'Recovery', icon: 'pulse-outline', color: '#FF2D55', observationTypes: ['hrv_ms', 'respiratory_rate_brpm', 'spo2_pct'] },
  { key: 'body', title: 'Body', icon: 'scale-outline', color: '#FFD60A', observationTypes: ['weight'] },
  { key: 'mindfulness', title: 'Mindfulness', icon: 'leaf-outline', color: '#32D74B', observationTypes: ['mindfulness_minutes'] }
];

const latestObservation = (observations: HealthObservationDraft[], types: string[]) => observations
  .filter((item) => types.includes(item.metricType))
  .sort((left, right) => Date.parse(right.measuredAtISO) - Date.parse(left.measuredAtISO))[0];

const FitnessScreen = () => {
  const {
    themeMode,
    wellness,
    setWellness,
    setSelectedDeviceId,
    addWearableSyncData
  } = useAppContext();
  const palette = getThemeColors(themeMode);
  const providerName = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  const providerId = Platform.OS === 'ios' ? 'apple-health' : 'health-connect';
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [payload, setPayload] = useState<WearableSyncPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const parameterRows = useMemo(() => {
    const observations = payload?.observations ?? [];
    return PARAMETERS.map((parameter) => {
      const latest = latestObservation(observations, parameter.observationTypes);
      const count = observations.filter((item) => parameter.observationTypes.includes(item.metricType)).length;
      return { ...parameter, latest, count };
    });
  }, [payload]);

  const syncHealth = useCallback(async () => {
    if (phase === 'requesting' || phase === 'reading') return;
    setError(null);
    setUploadNotice(null);
    setPhase('requesting');

    try {
      if (Platform.OS === 'ios') {
        await requestAppleHealthPermissions();
      } else if (Platform.OS === 'android') {
        const permission = await requestHealthConnectPermissionsOnly();
        if (permission.grantedCount === 0) throw new Error('Health permission was not granted.');
      } else {
        throw new Error('Health sync is not supported on this device.');
      }

      setPhase('reading');
      const current = await readCurrentHealthData();
      setPayload(current);
      setSelectedDeviceId(providerId);

      try {
        const result = await runHealthSync(providerId, wellness);
        addWearableSyncData(result.payload);
        setPayload(result.payload);
        setWellness(result.wellness);
        setUploadNotice(`${result.accepted + result.duplicate} records securely synced.`);
      } catch {
        setUploadNotice('Current health data was read. Secure upload will retry when the service is available.');
      }

      setPhase('complete');
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Health data could not be synced.');
      setPhase('error');
    }
  }, [addWearableSyncData, phase, providerId, setSelectedDeviceId, setWellness, wellness]);

  const busy = phase === 'requesting' || phase === 'reading';

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <AppBackButton />
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Fitness</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Independent health parameter sync</Text>
        </View>
      </View>

      <View style={[styles.providerCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
        <View style={[styles.providerIcon, { backgroundColor: palette.blueSoft }]}>
          <Ionicons name={Platform.OS === 'ios' ? 'heart' : 'fitness'} size={32} color={Platform.OS === 'ios' ? '#FF375F' : palette.blue} />
        </View>
        <View style={styles.providerCopy}>
          <Text style={[styles.providerName, { color: palette.textPrimary }]}>{providerName}</Text>
          <Text style={[styles.providerDescription, { color: palette.textSecondary }]}>Choose the parameters you allow Fiteatsy to read. Data access remains read-only.</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sync fitness data from ${providerName}`}
        disabled={busy}
        onPress={() => { void syncHealth(); }}
        style={({ pressed }) => [styles.syncButton, { backgroundColor: palette.blue, opacity: pressed || busy ? 0.72 : 1 }]}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="sync" size={21} color="#FFFFFF" />}
        <Text style={styles.syncButtonText}>{phase === 'requesting' ? 'Requesting permission…' : phase === 'reading' ? 'Reading current data…' : payload ? 'Sync Again' : 'Sync'}</Text>
      </Pressable>

      {error ? (
        <View accessibilityRole="alert" style={[styles.messageCard, { backgroundColor: palette.dangerSoft, borderColor: palette.danger }]}>
          <Ionicons name="alert-circle-outline" size={20} color={palette.danger} />
          <Text style={[styles.messageText, { color: palette.textPrimary }]}>{error}</Text>
        </View>
      ) : null}

      {payload ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Health parameters</Text>
            <Text style={[styles.lastSync, { color: palette.textMuted }]}>{new Date(payload.syncedAtISO).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <View style={styles.parameterList}>
            {parameterRows.map((parameter) => (
              <View key={parameter.key} style={[styles.parameterCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
                <View style={[styles.parameterIcon, { backgroundColor: `${parameter.color}20` }]}>
                  <Ionicons name={parameter.icon} size={22} color={parameter.color} />
                </View>
                <View style={styles.parameterCopy}>
                  <Text style={[styles.parameterTitle, { color: palette.textPrimary }]}>{parameter.title}</Text>
                  <Text style={[styles.parameterDetail, { color: palette.textSecondary }]}>
                    {parameter.latest ? `Latest ${parameter.latest.value} ${parameter.latest.unit}` : 'No current permitted data'}
                  </Text>
                </View>
                <Text style={[styles.parameterCount, { color: parameter.count > 0 ? palette.success : palette.textMuted }]}>{parameter.count}</Text>
              </View>
            ))}
          </View>
          {uploadNotice ? <Text style={[styles.uploadNotice, { color: palette.textSecondary }]}>{uploadNotice}</Text> : null}
        </>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <Ionicons name="shield-checkmark-outline" size={30} color={palette.blue} />
          <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>Your permission comes first</Text>
          <Text style={[styles.emptyBody, { color: palette.textSecondary }]}>Tap Sync to open {providerName} permissions and read the latest available health parameters.</Text>
        </View>
      )}
    </Screen>
  );
};

export { FitnessScreen };

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerCopy: { flex: 1 },
  title: typography.title,
  subtitle: { ...typography.subtext, marginTop: spacing.xxs },
  providerCard: { marginTop: spacing.xl, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  providerIcon: { width: 58, height: 58, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  providerCopy: { flex: 1 },
  providerName: typography.sectionTitle,
  providerDescription: { ...typography.bodySmall, marginTop: spacing.xxs },
  syncButton: { minHeight: 54, marginTop: spacing.lg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  syncButtonText: { ...typography.button, color: '#FFFFFF' },
  messageCard: { marginTop: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  messageText: { ...typography.bodySmall, flex: 1 },
  sectionHeader: { marginTop: spacing.xl, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: typography.sectionTitle,
  lastSync: typography.subtext,
  parameterList: { gap: spacing.sm },
  parameterCard: { minHeight: 76, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  parameterIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  parameterCopy: { flex: 1 },
  parameterTitle: typography.cardTitle,
  parameterDetail: { ...typography.subtext, marginTop: spacing.xxs },
  parameterCount: typography.metricSmall,
  uploadNotice: { ...typography.subtext, marginTop: spacing.md, textAlign: 'center' },
  emptyCard: { marginTop: spacing.xl, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  emptyTitle: { ...typography.cardTitle, marginTop: spacing.sm },
  emptyBody: { ...typography.bodySmall, marginTop: spacing.xs, textAlign: 'center' }
});
