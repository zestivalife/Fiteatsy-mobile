import { HEALTH_OBSERVATION_FRESHNESS_MS, isCurrentHealthObservation } from '../backend/src/modules/intelligence/health-freshness';
import { emptyWellness } from '../src/state/emptyWellness';
import fs from 'node:fs';
import path from 'node:path';

describe('D1 health truthfulness contracts', () => {
  const now = Date.parse('2026-08-25T12:00:00.000Z');

  it.each([
    ['steps', 24],
    ['sleep_minutes', 48],
    ['resting_heart_rate', 168],
    ['hrv_ms', 168],
    ['workout_minutes', 168]
  ])('enforces the documented %s freshness window', (metricType, hours) => {
    expect(HEALTH_OBSERVATION_FRESHNESS_MS[metricType]).toBe(hours * 60 * 60 * 1000);
    expect(isCurrentHealthObservation({ metricType, measuredAtISO: new Date(now - hours * 60 * 60 * 1000).toISOString() }, now)).toBe(true);
    expect(isCurrentHealthObservation({ metricType, measuredAtISO: new Date(now - hours * 60 * 60 * 1000 - 1).toISOString() }, now)).toBe(false);
  });

  it('does not present the pre-sync state as measured zero or normal HRV', () => {
    expect(emptyWellness.availability).toBe('not_synced');
    expect(emptyWellness.lastUpdatedISO).toBeNull();
    expect(emptyWellness.source).toBeNull();
    expect(emptyWellness.hrvStatus).toBe('Unavailable');
  });

  it('keeps legacy wearable endpoints non-authoritative', () => {
    const service = fs.readFileSync(path.join(process.cwd(), 'backend/src/modules/wearables/wearables.service.ts'), 'utf8');
    const routes = fs.readFileSync(path.join(process.cwd(), 'backend/src/modules/wearables/wearables.routes.ts'), 'utf8');
    expect(service).not.toContain('new Map<string, HealthConnection>');
    expect(service).not.toContain('recordsByConnectionId');
    expect(service).toContain('heartRateAvg: resting == null ? null');
    expect(service).toContain('sleepMinutes > 0 ? Number');
    expect(routes).toContain('ingestHealthObservations');
    expect(routes).toContain('listHealthObservations');
    expect(routes).toContain('LEGACY_SYNC_REMOVED');
  });
});
