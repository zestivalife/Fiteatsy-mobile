import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
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
import { getProductionStarOrb, getHealthIntelligenceV1, type CandidateStarOrbValidation, type FrameworkScore, type HealthIntelligenceV1, type HealthScoreSummary } from './healthIntelligenceService';
import { countPendingLocalObservations, getOrCreateHealthInstallationId, markLocalHealthProviderConnected,
  migrateLegacyHealthInstallationId, readLocalHealthBootstrapSnapshot,
  performApprovedStaleHealthQueueCleanup,
  persistLocalCanonicalHealthSnapshot,
  readLocalHealthAggregates, readLocalHealthLifecycle, readLocalHealthPresentationObservations,
  type HealthSyncLifecycleTimestamps } from './healthSyncLocalStore';
import type {CanonicalDailyAggregate} from '@fiteatsy/health-intelligence';
import { buildPresentedHealthObservations, mergeHealthPresentationObservations } from './healthMetricPresentation';
import { calculateCanonicalHealthIntelligenceFromAggregates, hasCalculatedCanonicalScore,
  markCanonicalSnapshotStale, preferCanonicalHealthSnapshot, type LocalCanonicalHealthSnapshot } from './localHealthIntelligence';
import { registerWearableBackgroundSync } from './wearableBackgroundSync';
import { acceptWearableConsent, reconcileWearableConnection, type GovernedProvider } from './wearablePlatformService';
import { traceSessionLifecycle } from './sessionLifecycleTrace';
import { buildHealthSourceDiagnostics } from './healthSourceDiagnostics';
import { ApiClientError } from './apiClient';

export type { HealthObservationDto } from './healthSyncManager';

export type HomeHealthRefreshEndpoint =
  | 'syncStatus'
  | 'latestObservations'
  | 'syncActivity'
  | 'canonicalIntelligence'
  | 'starOrb';
type HomeHealthRefreshRequests = {
  syncStatus: () => Promise<HealthSyncStatus>;
  latestObservations: () => Promise<Awaited<ReturnType<typeof getLatestHealthObservations>>>;
  syncActivity: () => Promise<Awaited<ReturnType<typeof getHealthSyncActivity>>>;
  canonicalIntelligence: () => Promise<HealthIntelligenceV1>;
  starOrb: () => Promise<CandidateStarOrbValidation>;
};
type HomeHealthRefreshHandlers = {
  syncStatus: (value: HealthSyncStatus) => void | Promise<void>;
  latestObservations: (value: Awaited<ReturnType<typeof getLatestHealthObservations>>) => void | Promise<void>;
  syncActivity: (value: Awaited<ReturnType<typeof getHealthSyncActivity>>) => void | Promise<void>;
  canonicalIntelligence: (value: HealthIntelligenceV1) => void | Promise<void>;
  starOrb: (value: CandidateStarOrbValidation) => void | Promise<void>;
};
type HomeHealthRefreshResult =
  | { endpoint: HomeHealthRefreshEndpoint; status: 'fulfilled' }
  | { endpoint: HomeHealthRefreshEndpoint; status: 'rejected'; reason: unknown };

const homeRefreshFailureDetails = (error: unknown) => ({
  status: error instanceof ApiClientError ? error.status ?? null : null,
  errorCategory: error instanceof ApiClientError ? error.code : error instanceof Error ? error.name : 'UNKNOWN'
});

export const refreshHomeHealthResponses = async (
  requests: HomeHealthRefreshRequests,
  handlers: HomeHealthRefreshHandlers
) => {
  const execute = <K extends HomeHealthRefreshEndpoint>(endpoint: K): Promise<HomeHealthRefreshResult> =>
    requests[endpoint]().then(async (value) => {
      await (handlers[endpoint] as (resolved: typeof value) => void | Promise<void>)(value);
      return { endpoint, status: 'fulfilled' as const };
    }).catch((reason: unknown) => ({ endpoint, status: 'rejected' as const, reason }));
  const results = await Promise.all((Object.keys(requests) as HomeHealthRefreshEndpoint[]).map(execute));
  const starOrbSucceeded = results.some((result) => result.endpoint === 'starOrb' && result.status === 'fulfilled');
  results.forEach((result) => {
    if (result.status === 'fulfilled') return;
    console.warn('[HomeHealthRefresh] request failed; preserving last valid endpoint state', {
      endpoint: result.endpoint,
      ...homeRefreshFailureDetails(result.reason),
      starOrbSucceeded
    });
  });
  return results;
};


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

const candidateFrameworkScore=(score:CandidateStarOrbValidation['days'][number]['activity']):Omit<FrameworkScore,'calculationVersion'>&{calculationVersion:string}=>({
  key:score.domain,score:score.score,status:score.status,confidence:score.confidence,trend:null,componentCoverage:score.componentCoverage,
  inputsUsed:score.inputsUsed,inputsMissing:score.inputsMissing,inputsNotApplicable:[],methodologyPending:[],
  contributingFactors:score.contributingFactors,recommendedActions:[],explanation:score.explanation,
  freshness:score.inputFreshness==='STALE'?'STALE':score.inputFreshness==='CURRENT'?'CURRENT':'UNKNOWN',
  calculationVersion:score.methodologyVersion,calculatedAt:score.calculatedAt
});

export const candidateResponseToHomeSnapshot=(value:CandidateStarOrbValidation)=>{
  const current=value.days.at(-1);if(!current)return null;
  const recovery=candidateFrameworkScore(current.recovery);
  return {methodologyVersion:value.methodologyVersion,activation:value.activation,sourceCoverage:value.sourceCoverage,
    scores:{activity:candidateFrameworkScore(current.activity),sleep:candidateFrameworkScore(current.sleep),nutrition:candidateFrameworkScore(current.nourishment),calm:candidateFrameworkScore(current.calm),mind:candidateFrameworkScore(current.mind),recovery},
    recoveryTrend:value.days.map(day=>({dayKey:day.healthDay,score:day.recovery.score}))};
};

export const countAvailableHealthMetrics = (metrics: CanonicalHealthMetricState[]) =>
  metrics.filter((metric) => metric.queryState === 'DATA_AVAILABLE').length;

const useCreateCanonicalHealthSyncCoordinator = () => {
  const { authSession, bootstrapped, wellness, onboarding, setWellness, setSelectedDeviceId } = useAppContext();
  const adapter = useMemo(() => getHealthPlatformAdapter(), []);
  const sourceName = adapter.platform === 'APPLE_HEALTH' ? 'Apple Health' : 'Health Connect';
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const refreshQueued = useRef(false);
  const queuedSyncOptions = useRef<{ forceSourceBackfill?: boolean; liveOnly?: boolean }>({});
  const awaitingPermissionReturn = useRef(false);
  const foregroundRefreshAt = useRef(0);
  const syncGeneration = useRef(0);
  const automaticallySyncedScope = useRef<string|null>(null);
  const forceBackfill = useRef(false);
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
  const [pendingUploadCount, setPendingUploadCount] = useState(0);
  const [canonicalIntelligence, setCanonicalIntelligence] = useState<LocalCanonicalHealthSnapshot | null>(null);
  const [candidateIntelligence,setCandidateIntelligence]=useState<ReturnType<typeof candidateResponseToHomeSnapshot>>(null);
  const [aggregates,setAggregates]=useState<CanonicalDailyAggregate[]>([]);
  const [lifecycle,setLifecycle]=useState<HealthSyncLifecycleTimestamps>({lastHealthReadAtISO:null,lastSavedAtISO:null,lastUploadedAtISO:null,lastFullySyncedAtISO:null});
  const localScope = useMemo(() => authSession
    ? `account:${authSession.accountId}:${adapter.appId}`
    : null, [adapter.appId, authSession]);

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

  const mergePresentationObservations = useCallback((items: HealthObservationDraft[]) => {
    const local = items.map((item, index) => toDto(item, status?.fiteatsyClientId ?? 'local', index));
    setPresentationObservations((current) => mergeHealthPresentationObservations(current, local));
  }, [status?.fiteatsyClientId]);

  const refreshRemoteSnapshot = useCallback(async () => {
    const locallyAvailable = await adapter.isAvailable().catch(() => false);
    const results = await refreshHomeHealthResponses({
      syncStatus: getHealthSyncStatus,
      latestObservations: () => getLatestHealthObservations(200),
      syncActivity: () => getHealthSyncActivity(8),
      canonicalIntelligence: getHealthIntelligenceV1,
      starOrb: getProductionStarOrb
    }, {
      syncStatus: (nextStatus) => {
        if (!mounted.current) return;
        setStatus(nextStatus);
        setProviderState(deriveHealthProviderState(nextStatus, adapter.platform, locallyAvailable));
      },
      latestObservations: (nextObservations) => {
        if (!mounted.current) return;
        setObservations((current) => {
          const byIdentity = new Map(current.map((item) => [item.syncKey ?? item.id, item]));
          nextObservations.items.forEach((item) => byIdentity.set(item.syncKey ?? item.id, item));
          return [...byIdentity.values()];
        });
      },
      syncActivity: (nextActivity) => { if (mounted.current) setActivity(nextActivity.items); },
      canonicalIntelligence: async (nextIntelligence) => {
        if (!mounted.current) return;
        const snapshot = serverSnapshot(nextIntelligence);
        setCanonicalIntelligence((current) => preferCanonicalHealthSnapshot(current, snapshot));
        if (localScope) await persistLocalCanonicalHealthSnapshot(localScope, snapshot);
      },
      starOrb: (nextCandidate) => {
        if (mounted.current) setCandidateIntelligence(candidateResponseToHomeSnapshot(nextCandidate));
      }
    });
    if (!mounted.current) return;
    const statusFailed = results.some((result) => result.endpoint === 'syncStatus' && result.status === 'rejected');
    if (statusFailed) setProviderState((current) => current === 'CONNECTED'
      ? current
      : locallyAvailable ? 'AVAILABLE' : 'UNAVAILABLE');
  }, [adapter, localScope]);

  const syncLocalMetrics = useCallback(async (options: { forceSourceBackfill?: boolean; liveOnly?: boolean } = {}) => {
    if (!authSession || !localScope) return;
    const requestedGeneration=++syncGeneration.current;
    if (inFlight.current) {
      refreshQueued.current = true;
      queuedSyncOptions.current = {
        forceSourceBackfill: queuedSyncOptions.current.forceSourceBackfill || options.forceSourceBackfill,
        liveOnly: queuedSyncOptions.current.liveOnly || options.liveOnly
      };
      return;
    }
    inFlight.current = true;
    const activeGeneration=requestedGeneration;
    traceSessionLifecycle('HEALTH_SYNC_START', { trigger: options.forceSourceBackfill ? 'BACKFILL' : 'AUTOMATIC_OR_MANUAL' });
    setUploadState('UPLOADING');
    setMessage(`Reading ${sourceName}…`);
    setQueryStates(Object.fromEntries(adapter.getSupportedMetricRegistry().map((key) => [key, 'QUERYING'])));
    const connection = adapter.platform === 'APPLE_HEALTH' ? status?.appleHealth : status?.healthConnect;
    const connectionId = connectionIdOverride.current ?? connection?.connectionId ?? null;
    try {
      const applyLocalCompletion = async (localResult: {
        payload: Awaited<ReturnType<typeof adapter.queryAllSupportedMetrics>>;
        observations: HealthObservationDraft[];
        aggregates: CanonicalDailyAggregate[];
      }) => {
        if (!mounted.current||activeGeneration!==syncGeneration.current) return;
        mergeLocalObservations(localResult.observations);
        mergePresentationObservations(localResult.payload.presentationObservations ?? []);
        setAggregates(localResult.aggregates);
        setLifecycle(await readLocalHealthLifecycle(localScope));
        const localDiagnostics = buildHealthSourceDiagnostics(adapter.platform, localResult.payload, { state: 'PENDING' });
        setDiagnostics(localDiagnostics);
        const nextQueries: Record<string, HealthMetricQueryState> = {};
        const nextErrors: Record<string, string | null> = {};
        HEALTH_METRIC_REGISTRY.forEach((definition) => {
          const diagnostic = localDiagnostics.find((item) => item.metricKey === definition.metricKey);
          if (!diagnostic?.supported) return;
          nextQueries[definition.metricKey] = diagnostic.localQueryState === 'DATA_AVAILABLE' ? 'DATA_AVAILABLE'
            : diagnostic.localQueryState === 'TIMEOUT' ? 'TIMEOUT'
            : diagnostic.localQueryState === 'ERROR' ? 'ERROR' : 'NO_VISIBLE_DATA';
          nextErrors[definition.metricKey] = nextQueries[definition.metricKey] === 'ERROR' ? 'NATIVE_ERROR'
            : nextQueries[definition.metricKey] === 'TIMEOUT' ? 'TIMEOUT' : null;
        });
        setQueryStates(nextQueries);
        setErrors(nextErrors);
        setMessage('Health data is available on this device. Secure upload continues in the background.');
      };
      const result = await runHealthSync(adapter.appId, wellness, connectionId ? {
        connectionId,
        provider: adapter.platform,
        trigger: 'MANUAL',
        localScope
      } : undefined, { ...options, localScope, onLocalComplete: applyLocalCompletion });
      if (!mounted.current||activeGeneration!==syncGeneration.current) return;
      mergeLocalObservations(result.observations);
      mergePresentationObservations(result.payload.presentationObservations ?? []);
      setSelectedDeviceId(adapter.appId);
      setWellness(result.wellness);
      const remainingPending=await countPendingLocalObservations(localScope);
      setPendingUploadCount(remainingPending);
      setAggregates(await readLocalHealthAggregates(localScope));
      setLifecycle(await readLocalHealthLifecycle(localScope));
      setDiagnostics(result.diagnostics);
      setProviderState('CONNECTED');
      await markLocalHealthProviderConnected(localScope);
      setUploadState(result.rejected > 0 ? 'ERROR' : remainingPending > 0 ? 'PENDING' : 'SYNCED');
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
      if (!mounted.current||activeGeneration!==syncGeneration.current) return;
      if (error instanceof HealthSyncUploadPendingError || error instanceof HealthSyncPostUploadRefreshError) {
        mergeLocalObservations(error.observations);
        mergePresentationObservations(error.payload.presentationObservations ?? []);
        setSelectedDeviceId(adapter.appId);
        const currentAggregates=await readLocalHealthAggregates(localScope);
        setWellness((current) => wellnessFromCanonicalAggregates(current,currentAggregates,{} as HealthScoreSummary));
        setPendingUploadCount(await countPendingLocalObservations(localScope));
        setAggregates(await readLocalHealthAggregates(localScope));
        setLifecycle(await readLocalHealthLifecycle(localScope));
        setDiagnostics(error.diagnostics);
        setProviderState('CONNECTED');
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
        if (error instanceof HealthSyncPostUploadRefreshError) {
          // The observation commit succeeded; refresh the independent Star Orb
          // projection instead of leaving Home on the strict canonical
          // methodology-pending fallback until the next app lifecycle event.
          void refreshRemoteSnapshot();
        }
      } else {
        const available = await adapter.isAvailable().catch(() => false);
        setProviderState(available ? 'ERROR' : 'UNAVAILABLE');
        setUploadState('ERROR');
        setQueryStates((current) => Object.fromEntries(Object.entries(current).map(([key, state]) => [key,
          state === 'QUERYING' ? 'ERROR' : state])));
        setMessage('Health data could not be read. Previous local data is safe.');
      }
    } finally {
      inFlight.current = false;
      if (refreshQueued.current) {
        refreshQueued.current = false;
        const nextOptions = queuedSyncOptions.current;
        queuedSyncOptions.current = {};
        setTimeout(() => void syncLocalMetrics(nextOptions), 0);
      }
    }
  }, [adapter, authSession, localScope, mergeLocalObservations, mergePresentationObservations, refreshRemoteSnapshot, setSelectedDeviceId, setWellness, sourceName, status, wellness]);

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
        await markLocalHealthProviderConnected(localScope);
      }
      forceBackfill.current = true;
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
      if (access.grantedScopes.length) await registerWearableBackgroundSync({
        connectionId: connection.id, provider: adapter.platform, appId: adapter.appId
      });
    } catch {
      setUploadState('PENDING');
      setMessage(`${sourceName} access is ready. Account sync will resume when the connection returns.`);
    }
    inFlight.current = false;
    await syncLocalMetrics({ forceSourceBackfill: true });
    forceBackfill.current = false;
  }, [adapter, localScope, sourceName, syncLocalMetrics]);

  const markPermissionReviewStarted = useCallback(() => {
    awaitingPermissionReturn.current = true;
  }, []);

  useEffect(() => {
    mounted.current = true;
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
    setCandidateIntelligence(null);
    setAggregates([]);
    setLocalHydrated(false);
    if (!bootstrapped || !localScope) return;
    let active = true;
    Promise.all([
      performApprovedStaleHealthQueueCleanup(localScope).then(() => readLocalHealthBootstrapSnapshot(localScope)),
      readLocalHealthPresentationObservations(localScope)
    ]).then(([snapshot, presentations]) => {
        if (!active || !mounted.current) return;
        setPendingUploadCount(snapshot.pendingUploadCount);
        if (snapshot.providerConnected) setProviderState('CONNECTED');
        if (snapshot.canonicalScoreSnapshot) setCanonicalIntelligence(markCanonicalSnapshotStale(snapshot.canonicalScoreSnapshot));
        setAggregates(snapshot.aggregates);
        setPresentationObservations(presentations.map((item, index) => toDto(item, 'local', index)));
        setLifecycle(snapshot.lifecycle);
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

  useEffect(()=>{
    if(!localHydrated||!localScope||!authSession||automaticallySyncedScope.current===localScope)return;
    automaticallySyncedScope.current=localScope;
    void syncLocalMetrics({liveOnly:true});
  },[authSession,localHydrated,localScope,syncLocalMetrics]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const now = Date.now();
      if (now - foregroundRefreshAt.current < 1_500) return;
      foregroundRefreshAt.current = now;
      const shouldBackfill = awaitingPermissionReturn.current || forceBackfill.current;
      awaitingPermissionReturn.current = false;
      void syncLocalMetrics({ forceSourceBackfill: shouldBackfill,liveOnly:!shouldBackfill });
    });
    return () => subscription.remove();
  }, [syncLocalMetrics]);

  const latestByMetric = useMemo(() => buildPresentedHealthObservations(observations,presentationObservations,aggregates),
    [aggregates,observations,presentationObservations]);
  const canonicalPresentedObservations = useMemo(() => [...latestByMetric.values()], [latestByMetric]);

  const metrics = useMemo<CanonicalHealthMetricState[]>(() => HEALTH_METRIC_REGISTRY.map((definition) => {
    const supported = adapter.platform === 'APPLE_HEALTH' ? Boolean(definition.appleHealthType) : Boolean(definition.healthConnectRecord);
    const observation = latestByMetric.get(definition.backendCanonicalType) ?? null;
    return {
      definition,
      sourcePlatform: adapter.platform,
      supported,
      // Never label a blank card as data available. Native completion state is
      // useful diagnostics, but presentation availability requires a value.
      queryState: observation ? 'DATA_AVAILABLE'
        : queryStates[definition.metricKey] === 'TIMEOUT' ? 'TIMEOUT'
        : queryStates[definition.metricKey] === 'ERROR' ? 'ERROR'
        : queryStates[definition.metricKey] === 'QUERYING' ? 'QUERYING' : 'NO_VISIBLE_DATA',
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
    uploadState,
    status,
    // Consumers use the same canonical projection as the sync screen. Raw
    // HealthKit packets remain private pipeline input and must not leak into
    // Tracker/Home as partial packet values.
    observations: canonicalPresentedObservations,
    aggregates,
    lifecycle,
    platformStatus,
    activity,
    message,
    diagnostics,
    canonicalIntelligence,
    candidateIntelligence,
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
