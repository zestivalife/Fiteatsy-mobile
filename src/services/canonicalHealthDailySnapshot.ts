import type { CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';
import type { LocalCanonicalHealthSnapshot } from './localHealthIntelligence';
import { calculateCanonicalHealthIntelligenceFromAggregates } from './localHealthIntelligence';

export const HEALTH_DAILY_SNAPSHOT_VERSION = 'HEALTH_DAILY_SNAPSHOT_V1' as const;

export type CanonicalHealthDailySnapshot = {
  snapshotVersion: typeof HEALTH_DAILY_SNAPSHOT_VERSION;
  healthDay: string;
  accountScope: string;
  aggregateVersion: string;
  calculatedAtISO: string;
  aggregates: CanonicalDailyAggregate[];
  intelligence: LocalCanonicalHealthSnapshot | null;
  lineageHashes: string[];
  sourceProviders: string[];
};

const localDateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('-');

export const buildCanonicalHealthDailySnapshots = (
  accountScope: string,
  aggregates: CanonicalDailyAggregate[],
  intelligence: LocalCanonicalHealthSnapshot | null,
  calculatedAtISO = new Date().toISOString()
): Record<string, CanonicalHealthDailySnapshot> => {
  const byDay = new Map<string, CanonicalDailyAggregate[]>();
  aggregates.forEach((aggregate) => byDay.set(aggregate.healthDay, [...(byDay.get(aggregate.healthDay) ?? []), aggregate]));
  const currentDay = localDateKey(new Date(calculatedAtISO));
  return Object.fromEntries([...byDay.entries()].map(([healthDay, rows]) => [healthDay, {
    snapshotVersion: HEALTH_DAILY_SNAPSHOT_VERSION,
    healthDay,
    accountScope,
    aggregateVersion: rows[0]?.aggregateVersion ?? 'UNKNOWN',
    calculatedAtISO,
    aggregates: rows,
    intelligence: healthDay === currentDay && intelligence
      ? intelligence
      : calculateCanonicalHealthIntelligenceFromAggregates(rows, { healthDay, now: new Date(calculatedAtISO) }),
    lineageHashes: rows.map((row) => row.lineageHash).sort(),
    sourceProviders: [...new Set(rows.map((row) => row.sourceProvider))].sort()
  }]));
};
