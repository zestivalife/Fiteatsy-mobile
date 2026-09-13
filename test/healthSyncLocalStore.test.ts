const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); })
  }
}));

import { acknowledgeLocalObservations, persistLocalSyncBatch, readLocalSyncCursors,
  readPendingLocalObservations } from '../src/services/healthSyncLocalStore';

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
});
