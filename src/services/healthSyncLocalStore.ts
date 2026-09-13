import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HealthObservationDraft } from '../types';

const STORE_VERSION = 1;
const keyFor = (scope: string) => `@fiteatsy/health-sync-local-v${STORE_VERSION}:${scope}`;
const INSTALLATION_KEY = `@fiteatsy/health-sync-local-v${STORE_VERSION}:installation-id`;
const LEGACY_KEYS = ['@fiteatsy/wearable-installation-id', '@fiteatsy/wearable-last-foreground-sync'] as const;
const identity = (item: HealthObservationDraft) => item.syncKey
  ?? `${item.sourceProvider}:${item.metricType}:${item.sourceRecordId ?? item.measuredAtISO}`;

type StoredRecord = { observation: HealthObservationDraft; uploaded: boolean; updatedAtISO: string };
type LocalSyncState = { records: Record<string, StoredRecord>; cursors: Record<string, string> };
const emptyState = (): LocalSyncState => ({ records: {}, cursors: {} });

const readState = async (scope: string): Promise<LocalSyncState> => {
  try {
    const raw = await AsyncStorage.getItem(keyFor(scope));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LocalSyncState>;
    return { records: parsed.records ?? {}, cursors: parsed.cursors ?? {} };
  } catch {
    return emptyState();
  }
};

const writeState = (scope: string, state: LocalSyncState) =>
  AsyncStorage.setItem(keyFor(scope), JSON.stringify(state));

export const readLocalSyncCursors = async (scope: string) => (await readState(scope)).cursors;

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
export const persistLocalSyncBatch = async (
  scope: string,
  observations: HealthObservationDraft[],
  cursors: Record<string, string>
) => {
  const state = await readState(scope);
  const updatedAtISO = new Date().toISOString();
  for (const observation of observations) {
    const recordKey = identity(observation);
    const previous = state.records[recordKey];
    const unchanged = previous && JSON.stringify(previous.observation) === JSON.stringify(observation);
    state.records[recordKey] = { observation, uploaded: unchanged ? previous.uploaded : false, updatedAtISO };
  }
  state.cursors = { ...state.cursors, ...cursors };
  await writeState(scope, state);
};

export const readPendingLocalObservations = async (scope: string, limit = 250) => {
  const state = await readState(scope);
  return Object.entries(state.records)
    .filter(([, record]) => !record.uploaded)
    .sort(([, left], [, right]) => left.updatedAtISO.localeCompare(right.updatedAtISO))
    .slice(0, limit)
    .map(([recordKey, record]) => ({ recordKey, observation: record.observation }));
};

export const acknowledgeLocalObservations = async (scope: string, recordKeys: string[]) => {
  const state = await readState(scope);
  for (const recordKey of recordKeys) {
    const record = state.records[recordKey];
    if (record) state.records[recordKey] = { ...record, uploaded: true };
  }
  await writeState(scope, state);
};
