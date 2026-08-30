import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SdkAvailabilityStatus, getSdkStatus } from 'react-native-health-connect';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { PageHeader } from '../../components/PageHeader';
import { OnboardingAction, OnboardingShell, QuestionHeader } from '../../components/onboarding/OnboardingShell';
import { colors, getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import {
  classifyRecoveryConnectionState,
  openHealthConnectPlayStore,
  type RecoveryConnectionState
} from '../../services/healthAppService';
import { requestHealthConnectPermissionsOnly, withHealthConnectTimeout } from '../../services/healthConnectService';
import { HealthSyncResult, runHealthSync } from '../../services/healthSyncManager';
import { WearableSyncPayload } from '../../types';

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

type SyncStage =
  | 'intro'
  | 'permission_explainer'
  | 'requesting_permission'
  | 'connected_ready'
  | 'syncing'
  | 'completed'
  | 'partial'
  | 'insufficient_data'
  | 'permission_denied'
  | 'not_supported'
  | 'failed';

type DomainKey = 'Activity' | 'Sleep' | 'Heart' | 'Recovery';

type DomainRow = {
  key: DomainKey;
  icon: keyof typeof Ionicons.glyphMap;
  metricKeys: Array<keyof NonNullable<WearableSyncPayload['dataQuality']['connectedMetrics']>>;
};

const domainRows: DomainRow[] = [
  { key: 'Activity', icon: 'walk-outline', metricKeys: ['steps', 'workouts'] },
  { key: 'Sleep', icon: 'moon-outline', metricKeys: ['sleep'] },
  { key: 'Heart', icon: 'heart-outline', metricKeys: ['heart_rate'] },
  { key: 'Recovery', icon: 'pulse-outline', metricKeys: ['hrv'] }
];

const statusText: Record<string, string> = {
  synced: 'Synced',
  no_recent_data: 'No recent data',
  no_permission: 'Permission needed',
  unsupported: 'Not supported',
  unavailable: 'Unavailable',
  estimated: 'Estimated',
  missing: 'Missing'
};

const stageContent: Record<SyncStage, { title: string; body: string; eyebrow: string }> = {
  intro: {
    eyebrow: 'Health Intelligence',
    title: 'Unlock Your Health Intelligence',
    body: 'Connect Health Connect to turn real activity, sleep, heart, and recovery signals into Fiteatsy scores.'
  },
  permission_explainer: {
    eyebrow: 'Secure permission',
    title: 'You choose what Fiteatsy can read',
    body: 'We request read-only access to steps, sleep, heart rate, HRV, and exercise. You can change access anytime in system settings.'
  },
  requesting_permission: {
    eyebrow: 'Permission request',
    title: 'Opening Health Connect',
    body: 'Approve the health signals you want Fiteatsy to use. We will return here and prepare your first sync.'
  },
  connected_ready: {
    eyebrow: 'Connected',
    title: 'Health Data Connected',
    body: 'Permission is ready. Start your first sync to update Activity, Sleep, Calm, and Recovery scores.'
  },
  syncing: {
    eyebrow: 'Sync in progress',
    title: 'Reading your health signals',
    body: 'Fiteatsy is normalizing observations and sending them to the backend calculation engine.'
  },
  completed: {
    eyebrow: 'Sync complete',
    title: 'Health Intelligence Updated',
    body: 'Your latest observations were stored and Fiteatsy scores were recalculated from backend data.'
  },
  partial: {
    eyebrow: 'Partial sync',
    title: 'Some signals synced',
    body: 'Fiteatsy updated the available domains and will avoid misleading scores for missing domains.'
  },
  insufficient_data: {
    eyebrow: 'INSUFFICIENT_DATA',
    title: 'No recent health data found',
    body: 'Permissions may be connected, but Health Connect did not return supported recent records yet.'
  },
  permission_denied: {
    eyebrow: 'Permission needed',
    title: 'Health data access was not granted',
    body: 'Fiteatsy cannot calculate live intelligence without read permission for at least one supported signal.'
  },
  not_supported: {
    eyebrow: 'Platform unavailable',
    title: 'Health Connect is not available here',
    body: 'Health sync currently supports Android Health Connect. Apple Health support requires the native HealthKit reader.'
  },
  failed: {
    eyebrow: 'Sync failed',
    title: 'Your previous data is safe',
    body: 'We could not complete this sync. Nothing was deleted; retry when the platform or network is available.'
  }
};

const stageIcon: Record<SyncStage, keyof typeof Ionicons.glyphMap> = {
  intro: 'sparkles-outline',
  permission_explainer: 'shield-checkmark-outline',
  requesting_permission: 'lock-open-outline',
  connected_ready: 'checkmark-circle-outline',
  syncing: 'sync-outline',
  completed: 'checkmark-done-circle-outline',
  partial: 'analytics-outline',
  insufficient_data: 'information-circle-outline',
  permission_denied: 'lock-closed-outline',
  not_supported: 'phone-portrait-outline',
  failed: 'warning-outline'
};

const summarizeDomain = (
  domain: DomainRow,
  metrics: NonNullable<WearableSyncPayload['dataQuality']['connectedMetrics']> | undefined,
  isRunning: boolean
) => {
  if (isRunning) return 'Checking';
  const statuses = domain.metricKeys.map((key) => metrics?.[key] ?? 'missing');
  if (statuses.some((status) => status === 'synced')) return 'Synced';
  if (statuses.some((status) => status === 'no_permission')) return 'Permission needed';
  if (statuses.some((status) => status === 'no_recent_data')) return 'No recent data';
  if (statuses.every((status) => status === 'unsupported')) return 'Not supported';
  return statusText[statuses[0]] ?? 'Pending';
};

const formatSyncTime = (iso?: string | null) => {
  if (!iso) return 'Not synced yet';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

export const SyncWearableScreen = ({ navigation }: Props) => {
  const {
    themeMode,
    wearableSetupCompleted,
    setWearableSetupCompleted,
    setSelectedDeviceId,
    onboarding,
    setOnboarding,
    addWearableSyncData,
    wellness,
    setWellness
  } = useAppContext();

  const [isRunning, setIsRunning] = useState(false);
  const [pendingInstall, setPendingInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<RecoveryConnectionState | null>(null);
  const [stage, setStage] = useState<SyncStage>('intro');
  const [lastResult, setLastResult] = useState<HealthSyncResult | null>(null);
  const [lastSyncAttemptISO, setLastSyncAttemptISO] = useState<string | null>(null);
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
    navigation.navigate('OnboardingCalendar');
  }, [connectionState, navigation, onboarding, setOnboarding, setWearableSetupCompleted]);

  const finishOnboardingFlow = useCallback(() => {
    completeOnboardingFlow();
  }, [completeOnboardingFlow]);

  const requestHealthPermission = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setStage('not_supported');
      setStatusTitle('Apple Health Reader Not Available');
      setStatusBody('This build supports Android Health Connect. Apple Health needs the native HealthKit reader before syncing.');
      setError('Supported now: Android Health Connect. Coming next: native Apple HealthKit reader.');
      return;
    }

    setIsRunning(true);
    setError(null);
    setStage('requesting_permission');
    setStatusTitle('Opening Health Connect');
    setStatusBody('Requesting read-only access for steps, sleep, heart rate, HRV, and exercise.');
    try {
      const permission = await requestHealthConnectPermissionsOnly();
      if (permission.grantedCount > 0) {
        setConnectionState('calibrating');
        setStage('connected_ready');
        setStatusTitle('Health Data Connected');
        setStatusBody(`${permission.grantedCount}/${permission.requestedCount} Health Connect permissions are ready. Start your first sync when you are ready.`);
      } else {
        setConnectionState('permission_missing');
        setStage('permission_denied');
        setStatusTitle('Permission Needed');
        setStatusBody('No supported Health Connect permissions were granted.');
        setError('Open Settings or try again to allow at least one supported signal.');
      }
    } catch (permissionError) {
      const message = permissionError instanceof Error ? permissionError.message : 'health_connect_permission_failed';
      if (message.includes('unavailable')) {
        setStage('not_supported');
        setPendingInstall(true);
        setStatusTitle('Health Connect Needed');
        setStatusBody('Install or update Health Connect to continue recovery sync.');
      } else {
        setStage('permission_denied');
        setConnectionState('permission_missing');
        setStatusTitle('Permission Needed');
        setStatusBody('Health Connect permission could not be completed.');
      }
      setError(message);
    } finally {
      setIsRunning(false);
    }
  }, []);

  const runRecoveryConnection = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;

    if (Platform.OS !== 'android') {
      inFlightRef.current = false;
      if (isMountedRef.current) {
        setStage('not_supported');
        setConnectionState(null);
        setStatusTitle('Apple Health Reader Not Available');
        setStatusBody('This build supports Android Health Connect. Apple Health needs the native HealthKit reader before syncing.');
        setError('Supported now: Android Health Connect. Coming next: native Apple HealthKit reader.');
      }
      return;
    }
    if (typeof Platform.Version === 'number' && Platform.Version < 26) {
      if (isMountedRef.current) {
        setStage('not_supported');
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
      setStage('requesting_permission');
      setStatusTitle('Checking Recovery Connection');
      setStatusBody('Preparing secure access to your recovery signals.');
      setLastSyncAttemptISO(new Date().toISOString());
    }

    try {
      const sdkStatus = await withHealthConnectTimeout(getSdkStatus());
      if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        if (isMountedRef.current) {
          setStage('not_supported');
          setPendingInstall(true);
          setConnectionState(null);
          setStatusTitle('Health Connect Needed');
          setStatusBody('Health Connect helps securely sync your recovery signals.');
        }
        return;
      }

      if (isMountedRef.current) {
        setPendingInstall(false);
        setStage('syncing');
        setStatusTitle('Syncing Health Signals');
        setStatusBody('Reading sleep, activity, and heart recovery data securely from your device.');
      }

      const result = await withHealthConnectTimeout(runHealthSync('health-connect', wellness));
      addWearableSyncData(result.payload);
      setSelectedDeviceId('health-connect');
      setLastResult(result);

      const state = classifyRecoveryConnectionState(result.payload);
      if (isMountedRef.current) {
        setConnectionState(state);
        setStage(state === 'connected' ? 'completed' : state === 'partial' || state === 'calibrating' ? 'partial' : 'insufficient_data');
        setStatusTitle(stateCopy[state].title);
        setStatusBody(
          `${stateCopy[state].description} ${result.accepted} new records synced, ${result.duplicate} duplicates skipped.`
        );
      }

      const connectedMetrics = result.payload.dataQuality.connectedMetrics ?? {};
      const syncedCount = Object.values(connectedMetrics).filter((status) => status === 'synced').length;

      if (syncedCount > 0) {
        setWellness(result.wellness);
      }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'sync_failed';
      if (message.includes('health_connect_unavailable')) {
        if (isMountedRef.current) {
          setStage('not_supported');
          setStatusTitle('Health Connect Needed');
          setStatusBody('Install or update Health Connect to continue recovery sync.');
          setPendingInstall(true);
        }
      } else if (message.includes('health_connect_initialize_failed')) {
        if (isMountedRef.current) {
          setStage('failed');
          setStatusTitle('Recovery Connection Paused');
          setStatusBody('Recovery connection is temporarily unavailable. Please retry in a moment.');
        }
      } else if (message.includes('permission')) {
        if (isMountedRef.current) {
          setStage('permission_denied');
          setConnectionState('permission_missing');
          setStatusTitle('Permission Needed');
          setStatusBody('Open Health Connect permissions and allow at least one supported signal to sync.');
        }
      } else if (message.includes('INSUFFICIENT_DATA')) {
        if (isMountedRef.current) {
          setStage('insufficient_data');
          setConnectionState('no_recent_data');
          setStatusTitle('No Recent Recovery Signals');
          setStatusBody('Permissions are connected, but no recent Health Connect records were available to sync.');
        }
      } else {
        if (isMountedRef.current) {
          setStage('failed');
          setStatusTitle('Recovery Connection Paused');
          setStatusBody('Recovery connection is temporarily unavailable. Please try again or open Settings.');
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
  }, [addWearableSyncData, setSelectedDeviceId, setWellness, wellness]);

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
    navigation.navigate('OnboardingCalendar');
  };

  const metrics = lastResult?.payload.dataQuality.connectedMetrics;
  const completedDomains = domainRows.filter((domain) => summarizeDomain(domain, metrics, false) === 'Synced').map((domain) => domain.key);
  const missingDomains = domainRows.filter((domain) => summarizeDomain(domain, metrics, false) !== 'Synced').map((domain) => domain.key);
  const content = stageContent[stage];
  const canViewInsights = stage === 'completed' || stage === 'partial' || stage === 'insufficient_data';
  const primaryTitle =
    stage === 'intro'
      ? 'Continue'
      : stage === 'permission_explainer'
        ? 'Allow Health Access'
        : isRunning
          ? 'Syncing...'
          : pendingInstall
            ? 'Open Health Connect'
            : stage === 'connected_ready'
              ? 'Start First Sync'
              : stage === 'permission_denied'
                ? 'Try Again'
                : stage === 'failed'
                  ? 'Try Again'
                : canViewInsights
                  ? 'View Insights'
                  : 'Connect Health Data';

  const handlePrimary = () => {
    if (pendingInstall) {
      void openHealthConnectPlayStore();
      return;
    }
    if (stage === 'intro') {
      setStage('permission_explainer');
      return;
    }
    if (stage === 'permission_explainer') {
      void requestHealthPermission();
      return;
    }
    if (canViewInsights) {
      finishOnboardingFlow();
      return;
    }
    void runRecoveryConnection();
  };

  if (!wearableSetupCompleted) {
    return (
      <OnboardingShell
        phase="CONNECT"
        step={1}
        total={3}
        onBack={() => navigation.goBack()}
        action={<View><OnboardingAction title={primaryTitle === 'Continue' ? 'Connect Health Data' : primaryTitle} onPress={handlePrimary} disabled={isRunning} /><OnboardingAction title="Set up later" secondary onPress={skipForNow} /></View>}
      >
        <QuestionHeader title="Connect your health data" description="Fiteatsy can automatically understand your activity, sleep, heart and recovery patterns." />
        <View style={styles.onboardingDomains}>
          {domainRows.map((domain) => {
            const label = summarizeDomain(domain, metrics, isRunning);
            const isSynced = label === 'Synced';
            return <View key={domain.key} style={[styles.onboardingDomain, isSynced && styles.onboardingDomainSynced]}><View style={styles.domainLeft}><Ionicons name={domain.icon} size={20} color={isSynced ? colors.success : palette.textSecondary} /><Text style={[styles.domainTitle, { color: palette.textPrimary }]}>{domain.key}</Text></View><Text style={[styles.domainStatus, { color: isSynced ? colors.success : palette.textSecondary }]}>{label}</Text></View>;
          })}
        </View>
        <View style={styles.platformTruth}><Text style={[styles.supportText, { color: palette.textSecondary }]}>{Platform.OS === 'android' ? 'Android Health Connect · read-only access' : 'Apple Health is not available in this build · continue without connecting'}</Text></View>
        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}
      </OnboardingShell>
    );
  }

  return (
    <Screen scroll contentStyle={styles.screenContent}>
      <View style={styles.container}>
        <PageHeader title="Health Connect" onBack={() => navigation.goBack()} />
        <View style={[styles.heroCard, { borderColor: palette.stroke, backgroundColor: isLight ? '#FFFFFF' : palette.card }]}>
          <View style={[styles.heroIcon, { backgroundColor: isLight ? '#EAF8F5' : '#143532' }]}>
            <Ionicons name={stageIcon[stage]} size={26} color={isLight ? '#087B6C' : '#66FCF1'} />
          </View>
          <Text style={[styles.eyebrow, { color: isLight ? '#087B6C' : '#66FCF1' }]}>{content.eyebrow}</Text>
          <Text style={[styles.title, { color: palette.textPrimary }]}>{content.title}</Text>
          <Text style={[styles.subTitle, { color: palette.textSecondary }]}>{content.body}</Text>
        </View>

        <View style={[styles.infoCard, { borderColor: palette.stroke, backgroundColor: isLight ? '#F8FAFC' : palette.cardMuted }]}>
          <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>What Fiteatsy reads</Text>
          <Text style={[styles.supportText, { color: palette.textSecondary }]}>
            Read-only health signals from Health Connect compatible wellness apps including Samsung Health, Google Fit,
            NoiseFit, boAt Crest, Fitbit, and more.
          </Text>
        </View>

        <View style={[styles.statusCard, { borderColor: palette.stroke, backgroundColor: isLight ? '#FFFFFF' : palette.card }]}>
          <View style={styles.statusHeader}>
            {isRunning ? (
              <ActivityIndicator size="small" color={isLight ? '#087B6C' : '#66FCF1'} />
            ) : (
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
            )}
            <Text style={[styles.statusTitle, { color: palette.textPrimary }]}>{statusTitle}</Text>
          </View>
          <Text style={[styles.statusBody, { color: palette.textSecondary }]}>{statusBody}</Text>
          {lastSyncAttemptISO ? (
            <Text style={[styles.supportText, { color: palette.textSecondary }]}>Last sync attempt: {formatSyncTime(lastSyncAttemptISO)}</Text>
          ) : null}
          {error ? <Text style={[styles.errorText, { color: isLight ? '#B42318' : colors.danger }]}>{error}</Text> : null}
        </View>

        <View style={[styles.statusCard, { borderColor: palette.stroke, backgroundColor: isLight ? '#FFFFFF' : palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Sync domains</Text>
          {domainRows.map((domain) => {
            const label = summarizeDomain(domain, metrics, isRunning);
            const isSynced = label === 'Synced';
            return (
              <View key={domain.key} style={[styles.domainRow, { borderColor: palette.stroke }]}>
                <View style={styles.domainLeft}>
                  <Ionicons name={domain.icon} size={18} color={isSynced ? colors.success : palette.textSecondary} />
                  <Text style={[styles.domainTitle, { color: palette.textPrimary }]}>{domain.key}</Text>
                </View>
                <Text style={[styles.domainStatus, { color: isSynced ? colors.success : palette.textSecondary }]}>{label}</Text>
              </View>
            );
          })}
        </View>

        {stage === 'partial' ? (
          <View style={[styles.guidanceCard, { borderColor: palette.warning, backgroundColor: isLight ? '#FFF8E6' : '#2B2414' }]}>
            <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Partial data guidance</Text>
            <Text style={[styles.statusBody, { color: palette.textPrimary }]}>Found: {completedDomains.join(', ') || 'None yet'}</Text>
            <Text style={[styles.statusBody, { color: palette.textPrimary }]}>Missing: {missingDomains.join(', ') || 'None'}</Text>
          </View>
        ) : null}

        {stage === 'permission_denied' || stage === 'failed' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open device settings for health permissions"
            style={[styles.secondaryButton, { borderColor: palette.stroke }]}
            onPress={() => void Linking.openSettings()}
          >
            <Text style={[styles.secondaryButtonText, { color: palette.textPrimary }]}>Open Settings</Text>
          </Pressable>
        ) : null}

        <PrimaryButton
          title={primaryTitle}
          onPress={handlePrimary}
          disabled={isRunning}
        />

        <Pressable style={styles.skipInline} onPress={skipForNow}>
          <Text style={[styles.skipInlineText, { color: palette.textSecondary }]}>
            {canViewInsights ? 'Finish without more sync' : 'Skip for now'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16
  },
  screenContent: {
    paddingBottom: 28
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eyebrow: {
    ...typography.caption,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  title: {
    ...typography.sectionTitle
  },
  subTitle: {
    ...typography.body,
    fontSize: 14
  },
  supportText: {
    ...typography.caption,
    fontSize: 12
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: 6
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
  sectionTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  domainRow: {
    borderTopWidth: 1,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  domainLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  domainTitle: {
    ...typography.bodyStrong,
    fontSize: 13
  },
  domainStatus: {
    ...typography.caption,
    fontSize: 12
  },
  guidanceCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: 6
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 13,
    alignItems: 'center'
  },
  secondaryButtonText: {
    ...typography.bodyStrong,
    fontSize: 14
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
  },
  onboardingDomains: { gap: spacing.sm },
  onboardingDomain: { minHeight: 64, borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.lg, backgroundColor: colors.cardMuted, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  onboardingDomainSynced: { borderColor: colors.success, backgroundColor: 'rgba(73,223,134,0.08)' },
  platformTruth: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.blue, borderRadius: radius.lg, padding: spacing.md, backgroundColor: 'rgba(53,215,210,0.06)' }
});
