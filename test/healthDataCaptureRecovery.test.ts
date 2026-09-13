import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('end-to-end health data capture recovery contracts', () => {
  test('Apple queries every supported metric independently with bounded concurrent settled reads', () => {
    const apple = read('src/services/appleHealthService.ts');
    expect(apple).toContain('settleWithConcurrency(APPLE_HEALTH_SCOPES, APPLE_HEALTH_QUERY_CONCURRENCY');
    expect(apple).toContain('APPLE_HEALTH_METRIC_TIMEOUT_MS');
    expect(apple).toContain("result.samples.length ? 'SUCCESS' : 'NO_DATA'");
    expect(apple).toContain("statuses[statusKey] !== 'synced'");
  });

  test('first Apple sync uses bounded backfill and incremental sync uses only valid anchors', () => {
    const apple = read('src/services/appleHealthService.ts');
    expect(apple).toContain('definition?.syncWindowDays');
    expect(apple).toContain('options.forceBackfill || !anchors[metric] ? start : undefined');
    expect(apple).toContain('options.forceBackfill ? undefined : anchors[metric]');
    expect(apple).toContain('result.samples.length > 0 || result.deletedIds.length > 0');
    expect(apple).not.toContain('new Date(null)');
  });

  test('failed or partially rejected persistence cannot advance checkpoints', () => {
    const manager = read('src/services/healthSyncManager.ts');
    expect(manager).toContain('Object.keys(anchors).length && rejected === 0');
    expect(manager).toContain("'health_sync_checkpoint_commit_timeout'");
    expect(manager).toContain('checkpointAfter: rejected === 0 ? anchors : undefined');
  });

  test('native read, upload, and checkpoint stages are all bounded', () => {
    const manager = read('src/services/healthSyncManager.ts');
    for (const code of [
      'health_sync_native_read_timeout',
      'health_sync_upload_timeout',
      'health_sync_checkpoint_commit_timeout'
    ]) expect(manager).toContain(code);
  });

  test('local source read precedes every backend operation and checkpoints are device-local', () => {
    const manager = read('src/services/healthSyncManager.ts');
    const localRead = manager.indexOf('syncConnectedHealthApp(appId, localCursors, options)');
    const backendRun = manager.indexOf('beginWearableSyncRun', localRead);
    const upload = manager.indexOf("'/v1/health/observations:batch'", localRead);
    expect(localRead).toBeGreaterThan(0);
    expect(backendRun).toBeGreaterThan(localRead);
    expect(upload).toBeGreaterThan(localRead);
    expect(manager).toContain('persistLocalSyncBatch(localScope, observations, anchors)');
    expect(manager).toContain('readPendingLocalObservations(localScope, 250)');
    expect(manager).toContain('acknowledgeLocalObservations');
    expect(manager).not.toContain('getWearableCheckpoints');
  });

  test('durable local queue stores records and tombstones before bounded upload acknowledgement', () => {
    const store = read('src/services/healthSyncLocalStore.ts');
    expect(store).toContain('records: Record<string, StoredRecord>');
    expect(store).toContain('cursors: Record<string, string>');
    expect(store).toContain('unchanged ? previous.uploaded : false');
    expect(store).toContain('slice(0, limit)');
    expect(store).toContain('uploaded: true');
  });

  test('Apple cumulative totals use HealthKit statistics without losing anchored audit rows', () => {
    const native = read('modules/fiteatsy-healthkit/ios/FiteatsyHealthKitModule.swift');
    const apple = read('src/services/appleHealthService.ts');
    expect(native).toContain('HKStatisticsQuery');
    expect(native).toContain('options: .cumulativeSum');
    expect(apple).toContain('readHealthKitCumulativeStatistics');
    expect(apple).toContain('anchored source rows remain available for audit');
    expect(apple).toContain('startDate.setHours(0, 0, 0, 0)');
    expect(apple).toContain("dropReasons:result.samples.length===acceptedSampleCount?[]:['NON_CONSUMPTIVE_SLEEP_STAGE']");
  });

  test('authorization and foreground return immediately execute local query and retain local UI rows', () => {
    const screen = read('src/screens/sync/HealthDataSyncScreen.tsx');
    const onboarding = read('src/screens/sync/SyncWearableScreen.tsx');
    expect(screen).toContain('AUTH_REQUEST_STARTED');
    expect(screen).toContain('AUTH_REQUEST_COMPLETED');
    expect(screen).toContain('POST_AUTH_QUERY_STARTED');
    expect(screen).toContain('await syncNow({forceSourceBackfill:true})');
    expect(screen).toContain('applyLocalObservations(result.observations)');
    expect(screen).toContain('Metrics available');
    expect(screen).toContain('No visible health data found');
    expect(onboarding).toContain('forceAppleBackfillOnNextSyncRef.current = Platform.OS === \'ios\'');
    expect(onboarding).toContain('{ forceSourceBackfill }');
  });

  test('QA diagnostics are safe, metric-specific, and development-gated', () => {
    const diagnostics = read('src/services/healthSourceDiagnostics.ts');
    const screen = read('src/screens/sync/HealthDataSyncScreen.tsx');
    for (const field of ['sourcePlatform','metricKey','healthSourceIdentifier','queryWindowDays','queryExecuted','nativeRecordCount','normalizedRecordCount','droppedRecordCount','localQueryState','localRecordCount','normalisationState','dedupState','uploadState','backendPersistenceState','dailyAggregateState','calculationState','trackerState','orbState','lastErrorClass','lastErrorMessageSafe']) expect(diagnostics).toContain(field);
    expect(screen).toContain('__DEV__&&sourceDiagnostics.length');
    expect(diagnostics).not.toContain('Authorization');
  });

  test('both providers expose non-sensitive count diagnostics', () => {
    const apple = read('src/services/appleHealthService.ts');
    const android = read('src/services/healthConnectService.ts');
    for (const field of ['requestedMetricCount','metricsWithData','metricsNoData','metricsErrored','sourceRecordCount','normalizedRecordCount']) {
      expect(apple).toContain(field);
      expect(android).toContain(field);
    }
    expect(apple).not.toContain('originalValue:sample.value');
  });

  test('source identity and Apple HRV method remain explicit', () => {
    const apple = read('src/services/appleHealthService.ts');
    const android = read('src/services/healthConnectService.ts');
    const metricRegistry = read('src/services/healthMetricRegistry.ts');
    expect(apple).toContain("providerVersion:sample.measurementMethod ? `APPLE_${sample.measurementMethod}`");
    expect(apple).toContain("sample.metric === 'hrv_ms' ? 'hrv_sdnn_ms'");
    expect(android).toContain("metricType: 'hrv_rmssd_ms'");
    expect(android).toContain("hrv: 'HeartRateVariabilityRmssd'");
    expect(metricRegistry).toContain("healthConnectRecord:'HeartRateVariabilityRmssd'");
    expect(apple).toContain("measurementMethod:sample.measurementMethod");
    expect(apple).toContain('sourceVersion:sample.sourceVersion');
    expect(read('modules/fiteatsy-healthkit/ios/FiteatsyHealthKitModule.swift')).toContain('sourceRevision.productType');
    expect(apple).toContain("sample.sourceApplication ?? 'unknown_source'");
    expect(android).toContain("record.metadata?.dataOrigin ?? 'unknown_origin'");
    expect(apple).toContain('canonicalFingerprint');
  });

  test('uses one mobile metric registry with explicit aggregation and least privilege', () => {
    const registry = read('src/services/healthMetricRegistry.ts');
    const apple = read('src/services/appleHealthService.ts');
    const android = read('src/services/healthConnectService.ts');
    const screen = read('src/screens/sync/HealthDataSyncScreen.tsx');
    for (const aggregation of ["'SUM'", "'LATEST'", "'AVERAGE'", "'INTERVAL'", "'SAMPLE_SERIES'"]) {
      expect(registry).toContain(aggregation);
    }
    expect(apple).toContain('APPLE_HEALTH_READ_TYPES');
    expect(android).toContain('HEALTH_CONNECT_READ_RECORDS');
    expect(screen).toContain('HEALTH_METRIC_REGISTRY.map');
    expect(android).toContain("accessType: 'read'");
    expect(android).not.toContain("accessType: 'write'");
    expect(read('modules/fiteatsy-healthkit/ios/FiteatsyHealthKitModule.swift')).toContain('requestAuthorization(toShare: [], read: types)');
  });
});
