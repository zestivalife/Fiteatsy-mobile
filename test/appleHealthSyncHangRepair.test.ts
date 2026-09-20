import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Apple Health sync hang repair', () => {
  const apple = read('src/services/appleHealthService.ts');
  const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
  const manager = read('src/services/healthSyncManager.ts');
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

  test('starts current-day cumulative statistics before serial source-history reads', () => {
    expect(apple.indexOf('const statisticsPromise = readStatistics()')).toBeLessThan(
      apple.indexOf('settleWithConcurrency(APPLE_HEALTH_SCOPES')
    );
    expect(apple).toContain('(await statisticsPromise).forEach');
  });

  test('never substitutes ordinary heart rate for resting heart rate', () => {
    expect(apple).toContain('average(validValues(metricValues.resting_heart_rate ?? []))');
    expect(apple).not.toContain("?? average(validValues(metricValues.heart_rate ?? []))");
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

  test('network reachability cannot recursively restart native HealthKit collection', () => {
    expect(coordinator).not.toContain('NetInfo.addEventListener');
    expect(apple).toContain('APPLE_HEALTH_QUERY_CONCURRENCY = 1');
  });

  test('ends blocking UI at durable local completion rather than backend upload completion', () => {
    expect(manager.indexOf('onLocalComplete?.')).toBeGreaterThan(manager.indexOf('recomputeLocalHealthAggregates'));
    expect(manager.indexOf('onLocalComplete?.')).toBeLessThan(manager.indexOf('beginWearableSyncRun(governed.connectionId'));
    expect(coordinator).toContain('onLocalComplete: applyLocalCompletion');
    expect(controlCentre).toContain('terminalMetricCount');
    expect(controlCentre).toContain('Health sync partially complete');
  });

  test('bounds foreground queue draining while retaining the durable pending queue', () => {
    expect(manager).toContain('HEALTH_SYNC_MAX_UPLOAD_BATCHES_PER_RUN = 10');
    expect(manager).toContain('uploadBatchCount < HEALTH_SYNC_MAX_UPLOAD_BATCHES_PER_RUN');
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
