import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Health Data Sync control-centre contracts', () => {
  test('routes connected users to the control centre and disconnected users to permission onboarding', () => {
    const home = read('src/screens/home/HomeScreen.tsx');
    expect(home).toContain('getHealthSyncStatus');
    expect(home).toContain('resolveHealthSyncRoute(healthSyncStatus)');
    expect(home).toContain('navigation.navigate(healthSyncRoute.destination)');
    expect(home).toContain("healthSyncRoute.connectionState === 'UNKNOWN'");
    expect(home).not.toContain("status.overallStatus === 'CONNECTED'");
    expect(read('src/navigation/types.ts')).toContain('HealthDataSync: undefined');
    expect(read('src/navigation/AppNavigation.tsx')).toContain('<Stack.Screen name="HealthDataSync"');
  });

  test('uses the governed sync pipeline and does not fabricate unavailable metric values', () => {
    const screen = read('src/screens/sync/HealthDataSyncScreen.tsx');
    expect(screen).toContain('runHealthSync');
    expect(screen).toContain('getLatestHealthObservations');
    expect(screen).toContain('getHealthSyncActivity');
    expect(screen).toContain('definitions.map(definition=>({definition,item:latestByMetric.get(definition.type)}))');
    expect(screen).toContain('No recent data');
    expect(screen).not.toMatch(/value:\s*['"](?:--|0)['"]/);
  });

  test('exposes connection, manual sync, permission recovery, detail, and activity states', () => {
    const screen = read('src/screens/sync/HealthDataSyncScreen.tsx');
    for (const copy of [
      'Connection needed', 'Sync Now', 'Syncing…', 'Review Permissions',
      'Health data partially updated', 'Your previous data is safe',
      'Your Health Data', 'Sync Activity', 'Last updated', 'Sync status'
    ]) expect(screen).toContain(copy);
  });

  test('keeps recent sync activity scoped to the authenticated owner', () => {
    const routes = read('backend/src/modules/health/health.routes.ts');
    const repository = read('backend/src/modules/health/wearable-platform.repository.ts');
    expect(routes).toContain("healthRouter.get('/sync-runs'");
    expect(routes).toContain('currentOwner(getAuthenticatedAccount(req))');
    expect(repository).toContain('where r.client_id=$1 and wc.account_id=$2');
  });

  test('opens supported iOS app settings and refreshes once when returning', () => {
    const screen = read('src/screens/sync/HealthDataSyncScreen.tsx');
    expect(screen).toContain('await Linking.openSettings()');
    expect(screen).toContain("AppState.addEventListener('change'");
    expect(screen).toContain("nextState!=='active'||!awaitingPermissionReturn.current");
    expect(screen).toContain('permissionRefreshRunning.current');
    expect(screen).toContain('inspectAppleHealthPermissionState');
    expect(screen).toContain('await refresh()');
    expect(screen).not.toContain('x-apple-health://');
  });

  test('fails gracefully and uses truthful zero-data language', () => {
    const screen = read('src/screens/sync/HealthDataSyncScreen.tsx');
    expect(screen).toContain("Alert.alert('Unable to open Apple Health settings'");
    expect(screen).toContain("connected?'No recent data':'Action needed'");
    expect(screen).not.toContain('Permission denied');
  });
});
