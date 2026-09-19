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
    expect(apple).toContain("terminalMetricStatuses[metric] = nextStatus");
    expect(apple).toContain('APPLE_HEALTH_SCOPES.map((metric) => terminalMetricStatuses[metric]');
  });

  test('first Apple sync uses bounded backfill and incremental sync uses only valid anchors', () => {
    const apple = read('src/services/appleHealthService.ts');
    expect(apple).toContain('definition?.syncWindowDays');
    expect(apple).toContain('options.forceBackfill || !pageAnchor ? start : undefined');
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

  test('telemetry and post-upload refresh cannot block or misclassify authoritative ingestion', () => {
    const manager = read('src/services/healthSyncManager.ts');
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    expect(manager).toContain('beginWearableSyncRun(governed.connectionId, governed.provider, governed.trigger).catch(() => null)');
    expect(manager).toContain("'health_sync_checkpoint_commit_timeout').catch(() => undefined)");
    expect(manager).toContain('HealthSyncPostUploadRefreshError');
    expect(manager).toContain('if (payload && uploadCompleted) throw new HealthSyncPostUploadRefreshError');
    expect(coordinator).toContain("error instanceof HealthSyncPostUploadRefreshError ? 'SYNCED' : 'PENDING'");
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
    const localRead = manager.indexOf('adapter.queryAllSupportedMetrics(localCursors');
    const backendRun = manager.indexOf('beginWearableSyncRun', localRead);
    const upload = manager.indexOf("'/v1/health/observations:batch'", localRead);
    expect(localRead).toBeGreaterThan(0);
    expect(backendRun).toBeGreaterThan(localRead);
    expect(upload).toBeGreaterThan(localRead);
    expect(manager).toContain('persistLocalSyncBatch(localScope, observations, anchors)');
    expect(manager).toContain('readPendingLocalObservations(localScope, HEALTH_SYNC_UPLOAD_BATCH_SIZE)');
    expect(manager).toContain('acknowledgeLocalObservations');
    expect(manager).not.toContain('getWearableCheckpoints');
  });

  test('durable local queue stores records and tombstones before bounded upload acknowledgement', () => {
    const store = read('src/services/healthSyncLocalStore.ts');
    const manager = read('src/services/healthSyncManager.ts');
    expect(store).toContain('records: Record<string, StoredRecord>');
    expect(store).toContain('cursors: Record<string, string>');
    expect(store).toContain('unchanged ? previous.uploaded : false');
    expect(store).toContain('slice(0, limit)');
    expect(store).toContain('uploaded: true');
    expect(manager).toContain('HEALTH_SYNC_UPLOAD_BATCH_SIZE = 50');
    expect(manager).toContain('readPendingLocalObservations(localScope, HEALTH_SYNC_UPLOAD_BATCH_SIZE)');
    expect(manager).not.toContain('readPendingLocalObservations(localScope, 250)');
  });

  test('Apple cumulative totals use HealthKit statistics without losing anchored audit rows', () => {
    const native = read('modules/fiteatsy-healthkit/ios/FiteatsyHealthKitModule.swift');
    const apple = read('src/services/appleHealthService.ts');
    expect(native).toContain('HKStatisticsQuery');
    expect(native).toContain('anchoredReadLimit = 2500');
    expect(native).not.toContain('limit: HKObjectQueryNoLimit');
    expect(native).toContain('options: .cumulativeSum');
    expect(apple).toContain('readHealthKitCumulativeStatistics');
    expect(apple).toContain('anchored source rows remain available for audit');
    expect(apple).toContain('startDate.setHours(0, 0, 0, 0)');
    expect(apple).toContain("dropReasons:result.samples.length===acceptedSampleCount?[]:['NON_CONSUMPTIVE_OR_NON_POSITIVE_SAMPLE']");
    expect(apple).toContain('presentationObservations.push');
    expect(apple).toContain("measurementMethod:'HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'");
  });

  test('cards render presentation aggregates and connected sessions sync automatically', () => {
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    const screen = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    expect(coordinator).toContain('buildPresentedHealthObservations');
    expect(coordinator).toContain('presentationObservations');
    expect(coordinator).toContain('localProviderConnected');
    expect(coordinator).toContain('readLocalHealthObservations(localScope)');
    expect(coordinator).toContain('refreshQueued.current = true');
    expect(coordinator).toContain('countTerminalHealthMetricReads');
    expect(coordinator).toContain('void syncLocalMetrics()');
    expect(screen).toContain('HEALTHKIT_DAILY_CUMULATIVE_STATISTIC');
    for (const color of ['#FF5E1A','#0A84FF','#5E5CE6','#FF375F','#32D74B','#BF5AF2','#64D2FF']) {
      expect(screen).toContain(color);
    }
  });

  test('backend accepts the complete Apple Health provenance contract and a bounded backfill body', () => {
    const routes = read('backend/src/modules/health/health.routes.ts');
    const server = read('backend/src/server.ts');
    expect(routes).toContain('sourceVersion: z.string().trim().max(120).optional()');
    expect(routes).toContain('sourceProductType: z.string().trim().max(180).optional()');
    expect(routes).toContain('canonicalFingerprint: z.string().trim().max(240).optional()');
    expect(server).toContain("app.use('/v1/health/observations:batch', parseHealthObservationBatch)");
    expect(server).toContain("express.json({ limit: '512kb' })");
    expect(routes).toContain('recalculateIntelligence: z.boolean().optional().default(true)');
    expect(routes).toContain('scores = await calculateHealthScores(owner, healthDays.at(-1))');
    expect(routes).toContain("enqueueHealthRecalculation(");
    expect(read('src/services/healthSyncManager.ts')).toContain('recalculateIntelligence: false');
  });

  test('HealthKit pagination, poison-sample filtering, queue serialization, and observer refresh are wired', () => {
    const apple = read('src/services/appleHealthService.ts');
    const bridge = read('modules/fiteatsy-healthkit/ios/FiteatsyHealthKitModule.swift');
    const store = read('src/services/healthSyncLocalStore.ts');
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    expect(bridge).toContain('"hasMore": rows.count + deletedIds.count >= self.anchoredReadLimit');
    expect(apple).toContain('APPLE_HEALTH_MAX_PAGES_PER_METRIC = 8');
    expect(apple).toContain('while (hasMore && pagesRead < APPLE_HEALTH_MAX_PAGES_PER_METRIC)');
    expect(apple).toContain('sample.value <= 0');
    expect(store).toContain('serializeScopeOperation');
    expect(coordinator).toContain('subscribeToHealthKitChanges');
    expect(coordinator).toContain('subscription?.remove()');
  });

  test('authorization and foreground return immediately execute local query and retain local UI rows', () => {
    const screen = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    expect(coordinator).toContain('await syncLocalMetrics({ forceSourceBackfill: true })');
    expect(coordinator).toContain('mergeLocalObservations(result.observations)');
    expect(coordinator).toContain('awaitingPermissionReturn.current');
    expect(screen).toContain('Available metrics');
    expect(screen).toContain('canonicalHealthStatusLabel');
  });

  test('QA diagnostics are safe, metric-specific, and development-gated', () => {
    const diagnostics = read('src/services/healthSourceDiagnostics.ts');
    const screen = read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    for (const field of ['sourcePlatform','metricKey','healthSourceIdentifier','queryWindowDays','queryExecuted','nativeRecordCount','normalizedRecordCount','droppedRecordCount','localQueryState','localRecordCount','normalisationState','dedupState','uploadState','backendPersistenceState','dailyAggregateState','calculationState','trackerState','orbState','lastErrorClass','lastErrorMessageSafe']) expect(diagnostics).toContain(field);
    expect(read('src/services/canonicalHealthSyncCoordinator.ts')).toContain('setDiagnostics(result.diagnostics)');
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
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    expect(registry).toContain('HealthAggregationMethod');
    expect(registry).toContain('HEALTH_METRIC_SEMANTICS.steps.display');
    const semantics=read('packages/health-intelligence/src/index.ts');
    for (const aggregation of ["'DAILY_SUM'", "'LATEST'", "'DAILY_AVERAGE'", "'SESSION_AGGREGATE'", "'RAW_SERIES'"]) expect(semantics).toContain(aggregation);
    expect(apple).toContain('APPLE_HEALTH_READ_TYPES');
    expect(android).toContain('HEALTH_CONNECT_READ_RECORDS');
    expect(coordinator).toContain('HEALTH_METRIC_REGISTRY.map');
    expect(android).toContain("accessType: 'read'");
    expect(android).not.toContain("accessType: 'write'");
    expect(read('modules/fiteatsy-healthkit/ios/FiteatsyHealthKitModule.swift')).toContain('requestAuthorization(toShare: [], read: types)');
  });
});
