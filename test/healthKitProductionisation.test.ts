import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Apple HealthKit native production contracts', () => {
  const service = read('src/services/healthKitService.ts');
  const appService = read('src/services/healthAppService.ts');
  const config = JSON.parse(read('app.json'));

  it('requests only the accepted read-only HealthKit metrics', () => {
    [
      'HKQuantityTypeIdentifierStepCount', 'HKCategoryTypeIdentifierSleepAnalysis',
      'HKQuantityTypeIdentifierRestingHeartRate', 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      'HKWorkoutTypeIdentifier', 'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierBodyMass', 'HKQuantityTypeIdentifierDistanceWalkingRunning'
    ].forEach((identifier) => expect(service).toContain(identifier));
    expect(service).toContain('toRead: READ_TYPES');
    expect(service).not.toContain('toShare:');
    expect(service).not.toContain('HKQuantityTypeIdentifierOxygenSaturation');
    expect(service).not.toContain('HKQuantityTypeIdentifierRespiratoryRate');
    expect(service).toContain('authorizationRequestCompleted: true');
    expect(service).toContain('grantedCount: 0');
  });

  it('uses canonical observation identities and the shared health-sync pipeline', () => {
    expect(service).toContain("sourceProvider: 'apple_health'");
    expect(service).toContain('sourceRecordId: sample.uuid');
    expect(service).toContain('syncKey: `apple_health:');
    expect(appService).toContain("platform === 'ios' && appId === 'apple-health'");
    expect(appService).toContain('return syncFromHealthKit()');
  });

  it('keeps the iOS native runtime isolated and enables read-only HealthKit capability', () => {
    expect(config.expo.runtimeVersion).toBe('1.0.0-native-20260827-healthkit-ios-v1');
    const plugin = config.expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === '@kingstinct/react-native-healthkit');
    expect(plugin?.[1]?.background).toBe(false);
    expect(plugin?.[1]?.NSHealthUpdateUsageDescription).toBe(false);
    expect(read('ios/Fiteatsy/Fiteatsy.entitlements')).toContain('com.apple.developer.healthkit');
    expect(read('ios/Fiteatsy/Info.plist')).toContain('NSHealthShareUsageDescription');
  });
});
