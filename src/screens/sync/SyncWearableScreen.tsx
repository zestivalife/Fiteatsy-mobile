import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SdkAvailabilityStatus, getSdkStatus } from 'react-native-health-connect';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, getThemeColors, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import {
  classifyRecoveryConnectionState,
  openHealthConnectPlayStore,
  syncConnectedHealthApp,
  type RecoveryConnectionState
} from '../../services/healthAppService';
import { recalculateWellness } from '../../utils/wellness';
import { initialWellness } from '../../data/mock';

type Props = NativeStackScreenProps<RootStackParamList, 'SyncWearable'>;

const stateCopy: Record<RecoveryConnectionState, { title: string; description: string; tone: 'ok' | 'warn' | 'calm' }> = {
  connected: {
    title: 'Recovery Signals Connected',
    description: 'Realtime recovery signals are available and your dashboard is now synced.',
    tone: 'ok'
  },
  partial: {
    title: 'Partially Connected',
    description: 'Some recovery signals are available. Fiteatsy will keep improving as more signals sync.',
    tone: 'calm'
  },
  calibrating: {
    title: 'Recovery Calibration Started',
    description: 'Recovery signals are syncing. Insights will become stronger as continuity builds.',
    tone: 'calm'
  },
  no_recent_data: {
    title: 'No Recent Recovery Signals',
    description: 'Your health apps are connected, but recent records are not available yet.',
    tone: 'warn'
  },
  no_signals: {
    title: 'No Recovery Signals Yet',
    description: 'Permissions are granted, but no supported recovery records were found yet.',
    tone: 'warn'
  },
  permission_missing: {
    title: 'Permission Needed',
    description: 'Recovery access is still needed to read sleep, activity, and heart recovery signals.',
    tone: 'warn'
  }
};

export const SyncWearableScreen = ({ navigation }: Props) => {
  const {
    themeMode,
    setWearableSetupCompleted,
    setSelectedDeviceId,
    onboarding,
    setOnboarding,
    addWearableSyncData,
    setWellness
  } = useAppContext();

  const [isRunning, setIsRunning] = useState(false);
  const [pendingInstall, setPendingInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<RecoveryConnectionState | null>(null);
  const [statusTitle, setStatusTitle] = useState('Connect Your Recovery');
  const [statusBody, setStatusBody] = useState(
    'Fiteatsy securely connects your sleep, activity, and wellness signals automatically.'
  );
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const completeOnboardingFlow = useCallback(() => {
    if (onboarding) {
      setOnboarding({
        ...onboarding,
        wearablePreference: connectionState === 'connected' || connectionState === 'partial' ? 'sync' : 'later'
      });
    }
    setWearableSetupCompleted(true);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }, [connectionState, navigation, onboarding, setOnboarding, setWearableSetupCompleted]);

  const runRecoveryConnection = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;

    if (Platform.OS !== 'android') {
      inFlightRef.current = false;
      completeOnboardingFlow();
      return;
    }
    if (typeof Platform.Version === 'number' && Platform.Version < 26) {
      if (isMountedRef.current) {
        setConnectionState('no_signals');
        setStatusTitle('Recovery Connection Not Supported');
        setStatusBody('This Android version does not support secure recovery sync.');
        setError('Please use Android 8.0 or newer for Health Connect recovery sync.');
      }
      inFlightRef.current = false;
      return;
    }

    if (isMountedRef.current) {
      setIsRunning(true);
      setError(null);
      setStatusTitle('Checking Recovery Connection');
      setStatusBody('Preparing secure access to your recovery signals.');
    }

    try {
      const sdkStatus = await getSdkStatus();
      if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        if (isMountedRef.current) {
          setPendingInstall(true);
          setConnectionState(null);
          setStatusTitle('Health Connect Needed');
          setStatusBody('Health Connect helps securely sync your recovery signals.');
        }
        await openHealthConnectPlayStore();
        return;
      }

      if (isMountedRef.current) {
        setPendingInstall(false);
        setStatusTitle('Syncing Recovery Signals');
        setStatusBody('Reading sleep, activity, and heart recovery data securely from your device.');
      }

      const payload = await syncConnectedHealthApp('health-connect');
      addWearableSyncData(payload);
      setSelectedDeviceId('health-connect');

      const state = classifyRecoveryConnectionState(payload);
      if (isMountedRef.current) {
        setConnectionState(state);
        setStatusTitle(stateCopy[state].title);
        setStatusBody(stateCopy[state].description);
      }

      const connectedMetrics = payload.dataQuality.connectedMetrics ?? {};
      const syncedCount = Object.values(connectedMetrics).filter((status) => status === 'synced').length;

      if (syncedCount > 0) {
        setWellness(
          recalculateWellness({
            ...initialWellness,
            heartRateAvg: payload.metrics.heartRateAvg,
            sleepHours: payload.metrics.sleepHours,
            hydrationLiters: payload.metrics.hydrationLiters,
            focusMinutes: payload.metrics.focusMinutes,
            breathingMinutes: payload.metrics.breathingMinutes,
            movementMinutes: payload.metrics.movementMinutes
          })
        );
      }

      if (state !== 'permission_missing') {
        completeOnboardingFlow();
      }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'sync_failed';
      if (message.includes('health_connect_unavailable')) {
        if (isMountedRef.current) {
          setStatusTitle('Health Connect Needed');
          setStatusBody('Install or update Health Connect to continue recovery sync.');
          setPendingInstall(true);
        }
      } else if (message.includes('health_connect_initialize_failed')) {
        if (isMountedRef.current) {
          setStatusTitle('Recovery Connection Paused');
          setStatusBody('Recovery connection is temporarily unavailable. Please retry in a moment.');
        }
      } else {
        if (isMountedRef.current) {
          setStatusTitle('Recovery Signals Pending');
          setStatusBody('Recovery signals are still calibrating. You can continue and sync again anytime.');
        }
      }
      if (isMountedRef.current) {
        setError('Recovery sync could not be completed right now.');
      }
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) {
        setIsRunning(false);
      }
    }
  }, [addWearableSyncData, completeOnboardingFlow, setSelectedDeviceId, setWellness]);

  // Stability guard:
  // avoid auto-triggering Health Connect permission/data reads during
  // screen transitions (logout/login/home sync navigation), which can crash
  // on some Android builds. Sync starts via explicit user action.

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;
      if (pendingInstall && wasBackground && nextState === 'active') {
        void runRecoveryConnection();
      }
    });
    return () => sub.remove();
  }, [pendingInstall, runRecoveryConnection]);

  const skipForNow = () => {
    if (onboarding) {
      setOnboarding({
        ...onboarding,
        wearablePreference: 'later'
      });
    }
    setWearableSetupCompleted(true);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Connect Your Recovery</Text>
        <Text style={[styles.subTitle, { color: palette.textSecondary }]}>
          Fiteatsy securely connects your sleep, activity, and wellness signals automatically.
        </Text>
        <Text style={[styles.supportText, { color: palette.textSecondary }]}>
          Works with Health Connect compatible wellness apps including: Samsung Health, Google Fit, NoiseFit, boAt
          Crest, Fitbit and more.
        </Text>

        <View style={[styles.statusCard, { borderColor: palette.stroke, backgroundColor: isLight ? '#FFFFFF' : palette.card }]}>
          <View style={styles.statusHeader}>
            <Ionicons
              name={
                connectionState === 'connected'
                  ? 'checkmark-circle'
                  : connectionState === 'permission_missing'
                    ? 'lock-closed-outline'
                    : 'pulse-outline'
              }
              size={20}
              color={connectionState === 'connected' ? colors.success : connectionState === 'permission_missing' ? colors.warning : colors.blue}
            />
            <Text style={[styles.statusTitle, { color: palette.textPrimary }]}>{statusTitle}</Text>
          </View>
          <Text style={[styles.statusBody, { color: palette.textSecondary }]}>{statusBody}</Text>
          {error ? <Text style={[styles.errorText, { color: isLight ? '#B42318' : colors.danger }]}>{error}</Text> : null}
        </View>

        <PrimaryButton
          title={
            isRunning
              ? 'Connecting...'
              : pendingInstall
                ? 'Continue After Install'
                : connectionState === 'permission_missing'
                  ? 'Retry Permission'
                  : 'Continue'
          }
          onPress={() => void runRecoveryConnection()}
          disabled={isRunning}
        />

        <Pressable style={styles.skipInline} onPress={skipForNow}>
          <Text style={[styles.skipInlineText, { color: palette.textSecondary }]}>Skip for now</Text>
        </Pressable>
      </View>
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
    fontSize: 14
  },
  supportText: {
    ...typography.caption,
    fontSize: 12
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: 8
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  statusTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  statusBody: {
    ...typography.body,
    fontSize: 12
  },
  errorText: {
    ...typography.caption,
    fontSize: 12
  },
  skipInline: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  skipInlineText: {
    ...typography.caption
  }
});
