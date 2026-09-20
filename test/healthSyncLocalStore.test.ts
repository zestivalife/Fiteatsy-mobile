const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
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
