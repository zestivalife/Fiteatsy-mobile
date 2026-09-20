import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HealthObservationDraft } from '../types';
import type { LocalCanonicalHealthSnapshot } from './localHealthIntelligence';
import { aggregateCanonicalHealthObservations, HEALTH_AGGREGATION_VERSION, type CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';

const STORE_VERSION = 1;
const keyFor = (scope: string) => `@fiteatsy/health-sync-local-v${STORE_VERSION}:${scope}`;
const INSTALLATION_KEY = `@fiteatsy/health-sync-local-v${STORE_VERSION}:installation-id`;
const LEGACY_KEYS = ['@fiteatsy/wearable-installation-id', '@fiteatsy/wearable-last-foreground-sync'] as const;
const identity = (item: HealthObservationDraft) => item.syncKey
  ?? `${item.sourceProvider}:${item.metricType}:${item.sourceRecordId ?? item.measuredAtISO}`;

type StoredRecord = { observation: HealthObservationDraft; uploaded: boolean; updatedAtISO: string };
export type HealthSyncLifecycleTimestamps = { lastHealthReadAtISO:string|null; lastSavedAtISO:string|null;
  lastUploadedAtISO:string|null; lastFullySyncedAtISO:string|null };
type LocalSyncState = { records: Record<string, StoredRecord>; presentationRecords: Record<string, HealthObservationDraft>;
  cursors: Record<string, string>; providerConnected: boolean; canonicalScoreSnapshot: LocalCanonicalHealthSnapshot | null;
  aggregates:CanonicalDailyAggregate[]; aggregatesDirty:boolean; lifecycle:HealthSyncLifecycleTimestamps };
const emptyState = (): LocalSyncState => ({ records: {}, presentationRecords: {}, cursors: {}, providerConnected: false,
  canonicalScoreSnapshot: null,aggregates:[],aggregatesDirty:false,lifecycle:{lastHealthReadAtISO:null,lastSavedAtISO:null,lastUploadedAtISO:null,lastFullySyncedAtISO:null} });
const scopeOperations = new Map<string, Promise<unknown>>();
const serializeScopeOperation = <T>(scope: string, operation: () => Promise<T>): Promise<T> => {
  const previous = scopeOperations.get(scope) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  scopeOperations.set(scope, current);
  return current.finally(() => {
    if (scopeOperations.get(scope) === current) scopeOperations.delete(scope);
  });
};

const readState = async (scope: string): Promise<LocalSyncState> => {
  try {
    const raw = await AsyncStorage.getItem(keyFor(scope));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LocalSyncState>;
    return { records: parsed.records ?? {}, presentationRecords: parsed.presentationRecords ?? {},
      cursors: parsed.cursors ?? {}, providerConnected: parsed.providerConnected === true,
      canonicalScoreSnapshot: parsed.canonicalScoreSnapshot?.calculationVersion === 'HEALTH_INTELLIGENCE_V1'
        ? parsed.canonicalScoreSnapshot : null,
      aggregates:(parsed.aggregates??[]).filter(item=>item.aggregateVersion===HEALTH_AGGREGATION_VERSION),
      aggregatesDirty:parsed.aggregatesDirty===true||(parsed.aggregates??[]).some(item=>item.aggregateVersion!==HEALTH_AGGREGATION_VERSION),
      lifecycle:{...emptyState().lifecycle,...parsed.lifecycle} };
  } catch {
    return emptyState();
  }
};

const writeState = (scope: string, state: LocalSyncState) =>
  AsyncStorage.setItem(keyFor(scope), JSON.stringify(state));

export const readLocalSyncCursors = (scope: string) =>
  serializeScopeOperation(scope, async () => (await readState(scope)).cursors);

export const readLocalHealthObservations = (scope: string) =>
  serializeScopeOperation(scope, async () => {
    const state = await readState(scope);
    return Object.values(state.records)
      .sort((left, right) => left.updatedAtISO.localeCompare(right.updatedAtISO))
      .map((record) => record.observation);
  });

export const readLocalHealthPresentationObservations = (scope: string) =>
  serializeScopeOperation(scope, async () => Object.values((await readState(scope)).presentationRecords));

export const persistLocalHealthPresentationObservations = (
  scope: string,
  observations: HealthObservationDraft[]
) => serializeScopeOperation(scope, async () => {
  const state = await readState(scope);
  for (const observation of observations) state.presentationRecords[identity(observation)] = observation;
  if(observations.length)state.aggregatesDirty=true;
  await writeState(scope, state);
});

export const countPendingLocalObservations = (scope: string) =>
  serializeScopeOperation(scope, async () => {
    const state = await readState(scope);
    return Object.values(state.records).filter((record) => !record.uploaded).length;
  });

export const readLocalHealthProviderConnected = (scope: string) =>
  serializeScopeOperation(scope, async () => (await readState(scope)).providerConnected);

export const markLocalHealthProviderConnected = (scope: string) =>
  serializeScopeOperation(scope, async () => {
    const state = await readState(scope);
    state.providerConnected = true;
    await writeState(scope, state);
  });

export const readLocalCanonicalHealthSnapshot = (scope: string) =>
  serializeScopeOperation(scope, async () => (await readState(scope)).canonicalScoreSnapshot);

export const persistLocalCanonicalHealthSnapshot = (scope: string, snapshot: LocalCanonicalHealthSnapshot) =>
  serializeScopeOperation(scope, async () => {
    const state = await readState(scope);
    state.canonicalScoreSnapshot = snapshot;
    await writeState(scope, state);
  });

export const readLocalHealthAggregates = (scope:string) => serializeScopeOperation(scope,async()=>(await readState(scope)).aggregates);
export const readLocalHealthLifecycle = (scope:string) => serializeScopeOperation(scope,async()=>(await readState(scope)).lifecycle);
/**
 * Reads the complete startup projection with one AsyncStorage fetch/JSON parse.
 * The previous coordinator called seven public selectors in parallel. Those
 * selectors are intentionally serialized per account, so a large retained
 * HealthKit history was parsed seven times during cold launch.
 *
 * Startup must remain a cheap local restore. Dirty aggregates are deliberately
 * not recomputed here; the explicit/observer sync pipeline owns that work.
 */
export const readLocalHealthBootstrapSnapshot = (scope: string) =>
  serializeScopeOperation(scope, async () => {
    const state = await readState(scope);
    return {
      observations: Object.values(state.records)
        .sort((left, right) => left.updatedAtISO.localeCompare(right.updatedAtISO))
        .map((record) => record.observation),
      presentationObservations: Object.values(state.presentationRecords),
      pendingUploadCount: Object.values(state.records).filter((record) => !record.uploaded).length,
      providerConnected: state.providerConnected,
      canonicalScoreSnapshot: state.canonicalScoreSnapshot,
      aggregates: state.aggregates,
      aggregatesDirty: state.aggregatesDirty,
      lifecycle: state.lifecycle
    };
  });
export const persistLocalHealthAggregates = (scope:string,aggregates:CanonicalDailyAggregate[],readAtISO:string) =>
  serializeScopeOperation(scope,async()=>{const state=await readState(scope);state.aggregates=aggregates;
    state.aggregatesDirty=false;
    state.lifecycle={...state.lifecycle,lastHealthReadAtISO:readAtISO,lastSavedAtISO:new Date().toISOString()};await writeState(scope,state);});
/** Rebuilds from the complete retained account/platform window. The raw write,
 * dirty marker and this replacement are serialized so a crash is detectable. */
export const recomputeLocalHealthAggregates = (scope:string,readAtISO:string,fallbackOffsetMinutes:number,nowMs=Date.now()) =>
  serializeScopeOperation(scope,async()=>{const state=await readState(scope);
    const input=[...Object.values(state.records).map(record=>record.observation),...Object.values(state.presentationRecords)]
      .map(item=>({...item,sourceProvider:item.sourceMetadata?.measurementMethod==='HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'
        ?'platform_aggregate':item.sourceProvider}));
    state.aggregates=aggregateCanonicalHealthObservations(input,{fallbackOffsetMinutes,nowMs});
    state.aggregatesDirty=false;state.canonicalScoreSnapshot=null;
    state.lifecycle={...state.lifecycle,lastHealthReadAtISO:readAtISO,lastSavedAtISO:new Date(nowMs).toISOString()};
    await writeState(scope,state);return state.aggregates;
  });
export const ensureLocalHealthAggregatesCurrent=(scope:string,fallbackOffsetMinutes:number,nowMs=Date.now())=>
  serializeScopeOperation(scope,async()=>{const state=await readState(scope);
    if(!state.aggregatesDirty&&state.aggregates.every(item=>item.aggregateVersion===HEALTH_AGGREGATION_VERSION))return state.aggregates;
    const input=[...Object.values(state.records).map(record=>record.observation),...Object.values(state.presentationRecords)]
      .map(item=>({...item,sourceProvider:item.sourceMetadata?.measurementMethod==='HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'
        ?'platform_aggregate':item.sourceProvider}));
    state.aggregates=aggregateCanonicalHealthObservations(input,{fallbackOffsetMinutes,nowMs});state.aggregatesDirty=false;
    state.canonicalScoreSnapshot=null;state.lifecycle={...state.lifecycle,lastSavedAtISO:new Date(nowMs).toISOString()};
    await writeState(scope,state);return state.aggregates;
  });
export const markLocalHealthUploaded = (scope:string,fullySynced:boolean) => serializeScopeOperation(scope,async()=>{
  const state=await readState(scope);const at=new Date().toISOString();state.lifecycle={...state.lifecycle,lastUploadedAtISO:at,
    lastFullySyncedAtISO:fullySynced?at:state.lifecycle.lastFullySyncedAtISO};await writeState(scope,state);
});

export const getOrCreateHealthInstallationId = async () => {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const created = `install-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(INSTALLATION_KEY, created);
  // Remove the superseded duplicate key after migrating its value when present.
  await AsyncStorage.multiRemove([...LEGACY_KEYS]);
  return created;
};

export const migrateLegacyHealthInstallationId = async () => {
  const canonical = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (canonical) {
    await AsyncStorage.multiRemove([...LEGACY_KEYS]);
    return canonical;
  }
  const legacy = await AsyncStorage.getItem('@fiteatsy/wearable-installation-id');
  if (!legacy) return getOrCreateHealthInstallationId();
  await AsyncStorage.setItem(INSTALLATION_KEY, legacy);
  await AsyncStorage.multiRemove([...LEGACY_KEYS]);
  return legacy;
};

/** Atomically persists normalized records/tombstones and their resulting cursors. */
export const persistLocalSyncBatch = (
  scope: string,
  observations: HealthObservationDraft[],
  cursors: Record<string, string>
) => serializeScopeOperation(scope, async () => {
  const state = await readState(scope);
  const updatedAtISO = new Date().toISOString();
  for (const observation of observations) {
    if(observation.deleted&&observation.sourceRecordId){
      for(const [existingKey,existing] of Object.entries(state.records)){
        if(existing.observation.sourceProvider===observation.sourceProvider&&existing.observation.sourceRecordId===observation.sourceRecordId)
          delete state.records[existingKey];
      }
      for(const [existingKey,existing] of Object.entries(state.presentationRecords)){
        if(existing.sourceProvider===observation.sourceProvider&&existing.sourceRecordId===observation.sourceRecordId)
          delete state.presentationRecords[existingKey];
      }
    }
    const recordKey = identity(observation);
    const previous = state.records[recordKey];
    const unchanged = previous && JSON.stringify(previous.observation) === JSON.stringify(observation);
    state.records[recordKey] = { observation, uploaded: unchanged ? previous.uploaded : false, updatedAtISO };
  }
  if(observations.length){state.aggregatesDirty=true;state.canonicalScoreSnapshot=null;}
  state.cursors = { ...state.cursors, ...cursors };
  await writeState(scope, state);
});

export const readPendingLocalObservations = (scope: string, limit = 250) => serializeScopeOperation(scope, async () => {
  const state = await readState(scope);
  return Object.entries(state.records)
    .filter(([, record]) => !record.uploaded)
    .sort(([, left], [, right]) => left.updatedAtISO.localeCompare(right.updatedAtISO))
    .slice(0, limit)
    .map(([recordKey, record]) => ({ recordKey, observation: record.observation }));
});

export const acknowledgeLocalObservations = (scope: string, recordKeys: string[]) => serializeScopeOperation(scope, async () => {
  const state = await readState(scope);
  for (const recordKey of recordKeys) {
    const record = state.records[recordKey];
    if (record) state.records[recordKey] = { ...record, uploaded: true };
  }
  await writeState(scope, state);
});
