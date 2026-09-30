const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
    multiSet: jest.fn(async (entries: [string, string][]) => {
      entries.forEach(([key, value]) => mockStorage.set(key, value));
    }),
    multiRemove: jest.fn(async (keys: string[]) => { keys.forEach((key) => mockStorage.delete(key)); })
  }
}));

import { acknowledgeLocalObservations, countPendingLocalObservations, markLocalHealthProviderConnected,
  persistLocalHealthPresentationObservations, persistLocalSyncBatch, readLocalHealthObservations,
  readLocalHealthPresentationObservations, readLocalHealthProviderConnected,
  readLocalSyncCursors, readPendingLocalObservations, persistLocalCanonicalHealthSnapshot,
  readLocalCanonicalHealthSnapshot, recomputeLocalHealthAggregates, readLocalHealthAggregates,
  ensureLocalHealthAggregatesCurrent, readLocalHealthBootstrapSnapshot } from '../src/services/healthSyncLocalStore';
import { calculateCanonicalHealthIntelligence } from '../src/services/localHealthIntelligence';
import { migrateLegacyHealthQueueToShards, persistShardedHealthBatch } from '../src/services/healthSyncShardedStore';

const observation = (value: number, deleted = false, recordId = 'record-1') => ({
  metricType: 'steps', value, unit: deleted ? 'deleted' : 'count',
  measuredAtISO: '2026-09-13T00:00:00.000Z', sourceProvider: 'apple_health',
  sourceRecordId: recordId, syncKey: `apple_health:steps:source:${recordId}`, deleted
});

describe('durable local health sync store', () => {
  beforeEach(() => mockStorage.clear());

  it('atomically preserves normalized records and cursors before acknowledgement', async () => {
    await persistLocalSyncBatch('connection-1', [observation(100)], { steps: 'anchor-1' });
    expect(await readLocalSyncCursors('connection-1')).toEqual({ steps: 'anchor-1' });
    const pending = await readPendingLocalObservations('connection-1');
    expect(pending).toHaveLength(1);
    await acknowledgeLocalObservations('connection-1', [pending[0].recordKey]);
    expect(await readPendingLocalObservations('connection-1')).toEqual([]);
  });

  it('does not requeue an unchanged acknowledged source record', async () => {
    await persistLocalSyncBatch('connection-1', [observation(100)], { steps: 'anchor-1' });
    const [pending] = await readPendingLocalObservations('connection-1');
    await acknowledgeLocalObservations('connection-1', [pending.recordKey]);
    await persistLocalSyncBatch('connection-1', [observation(100)], { steps: 'anchor-2' });
    expect(await readPendingLocalObservations('connection-1')).toEqual([]);
    expect(await readLocalSyncCursors('connection-1')).toEqual({ steps: 'anchor-2' });
  });

  it('requeues changed records and durably retains tombstones', async () => {
    await persistLocalSyncBatch('connection-1', [observation(100)], { steps: 'anchor-1' });
    const [pending] = await readPendingLocalObservations('connection-1');
    await acknowledgeLocalObservations('connection-1', [pending.recordKey]);
    await persistLocalSyncBatch('connection-1', [observation(0, true)], { steps: 'anchor-2' });
    expect((await readPendingLocalObservations('connection-1'))[0].observation.deleted).toBe(true);
  });

  it('serializes concurrent queue mutations without losing either observation', async () => {
    await Promise.all([
      persistLocalSyncBatch('connection-1', [observation(100, false, 'record-1')], { steps: 'anchor-1' }),
      persistLocalSyncBatch('connection-1', [observation(200, false, 'record-2')], { steps: 'anchor-2' })
    ]);
    const pending = await readPendingLocalObservations('connection-1');
    expect(pending.map((item) => item.observation.sourceRecordId).sort()).toEqual(['record-1', 'record-2']);
    expect(await readLocalSyncCursors('connection-1')).toEqual({ steps: 'anchor-2' });
  });

  it('hydrates account-scoped cached observations and pending upload state after restart', async () => {
    const scope = 'account:user-1:apple-health';
    await persistLocalSyncBatch(scope, [observation(100)], { steps: 'anchor-1' });
    expect(await readLocalHealthObservations(scope)).toEqual([observation(100)]);
    expect(await countPendingLocalObservations(scope)).toBe(1);
    expect(await readLocalHealthObservations('account:user-2:apple-health')).toEqual([]);
  });

  it('keeps only the latest compact display record per metric', async () => {
    const scope = 'account:compact:apple-health';
    await persistLocalSyncBatch(scope, [
      { ...observation(100, false, 'old'), measuredAtISO: '2026-09-12T00:00:00.000Z' },
      { ...observation(200, false, 'new'), measuredAtISO: '2026-09-13T00:00:00.000Z' }
    ], { steps: 'anchor-2' });
    expect(await readLocalHealthObservations(scope)).toEqual([
      { ...observation(200, false, 'new'), measuredAtISO: '2026-09-13T00:00:00.000Z' }
    ]);
    expect(await countPendingLocalObservations(scope)).toBe(2);
  });

  it('migrates legacy pending rows incrementally and retains the recoverable archive', async () => {
    const scope = 'account:legacy-migration:apple-health';
    const pending = observation(100, false, 'pending');
    mockStorage.set(`@fiteatsy/health-sync-local-v2:${scope}`, JSON.stringify({ records: {
      acknowledged: { observation: observation(50, false, 'acknowledged'), uploaded: true },
      pending: { observation: pending, uploaded: false },
      duplicate: { observation: pending, uploaded: false },
      poison: { observation: { metricType: 'steps', value: 'invalid' }, uploaded: false }
    } }));
    const summary = await migrateLegacyHealthQueueToShards(scope);
    expect(summary).toEqual({ totalBefore: 4, acknowledgedRemoved: 1, duplicatesRemoved: 1,
      poisonQuarantined: 1, uniquePendingRetained: 1, totalAfter: 1, dataLoss: 'NONE' });
    expect(mockStorage.has(`@fiteatsy/health-sync-local-v2:${scope}`)).toBe(true);
  });

  it.each([100, 1_000, 10_000, 50_000, 100_000])(
    'keeps a %i-row upload queue distributed across bounded shards', async (size) => {
      mockStorage.clear();
      const scope = `account:scale-${size}:apple-health`;
      const rows = Array.from({ length: size }, (_, index) => ({
        ...observation(index + 1, false, `record-${index}`),
        measuredAtISO: new Date(Date.UTC(2026, 0, 1 + (index % 365))).toISOString()
      }));
      await persistShardedHealthBatch(scope, rows, 330);
      expect(await countPendingLocalObservations(scope)).toBe(size);
      const queueDocuments = [...mockStorage.entries()]
        .filter(([key]) => key.includes(`@fiteatsy/health-queue-v3:${scope}:`))
        .map(([, value]) => Object.keys(JSON.parse(value)).length);
      expect(queueDocuments.length).toBeGreaterThan(1);
      expect(Math.max(...queueDocuments)).toBeLessThan(Math.ceil(size / 128) + 100);
    }, 120_000
  );

  it('hydrates a bounded startup projection without parsing the raw health store', async () => {
    const scope = 'account:user-1:apple-health';
    await persistLocalSyncBatch(scope, [observation(100)], { steps: 'anchor-1' });
    const storage = require('@react-native-async-storage/async-storage').default;
    storage.getItem.mockClear();
    const snapshot = await readLocalHealthBootstrapSnapshot(scope);
    expect(snapshot.pendingUploadCount).toBe(1);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem.mock.calls[0][0]).toContain('health-sync-bootstrap');
  });

  it('imports only the compact legacy bootstrap and never parses the legacy raw history during startup', async () => {
    const scope = 'account:user-legacy:apple-health';
    mockStorage.set(`@fiteatsy/health-sync-local-v1:${scope}`, 'intentionally-not-json');
    mockStorage.set(`@fiteatsy/health-sync-bootstrap-v1:${scope}`, JSON.stringify({
      pendingUploadCount: 0,
      providerConnected: true,
      aggregates: [],
      aggregatesDirty: false,
      lifecycle: { lastHealthReadAtISO: '2026-09-20T00:00:00.000Z' }
    }));
    const storage = require('@react-native-async-storage/async-storage').default;
    storage.getItem.mockClear();
    const snapshot = await readLocalHealthBootstrapSnapshot(scope);
    expect(snapshot.providerConnected).toBe(true);
    expect(snapshot.lifecycle.lastHealthReadAtISO).toBe('2026-09-20T00:00:00.000Z');
    expect(storage.getItem.mock.calls.map((call: [string]) => call[0]))
      .not.toContain(`@fiteatsy/health-sync-local-v1:${scope}`);
  });

  it('persists provider connection independently from onboarding metadata', async () => {
    const scope = 'account:user-1:apple-health';
    expect(await readLocalHealthProviderConnected(scope)).toBe(false);
    await markLocalHealthProviderConnected(scope);
    expect(await readLocalHealthProviderConnected(scope)).toBe(true);
    expect(await readLocalHealthProviderConnected('account:user-2:apple-health')).toBe(false);
  });

  it('persists presentation totals separately from uploadable source observations', async () => {
    const scope = 'account:user-1:apple-health';
    const total = { ...observation(750), sourceRecordId: 'daily-total', syncKey: 'steps:2026-09-13:total' };
    await persistLocalHealthPresentationObservations(scope, [total]);
    expect(await readLocalHealthPresentationObservations(scope)).toEqual([total]);
    expect(await readPendingLocalObservations(scope)).toEqual([]);
  });

  it('restores only the account-scoped canonical V1 score snapshot after restart', async () => {
    const scope = 'account:user-1:apple-health';
    const snapshot = calculateCanonicalHealthIntelligence({
      activity: { steps: 10_000, stepGoal: 10_000, exerciseMinutes: 30, exerciseTarget: 30, balance: 80 },
      sleep: { minutes: 480, targetMinutes: 480, deep: 80, rem: 80, efficiency: 80, consistency: 80 },
      nutrition: { protein: 80, hydration: 80, foodQuality: 80, clinical: 80 },
      calm: { hrv: 80, stress: 80, mindfulness: 80 },
      stressRecovery: { hrv: 80, sleep: 80, adaptation: 80 },
      recovery: { sleep: 80, body: 80, activityBalance: 80, lifestyle: 80 },
      cycle: { applicable: false }
    }, '2026-09-14T10:00:00.000Z');
    await persistLocalCanonicalHealthSnapshot(scope, snapshot);
    expect(await readLocalCanonicalHealthSnapshot(scope)).toEqual(snapshot);
    expect(await readLocalCanonicalHealthSnapshot('account:user-2:apple-health')).toBeNull();
  });

  it('recomputes a cumulative day from the complete retained window after an incremental delta', async () => {
    const scope = 'account:user-1:apple-health';
    await persistLocalSyncBatch(scope, [observation(100, false, 'record-1')], { steps: 'anchor-1' });
    await recomputeLocalHealthAggregates(scope, '2026-09-13T01:00:00.000Z', 330, Date.parse('2026-09-13T01:00:00.000Z'));
    await persistLocalSyncBatch(scope, [observation(50, false, 'record-2')], { steps: 'anchor-2' });
    const aggregates = await recomputeLocalHealthAggregates(scope, '2026-09-13T02:00:00.000Z', 330, Date.parse('2026-09-13T02:00:00.000Z'));
    expect(aggregates.find((item) => item.metricType === 'steps')?.value).toBe(150);
    expect((await readLocalHealthAggregates(scope))[0].aggregateVersion).toBe('HEALTH_AGGREGATION_V2');
  });

  it('invalidates deleted source records and recovers an interrupted dirty aggregate state', async () => {
    const scope = 'account:user-1:apple-health';
    await persistLocalSyncBatch(scope, [observation(100, false, 'record-1')], { steps: 'anchor-1' });
    await recomputeLocalHealthAggregates(scope, '2026-09-13T01:00:00.000Z', 330, Date.parse('2026-09-13T01:00:00.000Z'));
    await persistLocalSyncBatch(scope, [observation(0, true, 'record-1')], { steps: 'anchor-2' });
    const aggregates = await ensureLocalHealthAggregatesCurrent(scope, 330, Date.parse('2026-09-13T02:00:00.000Z'));
    expect(aggregates).toEqual([]);
  });
});
