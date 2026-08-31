import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Health Connect D2 production contracts', () => {
  const service = read('src/services/healthConnectService.ts');

  it('declares the canonical Health Connect permission rationale activity contract', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const expectedReadPermissions = [
      'READ_ACTIVE_CALORIES_BURNED',
      'READ_DISTANCE',
      'READ_EXERCISE',
      'READ_HEART_RATE',
      'READ_HEART_RATE_VARIABILITY',
      'READ_SLEEP',
      'READ_STEPS',
      'READ_WEIGHT'
    ];
    const declaredHealthPermissions = Array.from(
      manifest.matchAll(/android\.permission\.health\.([A-Z_]+)/g),
      (match) => match[1]
    ).sort();

    expect(manifest.match(/androidx\.health\.ACTION_SHOW_PERMISSIONS_RATIONALE/g)).toHaveLength(1);
    expect(manifest).toContain('android:name=".MainActivity"');
    expect(declaredHealthPermissions).toEqual(expectedReadPermissions);
    expect(new Set(declaredHealthPermissions).size).toBe(declaredHealthPermissions.length);
    expect(manifest).not.toMatch(/android\.permission\.health\.WRITE_/);
  });

  it('uses one shared coordinator for native permission, diagnostic, and sync operations', () => {
    const coordinator = read('src/services/healthConnectOperationCoordinator.ts');
    expect(coordinator).toContain('let activeOperation: Promise<unknown> | null = null');
    expect(coordinator).toContain('health_connect_operation_in_progress');
    expect(service).toContain("runHealthConnectOperation('RECONCILING_PERMISSION'");
    expect(service).toContain("runHealthConnectOperation('REQUESTING_PERMISSION'");
    expect(service).toContain("runHealthConnectOperation('CHECKING'");
    expect(service).toContain("runHealthConnectOperation(\n    'SYNCING'");
  });

  it('registers the native Health Connect permission delegate in MainActivity', () => {
    const appConfig = read('app.json');
    const configPlugin = read('plugins/withHealthConnectPermissionDelegate.js');
    const mainActivity = read(
      'android/app/src/main/java/com/fiteatsy/health/MainActivity.kt'
    );
    expect(appConfig).toContain('./plugins/withHealthConnectPermissionDelegate');
    expect(configPlugin).toContain('withMainActivity');
    expect(configPlugin).toContain(
      'HealthConnectPermissionDelegate.setPermissionDelegate(this)'
    );
    expect(mainActivity).toContain(
      'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate'
    );
    expect(mainActivity).toContain(
      'HealthConnectPermissionDelegate.setPermissionDelegate(this)'
    );
    expect(mainActivity.indexOf('super.onCreate(null)')).toBeLessThan(
      mainActivity.indexOf('HealthConnectPermissionDelegate.setPermissionDelegate(this)')
    );
  });

  it('uses real Health Connect record identities and preserves provenance', () => {
    expect(service).toContain("record?.metadata?.id?.trim()");
    expect(service).toContain('sourceApplication: record?.metadata?.dataOrigin');
    expect(service).toContain('recordingMethod: record?.metadata?.recordingMethod');
    expect(service).not.toContain('health_connect:${metricType}:${measuredAtISO}:${rounded}:${unit}');
  });

  it('does not fabricate calories, focus, hydration, or breathing', () => {
    expect(service).toContain("'ActiveCaloriesBurned'");
    expect(service).not.toContain('workoutMinutes * 6');
    expect(service).not.toContain('stepCount / 120');
    expect(service).toContain('hydrationLiters: null');
    expect(service).toContain('focusMinutes: null');
    expect(service).toContain('breathingMinutes: null');
  });

  it('does not silently convert native read failures into missing data', () => {
    expect(service).toContain('health_connect_read_failed_${recordType}');
    expect(service).toContain("connectedMetrics[metric] = 'read_failed'");
    expect(service).toContain('failedMetrics.push(metric)');
  });

  it('keeps permission requests separate from routine sync reads', () => {
    const syncStart = service.indexOf('const syncFromHealthConnectInternal');
    const syncEnd = service.indexOf('export const syncFromHealthConnect', syncStart);
    const sync = service.slice(syncStart, syncEnd);
    expect(sync).not.toContain('requestPermission(');
    expect(sync).toContain('getGrantedPermissions()');
  });

  it('bounds native calls and requires an explicit user sync action', () => {
    const screen = read('src/screens/sync/SyncWearableScreen.tsx');
    const home = read('src/screens/home/HomeScreen.tsx');
    expect(service).toContain('HEALTH_CONNECT_OPERATION_TIMEOUT_MS = 30_000');
    expect(service).toContain('withHealthConnectTimeout');
    expect(service).toMatch(/runHealthConnectOperation\(\s*'SYNCING'/);
    expect(screen).not.toContain('getSdkStatus');
    expect(screen).toContain("withHealthConnectTimeout(runHealthSync('health-connect', wellness))");
    expect(screen).not.toContain('route.params?.autoSync');
    expect(screen).toMatch(/requestHealthPermission[\s\S]*if \(inFlightRef\.current\) \{\s*return;\s*\}/);
    expect(home).toContain("navigation.navigate('SyncWearable')");
    expect(home).not.toContain("navigation.navigate('SyncWearable', { autoSync: true })");
  });

  it('settles failures into retryable UI instead of unlocked insights', () => {
    const screen = read('src/screens/sync/SyncWearableScreen.tsx');
    expect(screen).toMatch(/stage === 'failed'\s*\? 'Try Again'/);
    expect(screen).not.toContain("stage === 'failed' || stage === 'insufficient_data'");
    expect(screen).toContain("setStage('failed')");
    expect(screen).toContain('setIsRunning(false)');
  });
});
