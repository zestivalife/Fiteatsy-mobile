import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Health Connect D2 production contracts', () => {
  const service = read('src/services/healthConnectService.ts');

  it('registers the native Health Connect permission delegate in MainActivity', () => {
    const mainActivity = read(
      'android/app/src/main/java/com/fiteatsy/health/MainActivity.kt'
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
    expect(service).not.toContain("return [];\n  }\n};");
  });

  it('keeps permission requests separate from routine sync reads', () => {
    const sync = service.slice(service.indexOf('export const syncFromHealthConnect'));
    expect(sync).not.toContain('requestPermission(');
    expect(sync).toContain('getGrantedPermissions()');
  });
});
