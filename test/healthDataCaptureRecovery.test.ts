import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('end-to-end health data capture recovery contracts', () => {
  test('Apple queries every supported metric independently with bounded all-settled reads', () => {
    const apple = read('src/services/appleHealthService.ts');
    expect(apple).toContain('Promise.allSettled(APPLE_HEALTH_SCOPES.map');
    expect(apple).toContain('APPLE_HEALTH_METRIC_TIMEOUT_MS');
    expect(apple).toContain("result.samples.length ? 'SUCCESS' : 'NO_DATA'");
    expect(apple).toContain("statuses[statusKey] !== 'synced'");
  });

  test('first Apple sync uses bounded backfill and incremental sync uses only valid anchors', () => {
    const apple = read('src/services/appleHealthService.ts');
    expect(apple).toContain('Date.now() - 90 * 86400000');
    expect(apple).toContain('anchors[metric] ? undefined : start');
    expect(apple).not.toContain('new Date(null)');
  });

  test('failed or partially rejected persistence cannot advance checkpoints', () => {
    const manager = read('src/services/healthSyncManager.ts');
    expect(manager).toContain('anchors && rejected === 0');
    expect(manager).toContain("'health_sync_checkpoint_commit_timeout'");
    expect(manager).toContain('checkpointAfter: rejected === 0 ? anchors : undefined');
  });

  test('native read, upload, and checkpoint stages are all bounded', () => {
    const manager = read('src/services/healthSyncManager.ts');
    for (const code of [
      'health_sync_checkpoint_read_timeout',
      'health_sync_native_read_timeout',
      'health_sync_upload_timeout',
      'health_sync_checkpoint_commit_timeout'
    ]) expect(manager).toContain(code);
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
    expect(apple).toContain("providerVersion:sample.measurementMethod ? `APPLE_${sample.measurementMethod}`");
    expect(apple).toContain("sample.metric === 'hrv_ms' ? 'hrv_sdnn_ms'");
    expect(android).toContain("metricType: 'hrv_rmssd_ms'");
    expect(android).toContain("recordType: 'HeartRateVariabilityRmssd'");
    expect(apple).toContain("measurementMethod:sample.measurementMethod");
  });
});
