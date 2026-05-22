import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { connectHealthApp, getAvailableHealthApps, syncConnectedHealthApp, type HealthAppId, type HealthAppOption } from '../../services/healthAppService';
import { recalculateWellness } from '../../utils/wellness';
import { initialWellness } from '../../data/mock';

type Props = NativeStackScreenProps<RootStackParamList, 'SyncWearable'>;

const iconMap: Record<HealthAppId, keyof typeof Ionicons.glyphMap> = {
  'apple-health': 'heart-circle-outline',
  'health-connect': 'pulse-outline',
  'google-fit': 'walk-outline',
  'samsung-health': 'watch-outline',
  fitbit: 'moon-outline'
};

export const SyncWearableScreen = ({ navigation, route }: Props) => {
  const autoSync = route.params?.autoSync === true;
  const { setWearableSetupCompleted, selectedDeviceId, setSelectedDeviceId, onboarding, setOnboarding, addWearableSyncData, setWellness } = useAppContext();
  const [sheetOpen, setSheetOpen] = useState(!autoSync);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(selectedDeviceId);
  const [apps, setApps] = useState<HealthAppOption[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const autoSyncAttemptedRef = useRef(false);

  const selectedApp = useMemo(
    () => apps.find((app) => app.id === selectedAppId) ?? null,
    [apps, selectedAppId]
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingApps(true);
      setError(null);
      try {
        const available = await getAvailableHealthApps();
        if (active) {
          setApps(available);
        }
      } catch {
        if (active) {
          setError('Unable to fetch health apps right now.');
        }
      } finally {
        if (active) {
          setLoadingApps(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const continueWithSelection = useCallback(async () => {
    if (!selectedAppId) return;
    setConnecting(true);
    setError(null);
    setSyncInfo(null);
    try {
      await connectHealthApp(selectedAppId as HealthAppId);
      const livePayload = await syncConnectedHealthApp(selectedAppId as HealthAppId);
      addWearableSyncData(livePayload);
      const connectedMetrics = livePayload.dataQuality.connectedMetrics ?? {};
      const syncedCount = Object.values(connectedMetrics).filter((status) => status === 'synced').length;
      const hasPermissionsIssue = Object.values(connectedMetrics).some((status) => status === 'no_permission');
      const hasRecentDataIssue = Object.values(connectedMetrics).every(
        (status) => status === 'no_recent_data' || status === 'unsupported' || status === 'unavailable'
      );

      if (syncedCount > 0) {
        setWellness(
          recalculateWellness({
            ...initialWellness,
            heartRateAvg: livePayload.metrics.heartRateAvg,
            sleepHours: livePayload.metrics.sleepHours,
            hydrationLiters: livePayload.metrics.hydrationLiters,
            focusMinutes: livePayload.metrics.focusMinutes,
            breathingMinutes: livePayload.metrics.breathingMinutes,
            movementMinutes: livePayload.metrics.movementMinutes
          })
        );
        setSyncInfo('Health app sync completed with real connected metrics.');
      } else if (hasPermissionsIssue) {
        setError('Health data permission is missing. Allow required permissions in Health Connect and retry sync.');
        setConnecting(false);
        return;
      } else if (hasRecentDataIssue) {
        setError('No recent health records were found for the selected metrics. Open your health app, confirm recent activity, and retry sync.');
        setConnecting(false);
        return;
      } else {
        setError('Sync completed but no supported metrics were available.');
        setConnecting(false);
        return;
      }

      setSelectedDeviceId(selectedAppId);
      if (onboarding) {
        setOnboarding({
          ...onboarding,
          wearablePreference: 'sync'
        });
      }

      setWearableSetupCompleted(true);
      setSheetOpen(false);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      setConnecting(false);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'sync_failed';
      if (message.includes('health_connect_unavailable')) {
        setError('Health Connect is unavailable on this device. Install or update Health Connect and retry.');
      } else if (message.includes('health_connect_initialize_failed')) {
        setError('Unable to initialize Health Connect. Please reopen the app and try again.');
      } else if (message.includes('health_app_connect_failed')) {
        setError('Unable to connect selected health app. Please retry.');
      } else {
        setError('Sync failed. Please verify health app permissions and retry.');
      }
      setConnecting(false);
      return;
    }

  }, [
    addWearableSyncData,
    navigation,
    onboarding,
    selectedAppId,
    setOnboarding,
    setSelectedDeviceId,
    setWearableSetupCompleted,
    setWellness
  ]);

  useEffect(() => {
    if (!autoSync || loadingApps || connecting || autoSyncAttemptedRef.current) return;
    if (selectedAppId) {
      autoSyncAttemptedRef.current = true;
      void continueWithSelection();
      return;
    }
    setSheetOpen(true);
  }, [autoSync, connecting, continueWithSelection, loadingApps, selectedAppId]);

  const skipForNow = () => {
    if (onboarding) {
      setOnboarding({
        ...onboarding,
        wearablePreference: 'later'
      });
    }
    setWearableSetupCompleted(true);
    setSheetOpen(false);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Connect a health app</Text>
        <Text style={styles.subTitle}>
          Sync is optional. Choose a health app to import wellness signals into Fiteatsy, or skip and continue.
        </Text>

        <PrimaryButton title="Choose health app" onPress={() => setSheetOpen(true)} />

        <Pressable style={styles.skipInline} onPress={skipForNow}>
          <Text style={styles.skipInlineText}>Maybe later</Text>
        </Pressable>
      </View>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={skipForNow}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={skipForNow} />
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Select health app</Text>
            <Text style={styles.sheetCopy}>Choose one to continue. You can change this anytime in Profile.</Text>

            <View style={styles.optionsList}>
              {loadingApps ? (
                <Text style={styles.loadingText}>Loading available apps...</Text>
              ) : null}
              {apps.map((app) => {
                const active = selectedAppId === app.id;
                return (
                  <Pressable
                    key={app.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedAppId(app.id)}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <View style={styles.optionLeft}>
                      <Ionicons name={iconMap[app.id]} size={20} color={active ? colors.blue : colors.textPrimary} />
                      <View style={styles.optionTextWrap}>
                        <Text style={styles.optionTitle}>{app.label}</Text>
                        <Text style={styles.optionSub}>{app.subtitle}</Text>
                      </View>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={20} color={colors.blue} /> : null}
                  </Pressable>
                );
              })}
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {syncInfo ? <Text style={styles.infoText}>{syncInfo}</Text> : null}

            <PrimaryButton title={connecting ? 'Connecting...' : 'Continue'} onPress={continueWithSelection} disabled={!selectedAppId || connecting} />
            <Pressable style={styles.sheetSkip} onPress={skipForNow}>
              <Text style={styles.sheetSkipText}>Skip for now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 16
  },
  title: {
    ...typography.title,
    fontSize: 24
  },
  subTitle: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary
  },
  skipInline: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  skipInlineText: {
    ...typography.caption,
    color: colors.textSecondary
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end'
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 12
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#4A4A4A',
    marginBottom: 2
  },
  sheetTitle: {
    ...typography.bodyStrong,
    fontSize: 18,
    color: colors.textPrimary
  },
  sheetCopy: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 13
  },
  optionsList: {
    gap: 10,
    marginBottom: 4
  },
  option: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  optionActive: {
    borderColor: colors.blue,
    backgroundColor: 'rgba(96,175,0,0.12)'
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  optionTextWrap: {
    flex: 1
  },
  optionTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  optionSub: {
    ...typography.caption,
    fontSize: 12
  },
  sheetSkip: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  sheetSkipText: {
    ...typography.caption,
    color: colors.textSecondary
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary
  },
  errorText: {
    ...typography.caption,
    color: colors.danger
  },
  infoText: {
    ...typography.caption,
    color: colors.textSecondary
  }
});
