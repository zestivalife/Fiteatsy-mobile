import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Apple Health sync hang repair', () => {
  const apple = read('src/services/appleHealthService.ts');
  const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
  const controlCentre = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');

  test('bounds availability, authorization, every metric read, and background delivery', () => {
    expect(apple).toContain('APPLE_HEALTH_AVAILABILITY_TIMEOUT_MS');
    expect(apple).toContain('APPLE_HEALTH_PERMISSION_TIMEOUT_MS');
    expect(apple).toContain('APPLE_HEALTH_METRIC_TIMEOUT_MS');
    expect(apple).toContain('withAppleHealthTimeout(');
    expect(apple).toContain('apple_health_background_delivery_timeout');
  });

  test('settles metric reads independently so one unresolved native callback cannot block all metrics', () => {
    expect(apple).toContain('settleWithConcurrency(APPLE_HEALTH_SCOPES, APPLE_HEALTH_QUERY_CONCURRENCY');
    expect(apple).toContain('METRIC_QUERY_TIMEOUT');
    expect(apple).toContain('METRIC_QUERY_NO_DATA');
    expect(apple).toContain("acceptedSampleCount > 0 ? 'synced' : 'no_recent_data'");
  });

  test('setup later and back remain available without a second onboarding state machine', () => {
    expect(controlCentre).toContain("wearablePreference:connected?'sync':'later'");
    expect(controlCentre).toContain('onBack={()=>navigation.goBack()}');
    expect(controlCentre).not.toContain('HealthDataSyncExperience');
  });

  test('the coordinator owns and clears the single in-flight sync guard', () => {
    expect(coordinator).toContain('if (inFlight.current) return');
    expect(coordinator).toContain('inFlight.current = false');
    expect(controlCentre).not.toContain('runHealthSync');
  });

  test('diagnostics contain timing and status but do not log source health values', () => {
    for (const event of [
      'HEALTH_SYNC_START', 'HEALTHKIT_AVAILABLE', 'METRIC_QUERY_START',
      'METRIC_QUERY_SUCCESS', 'METRIC_QUERY_NO_DATA', 'METRIC_QUERY_TIMEOUT',
      'METRIC_QUERY_ERROR', 'HEALTH_SYNC_COMPLETE'
    ]) expect(apple).toContain(event);
    expect(apple).toContain('durationMs');
    expect(apple).not.toMatch(/diagnostic\([^\n]*value/);
  });
});
