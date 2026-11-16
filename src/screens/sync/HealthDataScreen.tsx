import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { useCanonicalHealthSyncCoordinator } from '../../services/canonicalHealthSyncCoordinator';
import { useAppContext } from '../../state/AppContext';
import { FitnessParameterCards } from '../fitness/FitnessScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'HealthData'>;
export const HealthDataScreen = ({ navigation, route }: Props) => {
  const { themeMode, onboarding, setOnboarding, setWearableSetupCompleted } = useAppContext();
  const palette = getThemeColors(themeMode);
  const health = useCanonicalHealthSyncCoordinator();
  const connected = health.providerState === 'CONNECTED';
  const liveRefreshStarted = useRef(false);
  const loading = !health.localHydrated;
  const refreshing = health.metrics.some((metric) => metric.queryState === 'QUERYING');

  const refresh = useCallback(() => {
    void health.syncLocalMetrics({ liveOnly: true });
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

  useEffect(() => {
    if (!connected || !health.localHydrated || liveRefreshStarted.current) return;
    liveRefreshStarted.current = true;
    void health.syncLocalMetrics({ liveOnly: true });
  }, [connected, health]);

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
        <FitnessParameterCards health={health} />
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
  refreshButton: { minHeight: 52, marginTop: spacing.lg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  refreshText: { ...typography.button, color: '#FFFFFF' },
  updatedAt: { ...typography.subtext, marginTop: spacing.sm, textAlign: 'center' },
  continueButton: { minHeight: 52, marginTop: spacing.lg, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  continueText: typography.button
});
