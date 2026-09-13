import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Health Data Sync control-centre contracts', () => {
  test('routes connected users to the control centre and disconnected users to permission onboarding', () => {
    const home = read('src/screens/home/HomeScreen.tsx');
    expect(home).toContain("navigation.navigate('HealthDataSync')");
    expect(home).toContain("health.providerState === 'CONNECTED' ? 'Sync Health' : 'Connect Health'");
    expect(home).toContain('useCanonicalHealthSyncCoordinator');
    expect(home).not.toContain('resolveHealthSyncRoute');
    expect(home).not.toContain("status.overallStatus === 'CONNECTED'");
    expect(read('src/navigation/types.ts')).toContain("HealthDataSync: { entryContext?: 'ONBOARDING' | 'HOME' | 'SETTINGS'");
    expect(read('src/navigation/AppNavigation.tsx')).toContain('<Stack.Screen name="HealthDataSync"');
  });

  test('uses the governed sync pipeline and does not fabricate unavailable metric values', () => {
    const screen = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    expect(coordinator).toContain('runHealthSync(adapter.appId');
    expect(coordinator).toContain('getLatestHealthObservations(200)');
    expect(coordinator).toContain('getHealthSyncActivity(8)');
    expect(screen).toContain('health.metrics.map');
    expect(screen).toContain('No recent data');
    expect(screen).not.toMatch(/value:\s*['"](?:--|0)['"]/);
  });

  test('exposes connection, manual sync, permission recovery, detail, and activity states', () => {
    const screen = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    for (const copy of [
      'Sync Now', 'Reading health data…', 'Review Permissions',
      'Automatic sync enabled', 'awaiting secure upload', 'Your Health Data', 'Sync Activity', 'Last updated'
    ]) expect(screen).toContain(copy);
    expect(screen).toContain('Restoring saved health data…');
    expect(screen).toContain('health.localHydrated');
    expect(screen).toContain('health.pendingUploadCount');
  });

  test('shows one canonical sync popup and surfaces connection/read failures', () => {
    const screen = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    expect(screen).toContain('visible={syncPopupVisible}');
    expect(screen).toContain("busy?'Syncing health data'");
    expect(screen).toContain("uploadPending?'Connection interrupted':'Health sync unsuccessful'");
    expect(screen).toContain('Synced values will appear automatically when ready.');
    expect(screen).toContain('Try Again');
    expect(screen).toContain("health.uploadState==='SYNCED')setSyncPopupVisible(false)");
    expect(screen).not.toContain('useState<HealthMetricQueryState');
  });

  test('keeps recent sync activity scoped to the authenticated owner', () => {
    const routes = read('backend/src/modules/health/health.routes.ts');
    const repository = read('backend/src/modules/health/wearable-platform.repository.ts');
    expect(routes).toContain("healthRouter.get('/sync-runs'");
    expect(routes).toContain('currentOwner(getAuthenticatedAccount(req))');
    expect(repository).toContain('where r.client_id=$1 and wc.account_id=$2');
  });

  test('uses the native HealthKit request and never misdirects iOS users to generic app settings', () => {
    const screen = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    const adapter = read('src/services/healthPlatformAdapter.ts');
    expect(adapter).toContain('requestAppleHealthPermissions');
    expect(screen).toContain('Request Health Access');
    expect(screen).toContain("if(Platform.OS==='ios')setPermissionHelp(true);else void Linking.openSettings()");
    expect(coordinator).toContain("AppState.addEventListener('change'");
    expect(coordinator).toContain('awaitingPermissionReturn.current');
    expect(coordinator).toContain('forceSourceBackfill: shouldBackfill');
    expect(screen).not.toContain('x-apple-health://');
  });

  test('fails gracefully and uses truthful zero-data language', () => {
    const screen = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    expect(coordinator).toContain('access requires your attention');
    expect(screen).toContain("NO_VISIBLE_DATA:'No recent data'");
    expect(screen).not.toContain('Permission denied');
  });

  test('keeps local health reads independent from backend upload availability', () => {
    const manager = read('src/services/healthSyncManager.ts');
    const screen = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    expect(manager.indexOf('adapter.queryAllSupportedMetrics(localCursors')).toBeLessThan(manager.indexOf('beginWearableSyncRun(governed.connectionId'));
    expect(manager).toContain('HealthSyncUploadPendingError');
    expect(coordinator).toContain('data is available locally. Upload is pending.');
    expect(screen).toContain('awaiting secure upload. Your health data remains available on this device.');
  });
});
