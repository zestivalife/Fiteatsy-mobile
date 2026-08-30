import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Health Connect D2 production contracts', () => {
  const service = read('src/services/healthConnectService.ts');

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
    expect(service).not.toContain("return [];\n  }\n};");
  });

  it('keeps permission requests separate from routine sync reads', () => {
    const sync = service.slice(service.indexOf('export const syncFromHealthConnect'));
    expect(sync).not.toContain('requestPermission(');
    expect(sync).toContain('getGrantedPermissions()');
  });

  it('bounds native calls and requires an explicit user sync action', () => {
    const screen = read('src/screens/sync/SyncWearableScreen.tsx');
    const home = read('src/screens/home/HomeScreen.tsx');
    expect(service).toContain('HEALTH_CONNECT_OPERATION_TIMEOUT_MS = 30_000');
    expect(service).toContain('withHealthConnectTimeout');
    expect(screen).toContain('withHealthConnectTimeout(getSdkStatus())');
    expect(screen).toContain("withHealthConnectTimeout(runHealthSync('health-connect', wellness))");
    expect(screen).not.toContain('route.params?.autoSync');
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
