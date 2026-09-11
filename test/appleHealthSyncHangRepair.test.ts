import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Apple Health sync hang repair', () => {
  const apple = read('src/services/appleHealthService.ts');
  const onboarding = read('src/screens/sync/SyncWearableScreen.tsx');
  const controlCentre = read('src/screens/sync/HealthDataSyncScreen.tsx');

  test('bounds availability, authorization, every metric read, and background delivery', () => {
    expect(apple).toContain('APPLE_HEALTH_AVAILABILITY_TIMEOUT_MS');
    expect(apple).toContain('APPLE_HEALTH_PERMISSION_TIMEOUT_MS');
    expect(apple).toContain('APPLE_HEALTH_METRIC_TIMEOUT_MS');
    expect(apple).toContain('withAppleHealthTimeout(');
    expect(apple).toContain('apple_health_background_delivery_timeout');
  });

  test('settles metric reads independently so one unresolved native callback cannot block all metrics', () => {
    expect(apple).toContain('Promise.allSettled');
    expect(apple).toContain('METRIC_QUERY_TIMEOUT');
    expect(apple).toContain('METRIC_QUERY_NO_DATA');
    expect(apple).toContain("acceptedSampleCount > 0 ? 'synced' : 'no_recent_data'");
  });

  test('setup later and back invalidate the active operation before navigating immediately', () => {
    expect(onboarding).toContain('operationIdRef.current += 1');
    expect(onboarding).toContain("const skipForNow = () => { exitWearableFlow('later'); };");
    expect(onboarding).toContain('void clearOnboardingRuntimeProgress');
    expect(onboarding).toContain('onBack={cancelAndGoBack}');
    expect(onboarding).toContain('isCurrentOperation');
  });

  test('both authoring surfaces clear running state through finalisation and reject late callbacks', () => {
    expect(onboarding).toMatch(/finally \{[\s\S]*setIsRunning\(false\)/);
    expect(controlCentre).toContain('reachedTerminalState');
    expect(controlCentre).toContain('operationId.current+=1');
    expect(controlCentre).toContain('running.current=false');
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
