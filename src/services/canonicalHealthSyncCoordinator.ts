import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAppContext } from '../state/AppContext';
import type { HealthObservationDraft } from '../types';
import { HEALTH_METRIC_REGISTRY, type HealthMetricDefinition } from './healthMetricRegistry';
import { getHealthPlatformAdapter, type HealthProviderState } from './healthPlatformAdapter';
import { deriveHealthProviderState, providerStatusCopy, type HealthMetricQueryState, type HealthUploadState } from './healthSyncState';
import {
  getHealthSyncActivity,
  getHealthSyncStatus,
  getLatestHealthObservations,
  type HealthObservationDto,
  type HealthSyncActivity,
  type HealthSyncResult,
  type HealthSyncStatus,
  HealthSyncPostUploadRefreshError,
  HealthSyncUploadPendingError,
  runHealthSync,
  wellnessFromCanonicalAggregates
} from './healthSyncManager';
import { getHealthIntelligenceV1, type HealthIntelligenceV1, type HealthScoreSummary } from './healthIntelligenceService';
import { countPendingLocalObservations, getOrCreateHealthInstallationId, markLocalHealthProviderConnected,
  migrateLegacyHealthInstallationId, readLocalHealthObservations, readLocalHealthPresentationObservations,
  readLocalHealthProviderConnected, readLocalCanonicalHealthSnapshot, persistLocalCanonicalHealthSnapshot,
  readLocalHealthAggregates,readLocalHealthLifecycle,ensureLocalHealthAggregatesCurrent,type HealthSyncLifecycleTimestamps } from './healthSyncLocalStore';
import type {CanonicalDailyAggregate} from '@fiteatsy/health-intelligence';
import { buildPresentedHealthObservations } from './healthMetricPresentation';
import { calculateCanonicalHealthIntelligenceFromAggregates, hasCalculatedCanonicalScore,
  markCanonicalSnapshotStale, type LocalCanonicalHealthSnapshot } from './localHealthIntelligence';
import { unregisterWearableBackgroundSync } from './wearableBackgroundSync';
import { acceptWearableConsent, reconcileWearableConnection, type GovernedProvider } from './wearablePlatformService';
import { traceSessionLifecycle } from './sessionLifecycleTrace';
import { traceRuntimePerformance } from './runtimePerformanceTrace';

export type { HealthObservationDto } from './healthSyncManager';


export type CanonicalHealthMetricState = {
  definition: HealthMetricDefinition;
  sourcePlatform: GovernedProvider;
  supported: boolean;
  queryState: HealthMetricQueryState;
  observation: HealthObservationDto | null;
  localRecordCount: number;
  uploadState: HealthUploadState;
  errorClass: string | null;
};

const toDto = (item: HealthObservationDraft, clientId: string, index: number): HealthObservationDto => ({
  ...item,
  id: `local:${item.syncKey ?? item.sourceRecordId ?? index}`,
  fiteatsyClientId: clientId,
  createdAtISO: new Date().toISOString()
});

const serverSnapshot = (value: HealthIntelligenceV1): LocalCanonicalHealthSnapshot => ({
  calculationVersion: value.calculationVersion,
  calculatedAt: value.latestCalculationAt,
  inputWindow: { startAtISO: null, endAtISO: value.latestSourceReadAt },
  inputFreshness: value.scores.healthIntelligence.freshness,
  source: 'CACHED_CANONICAL_SERVER',
  scores: value.scores
});

export const countAvailableHealthMetrics = (metrics: CanonicalHealthMetricState[]) =>
  metrics.filter((metric) => metric.queryState === 'DATA_AVAILABLE').length;

/**
 * A completed read is distinct from a metric with a visible value. HealthKit
 * legitimately returns no data for an authorised type, and that must not
 * leave the UI reporting a fictitious pending task.
 */
export const countTerminalHealthMetricReads = (metrics: CanonicalHealthMetricState[]) =>
  metrics.filter((metric) => metric.supported && metric.queryState !== 'IDLE' && metric.queryState !== 'QUERYING').length;

const useCreateCanonicalHealthSyncCoordinator = () => {
  const { authSession, bootstrapped, wellness, onboarding, setWellness, setSelectedDeviceId } = useAppContext();
  const adapter = useMemo(() => getHealthPlatformAdapter(), []);
  const sourceName = adapter.platform === 'APPLE_HEALTH' ? 'Apple Health' : 'Health Connect';
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const awaitingPermissionReturn = useRef(false);
  const connectionIdOverride = useRef<string | null>(null);
  const [providerState, setProviderState] = useState<HealthProviderState>('AVAILABLE');
  const [uploadState, setUploadState] = useState<HealthUploadState>('IDLE');
  const [status, setStatus] = useState<HealthSyncStatus | null>(null);
  const [observations, setObservations] = useState<HealthObservationDto[]>([]);
  const [presentationObservations, setPresentationObservations] = useState<HealthObservationDto[]>([]);
  const [activity, setActivity] = useState<HealthSyncActivity[]>([]);
  const [queryStates, setQueryStates] = useState<Record<string, HealthMetricQueryState>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<HealthSyncResult['diagnostics']>([]);
  const [localHydrated, setLocalHydrated] = useState(false);
  const [localProviderConnected, setLocalProviderConnected] = useState(false);
  const [pendingUploadCount, setPendingUploadCount] = useState(0);
  const [canonicalIntelligence, setCanonicalIntelligence] = useState<LocalCanonicalHealthSnapshot | null>(null);
  const [aggregates,setAggregates]=useState<CanonicalDailyAggregate[]>([]);
  const [lifecycle,setLifecycle]=useState<HealthSyncLifecycleTimestamps>({lastHealthReadAtISO:null,lastSavedAtISO:null,lastUploadedAtISO:null,lastFullySyncedAtISO:null});
  const localScope = useMemo(() => authSession
    ? `account:${authSession.accountId}:${adapter.appId}`
    : null, [adapter.appId, authSession]);

  useEffect(() => {
    if (!localHydrated) return;
    // Earlier builds may have scheduled a full background read. Remove that
    // registration once after local restore: a separate JS context cannot
    // share this coordinator's foreground single-flight lock.
    void unregisterWearableBackgroundSync().catch(() => undefined);
  }, [localHydrated]);

  const mergeLocalObservations = useCallback((items: HealthObservationDraft[]) => {
    const deletedIds = new Set(items.filter((item) => item.deleted).map((item) => item.sourceRecordId).filter(Boolean));
    const local = items.filter((item) => !item.deleted).map((item, index) => toDto(item, status?.fiteatsyClientId ?? 'local', index));
    setObservations((current) => {
      const byIdentity = new Map(current
        .filter((item) => !item.sourceRecordId || !deletedIds.has(item.sourceRecordId))
        .map((item) => [item.syncKey ?? item.id, item]));
      local.forEach((item) => byIdentity.set(item.syncKey ?? item.id, item));
      return [...byIdentity.values()];
    });
  }, [status?.fiteatsyClientId]);

  const refreshRemoteSnapshot = useCallback(async () => {
    const locallyAvailable = await adapter.isAvailable().catch(() => false);
    const refreshStartedAt = Date.now();
    traceRuntimePerformance('HEALTH_UI_REFRESH_START');
    try {
      const [nextStatus, nextObservations, nextActivity, nextIntelligence] = await Promise.all([
        getHealthSyncStatus(), getLatestHealthObservations(200), getHealthSyncActivity(8), getHealthIntelligenceV1()
      ]);
      if (!mounted.current) return;
      setStatus(nextStatus);
      setProviderState(deriveHealthProviderState(nextStatus, adapter.platform, locallyAvailable));
      setObservations((current) => {
        const byIdentity = new Map(current.map((item) => [item.syncKey ?? item.id, item]));
        nextObservations.items.forEach((item) => byIdentity.set(item.syncKey ?? item.id, item));
        return [...byIdentity.values()];
      });
      setActivity(nextActivity.items);
      const snapshot = serverSnapshot(nextIntelligence);
      setCanonicalIntelligence(snapshot);
      if (localScope) await persistLocalCanonicalHealthSnapshot(localScope, snapshot);
    } catch {
      // Backend availability is not provider availability. Local reads stay usable.
      if (mounted.current) setProviderState((current) => current === 'CONNECTED' ? current : locallyAvailable ? 'AVAILABLE' : 'UNAVAILABLE');
    } finally {
      traceRuntimePerformance('HEALTH_UI_REFRESH_END', { durationMs: Date.now() - refreshStartedAt });
    }
  }, [adapter, localScope]);

  /**
   * The only foreground callers are the provider CTA, its explicit retry, and
   * the initial connection flow.  In particular, hydration, AppState,
   * NetInfo, navigation and HealthKit observer notifications must never turn
   * into an unrequested full native read.
   */
  const syncLocalMetrics = useCallback(async (options: { forceSourceBackfill?: boolean; trigger?: 'USER_CTA' | 'INITIAL_CONNECT' | 'RETRY' } = {}) => {
    if (!authSession || !localScope) return;
    if (inFlight.current) return;
    inFlight.current = true;
    const syncStartedAt = Date.now();
    traceRuntimePerformance('HEALTH_CTA_TAP', { trigger: options.trigger ?? 'USER_CTA' });
    traceRuntimePerformance('HEALTH_SYNC_START', {
      trigger: options.trigger ?? 'USER_CTA'
    });
    traceSessionLifecycle('HEALTH_SYNC_START', { trigger: options.trigger ?? 'USER_CTA' });
    setUploadState('UPLOADING');
    setMessage(`Reading ${sourceName}…`);
    setQueryStates(Object.fromEntries(adapter.getSupportedMetricRegistry().map((key) => [key, 'QUERYING'])));
    const connection = adapter.platform === 'APPLE_HEALTH' ? status?.appleHealth : status?.healthConnect;
    const connectionId = connectionIdOverride.current ?? connection?.connectionId ?? null;
    try {
      const result = await runHealthSync(adapter.appId, wellness, connectionId ? {
        connectionId,
        provider: adapter.platform,
        trigger: 'MANUAL',
        localScope
      } : undefined, { ...options, localScope });
      if (!mounted.current) return;
      mergeLocalObservations(result.observations);
      setPresentationObservations((result.payload.presentationObservations ?? [])
        .map((item,index)=>toDto(item,status?.fiteatsyClientId ?? 'local',index)));
      setSelectedDeviceId(adapter.appId);
      setWellness(result.wellness);
      setPendingUploadCount(await countPendingLocalObservations(localScope));
      setAggregates(await readLocalHealthAggregates(localScope));
      setLifecycle(await readLocalHealthLifecycle(localScope));
      setDiagnostics(result.diagnostics);
      setProviderState('CONNECTED');
      setLocalProviderConnected(true);
      await markLocalHealthProviderConnected(localScope);
      setUploadState(result.rejected > 0 ? 'ERROR' : 'SYNCED');
      const nextQueries: Record<string, HealthMetricQueryState> = {};
      const nextErrors: Record<string, string | null> = {};
      HEALTH_METRIC_REGISTRY.forEach((definition) => {
        const nativeKey = adapter.platform === 'APPLE_HEALTH' ? definition.appleHealthType : definition.healthConnectRecord;
        if (!nativeKey) return;
        const diagnostic = result.diagnostics.find((item) => item.metricKey === nativeKey);
        const hasData = result.observations.some((item) => !item.deleted && item.metricType === definition.backendCanonicalType);
        nextQueries[definition.metricKey] = hasData ? 'DATA_AVAILABLE'
          : diagnostic?.localQueryState === 'TIMEOUT' ? 'TIMEOUT'
          : diagnostic?.localQueryState === 'ERROR' ? 'ERROR' : 'NO_VISIBLE_DATA';
        nextErrors[definition.metricKey] = nextQueries[definition.metricKey] === 'ERROR' ? 'NATIVE_ERROR'
          : nextQueries[definition.metricKey] === 'TIMEOUT' ? 'TIMEOUT' : null;
      });
      setQueryStates(nextQueries);
      setErrors(nextErrors);
      const count = result.observations.filter((item) => !item.deleted).length;
      setMessage(count ? `${count} local records available` : `No visible ${sourceName} data found in the requested date ranges.`);
      void refreshRemoteSnapshot();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof HealthSyncUploadPendingError || error instanceof HealthSyncPostUploadRefreshError) {
        mergeLocalObservations(error.observations);
        setPresentationObservations((error.payload.presentationObservations ?? [])
          .map((item,index)=>toDto(item,status?.fiteatsyClientId ?? 'local',index)));
        setSelectedDeviceId(adapter.appId);
        const currentAggregates=await readLocalHealthAggregates(localScope);
        setWellness((current) => wellnessFromCanonicalAggregates(current,currentAggregates,{} as HealthScoreSummary));
        setPendingUploadCount(await countPendingLocalObservations(localScope));
        setAggregates(await readLocalHealthAggregates(localScope));
        setLifecycle(await readLocalHealthLifecycle(localScope));
        setDiagnostics(error.diagnostics);
        setProviderState('CONNECTED');
        setLocalProviderConnected(true);
        await markLocalHealthProviderConnected(localScope);
        setUploadState(error instanceof HealthSyncPostUploadRefreshError ? 'SYNCED' : 'PENDING');
        const locallyAvailableTypes = new Set(error.observations
          .filter((item) => !item.deleted)
          .map((item) => item.metricType));
        setQueryStates(Object.fromEntries(HEALTH_METRIC_REGISTRY.map((definition) => [
          definition.metricKey,
          locallyAvailableTypes.has(definition.backendCanonicalType) ? 'DATA_AVAILABLE' : 'NO_VISIBLE_DATA'
        ])));
        setMessage(error instanceof HealthSyncPostUploadRefreshError
          ? `${sourceName} data was uploaded. Account status will refresh automatically.`
          : `${sourceName} data is available locally. Upload is pending.`);
      } else {
        const available = await adapter.isAvailable().catch(() => false);
        setProviderState(available ? 'ERROR' : 'UNAVAILABLE');
        setUploadState('ERROR');
        setQueryStates((current) => Object.fromEntries(Object.entries(current).map(([key, state]) => [key,
          state === 'QUERYING' ? 'ERROR' : state])));
        setMessage('Health data could not be read. Previous local data is safe.');
      }
    } finally {
      traceRuntimePerformance('HEALTH_SYNC_END', { durationMs: Date.now() - syncStartedAt });
      inFlight.current = false;
    }
  }, [adapter, authSession, localScope, mergeLocalObservations, refreshRemoteSnapshot, setSelectedDeviceId, setWellness, sourceName, status, wellness]);

  const requestAccess = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setMessage(`Requesting ${sourceName} access…`);
    let access;
    try {
      // Native permission must remain available without a network connection.
      access = await adapter.requestAccess();
      setProviderState('CONNECTED');
      if (localScope) {
        setLocalProviderConnected(true);
        await markLocalHealthProviderConnected(localScope);
      }
    } catch {
      setProviderState('ACTION_REQUIRED');
      setMessage(`${sourceName} access requires your attention.`);
      inFlight.current = false;
      return;
    }
    try {
      const requested = [...adapter.getSupportedMetricRegistry()];
      await acceptWearableConsent(adapter.platform, requested);
      const installationId = await migrateLegacyHealthInstallationId().catch(getOrCreateHealthInstallationId);
      const connection = await reconcileWearableConnection({
        provider: adapter.platform,
        platform: adapter.platform === 'APPLE_HEALTH' ? 'IOS' : 'ANDROID',
        installationId,
        status: access.grantedScopes.length ? 'PARTIAL' : 'PERMISSION_REQUIRED',
        grantedScopes: adapter.platform === 'APPLE_HEALTH' ? [] : access.grantedScopes,
        backgroundSyncEnabled: access.grantedScopes.length > 0
      });
      connectionIdOverride.current = connection.id;
      // Full background reads are deliberately not registered here. They can
      // run in a separate JS context and cannot share the foreground
      // single-flight lock. The foreground CTA remains the authoritative full
      // sync trigger until a cross-process lock is explicitly governed.
      await unregisterWearableBackgroundSync();
    } catch {
      setUploadState('PENDING');
      setMessage(`${sourceName} access is ready. Account sync will resume when the connection returns.`);
    }
    inFlight.current = false;
    await syncLocalMetrics({ forceSourceBackfill: true, trigger: 'INITIAL_CONNECT' });
  }, [adapter, localScope, sourceName, syncLocalMetrics]);

  const markPermissionReviewStarted = useCallback(() => {
    awaitingPermissionReturn.current = true;
  }, []);

  useEffect(() => {
    mounted.current = true;
    traceRuntimePerformance('HEALTH_COORDINATOR_MOUNT');
    void migrateLegacyHealthInstallationId();
    void refreshRemoteSnapshot();
    return () => { mounted.current = false; };
  }, [refreshRemoteSnapshot]);

  useEffect(() => {
    connectionIdOverride.current = null;
    setObservations([]);
    setPresentationObservations([]);
    setQueryStates({});
    setErrors({});
    setPendingUploadCount(0);
    setCanonicalIntelligence(null);
    setAggregates([]);
    setLocalProviderConnected(false);
    setLocalHydrated(false);
    if (!bootstrapped || !localScope) return;
    let active = true;
    Promise.all([readLocalHealthObservations(localScope), readLocalHealthPresentationObservations(localScope),
      countPendingLocalObservations(localScope),
      readLocalHealthProviderConnected(localScope), readLocalCanonicalHealthSnapshot(localScope),readLocalHealthAggregates(localScope),readLocalHealthLifecycle(localScope)])
      .then(async([cached, cachedPresentation, pending, connected, cachedIntelligence,cachedAggregates,cachedLifecycle]) => {
        if (!active || !mounted.current) return;
        mergeLocalObservations(cached);
        setPresentationObservations(cachedPresentation.map((item, index) =>
          toDto(item, authSession?.client.fiteatsyClientId ?? 'local', index)));
        setPendingUploadCount(pending);
        setLocalProviderConnected(connected || cached.length > 0);
        if (connected || cached.length > 0) setProviderState('CONNECTED');
        if (cachedIntelligence) setCanonicalIntelligence(markCanonicalSnapshotStale(cachedIntelligence));
        const currentAggregates=await ensureLocalHealthAggregatesCurrent(localScope,-new Date().getTimezoneOffset());
        if(!active||!mounted.current)return;setAggregates(currentAggregates.length?currentAggregates:cachedAggregates);setLifecycle(cachedLifecycle);
        setLocalHydrated(true);
      })
      .catch(() => { if (active && mounted.current) setLocalHydrated(true); });
    return () => { active = false; };
  }, [authSession?.client.fiteatsyClientId, bootstrapped, localScope, mergeLocalObservations]);

  useEffect(() => {
    if (!localHydrated || !localScope) return;
    const calculated = calculateCanonicalHealthIntelligenceFromAggregates(aggregates, {
      sleepTargetMinutes: onboarding?.sleepGoalHours == null ? null : onboarding.sleepGoalHours * 60,
      cycleApplicable: onboarding?.gender === 'Female'
    });
    setCanonicalIntelligence((current) => {
      if (current && hasCalculatedCanonicalScore(current) && !hasCalculatedCanonicalScore(calculated)) return current;
      void persistLocalCanonicalHealthSnapshot(localScope, calculated);
      return calculated;
    });
  }, [aggregates, localHydrated, localScope, onboarding?.gender, onboarding?.sleepGoalHours]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        traceRuntimePerformance('APP_BACKGROUND');
        return;
      }
      traceRuntimePerformance('APP_FOREGROUND');
      if (!awaitingPermissionReturn.current) return;
      awaitingPermissionReturn.current = false;
      // Returning from the system permission screen refreshes connection
      // status only. It must not unexpectedly start a complete native read.
      void refreshRemoteSnapshot();
    });
    return () => subscription.remove();
  }, [refreshRemoteSnapshot]);

  const latestByMetric = useMemo(() => buildPresentedHealthObservations(observations,presentationObservations),
    [observations,presentationObservations]);

  const metrics = useMemo<CanonicalHealthMetricState[]>(() => HEALTH_METRIC_REGISTRY.map((definition) => {
    const supported = adapter.platform === 'APPLE_HEALTH' ? Boolean(definition.appleHealthType) : Boolean(definition.healthConnectRecord);
    const observation = latestByMetric.get(definition.backendCanonicalType) ?? null;
    return {
      definition,
      sourcePlatform: adapter.platform,
      supported,
      queryState: observation ? 'DATA_AVAILABLE' : (queryStates[definition.metricKey] ?? 'IDLE'),
      observation,
      localRecordCount: observations.filter((item) => item.metricType === definition.backendCanonicalType).length,
      uploadState,
      errorClass: errors[definition.metricKey] ?? null
    };
  }), [adapter.platform, errors, latestByMetric, observations, queryStates, uploadState]);

  const platformStatus = adapter.platform === 'APPLE_HEALTH' ? status?.appleHealth : status?.healthConnect;
  return {
    providerState,
    providerLabel: providerStatusCopy(providerState),
    sourceName,
    platform: adapter.platform,
    metrics,
    availableMetricCount: countAvailableHealthMetrics(metrics),
    terminalMetricReadCount: countTerminalHealthMetricReads(metrics),
    supportedMetricReadCount: metrics.filter((metric) => metric.supported).length,
    uploadState,
    status,
    observations,
    aggregates,
    lifecycle,
    platformStatus,
    activity,
    message,
    diagnostics,
    canonicalIntelligence,
    localHydrated,
    pendingUploadCount,
    syncLocalMetrics,
    requestAccess,
    markPermissionReviewStarted
  };
};

export type CanonicalHealthSyncSnapshot = ReturnType<typeof useCreateCanonicalHealthSyncCoordinator>;
const CanonicalHealthSyncContext = createContext<CanonicalHealthSyncSnapshot | null>(null);

export const CanonicalHealthSyncProvider = ({ children }: { children: React.ReactNode }) => {
  const value = useCreateCanonicalHealthSyncCoordinator();
  return React.createElement(CanonicalHealthSyncContext.Provider, { value }, children);
};

export const useCanonicalHealthSyncCoordinator = () => {
  const value = useContext(CanonicalHealthSyncContext);
  if (!value) throw new Error('useCanonicalHealthSyncCoordinator must be used inside CanonicalHealthSyncProvider');
  return value;
};
