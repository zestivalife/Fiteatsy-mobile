import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

describe('Apple Health physical-device permission flow', () => {
  const native = read('modules/fiteatsy-healthkit/ios/FiteatsyHealthKitModule.swift');
  const bridge = read('modules/fiteatsy-healthkit/index.ts');
  const apple = read('src/services/appleHealthService.ts');
  const manager = read('src/services/healthSyncManager.ts');
  const screen = read('src/screens/sync/SyncWearableScreen.tsx');

  it('requests read-only supported HealthKit types and omits unsupported metrics', () => {
    expect(native).toContain('requestAuthorization(toShare: [], read: types)');
    expect(native).toContain('metrics.filter { self.sampleType($0) != nil }');
    expect(native).toContain('metrics.filter { self.sampleType($0) == nil }');
    expect(native).not.toContain('toShare: types');
    expect(native).not.toContain('sampleType(metric)!');
  });

  it('reports request completion without fabricating per-type read grants', () => {
    expect(native).toContain('"requestCompleted": true');
    expect(native).toContain('"supportedScopes": supported');
    expect(native).toContain('getRequestStatusForAuthorization');
    expect(native).not.toContain('"grantedScopes"');
    expect(bridge).toContain('requestCompleted: boolean');
    expect(bridge).not.toContain('grantedScopes: string[]');
    expect(screen).toContain("const persistedGrantedScopes = Platform.OS === 'ios' ? [] : grantedScopes");
  });

  it('keeps no-data distinct from permission failure and starts initial sync', () => {
    expect(manager).not.toContain("throw new Error('INSUFFICIENT_DATA')");
    expect(apple).toContain("'no_recent_data'");
    expect(screen).toContain('shouldStartInitialSyncRef.current = Platform.OS === \'ios\'');
    expect(screen).toContain('void runRecoveryConnection()');
  });

  it('projects Apple metric names into canonical connected-domain keys', () => {
    expect(apple).toContain("sleep_minutes: 'sleep'");
    expect(apple).toContain("hrv_ms: 'hrv'");
    expect(apple).toContain("workout_minutes: 'workouts'");
    expect(apple).toContain("active_energy: 'calories'");
    expect(apple).toContain("exercise_minutes: 'workouts'");
    expect(apple).toContain("sample.metric === 'exercise_minutes' ? 'active_minutes'");
  });

  it('derives local tracker summaries from real Apple samples without inventing values', () => {
    expect(apple).toContain('const steps = sum(validValues(metricValues.steps ?? []))');
    expect(apple).toContain('const sleepMinutes = sum(validValues(metricValues.sleep_minutes ?? []))');
    expect(apple).toContain('heartRateAvg:restingHeartRate');
    expect(apple).toContain('hrvMs');
    expect(apple).toContain("['AWAKE', 'IN_BED'].includes(sample.sleepStage ?? '')");
  });

  it('preserves Apple Watch/source provenance without filtering valid sources', () => {
    expect(apple).toContain("device: { manufacturer:'Apple', model:sample.device }");
    expect(apple).toContain('sourceApplication:sample.sourceApplication');
    expect(apple).not.toContain('com.apple.health');
    expect(apple).not.toContain('sourceApplication ===');
  });

  it('exits the optional wearable flow instead of chaining calendar/reminder onboarding', () => {
    expect(screen).toContain("clearOnboardingRuntimeProgress(authSession?.client.fiteatsyClientId)");
    expect(screen).toContain("navigation.reset({ index:0, routes:[{ name:'Main' }] })");
    expect(screen).toContain("const skipForNow = () => { void exitWearableFlow('later'); };");
    expect(screen).not.toContain("navigation.navigate('OnboardingCalendar')");
  });

  it('uses platform-correct copy and no unsupported Apple Health URL scheme', () => {
    expect(screen).toContain("Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'");
    expect(screen).toContain('`${healthProviderName} access could not be completed.`');
    expect(screen).not.toContain("Linking.openURL('x-apple-health://')");
  });

  it('logs only authorization/read metadata, never health values', () => {
    expect(native).toContain('HealthKit authorization invoked');
    expect(native).toContain('HealthKit authorization completed');
    expect(native).toContain('HealthKit read completed');
    expect(native).not.toContain('privacy: .private(mask: .none)');
  });
});
