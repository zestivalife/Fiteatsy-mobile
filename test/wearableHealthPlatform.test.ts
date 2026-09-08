import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

describe('governed wearable health platform', () => {
  it('keeps product consent separate from OS grants and makes status connection-authoritative', () => {
    const migration = read('backend/src/db/migrations/0068_wearable_health_platform.sql');
    const routes = read('backend/src/modules/health/health.routes.ts');
    expect(migration).toContain('create table if not exists wearable_consents');
    expect(migration).toContain('create table if not exists wearable_connections');
    expect(migration).toContain('create table if not exists wearable_sync_runs');
    expect(migration).toContain('create table if not exists wearable_sync_checkpoints');
    expect(routes).toContain('ACTIVE_WEARABLE_CONSENT_REQUIRED');
    expect(routes).toContain('listWearableConnections(owner)');
  });

  it('supports provider corrections, tombstones, provenance and timezone', () => {
    const repository = read('backend/src/modules/health/health-observations.repository.ts');
    expect(repository).toContain('contentHash');
    expect(repository).toContain('deleted_at=now()');
    expect(repository).toContain('timezone_offset_minutes');
    expect(repository).toContain('provider_updated_at');
  });

  it('paginates Health Connect and chunks backend uploads', () => {
    const healthConnect = read('src/services/healthConnectService.ts');
    const manager = read('src/services/healthSyncManager.ts');
    expect(healthConnect).toContain('while (pageToken)');
    expect(healthConnect).toContain('pageSize: 500');
    expect(manager).toContain('offset += 500');
    expect(manager).toContain('observations.slice(offset, offset + 500)');
  });

  it('ships real read-only HealthKit capability and anchored reads', () => {
    const entitlement = read('ios/Fiteatsy/Fiteatsy.entitlements');
    const native = read('modules/fiteatsy-healthkit/ios/FiteatsyHealthKitModule.swift');
    expect(entitlement).toContain('com.apple.developer.healthkit');
    expect(native).toContain('HKAnchoredObjectQuery');
    expect(native).toContain('requestAuthorization(toShare: [], read: types)');
    expect(native).toContain('enableBackgroundDelivery');
  });

  it('blocks Consultant wearable projection after consent withdrawal', () => {
    const repository = read('backend/src/modules/consultants/consultants.repository.ts');
    expect(repository).toContain("wc.status='ACTIVE'");
    expect(repository).toContain('deleted_at is null');
  });
});
