import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(__dirname,'..');
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');

describe('P0-2 canonical health task lifecycle and native parity',()=>{
  test('defines exactly the governed terminal states and exposes all lifecycle phases',()=>{
    const state=read('src/services/healthSyncState.ts');
    for(const value of ['IDLE','QUEUED','REQUESTING_PERMISSION','READING','NORMALIZING','PERSISTING','AGGREGATING','UPLOAD_PENDING','COMPLETED','NO_DATA','PERMISSION_DENIED','UNSUPPORTED','FAILED'])expect(state).toContain(`'${value}'`);
    expect(state).toContain("'COMPLETED', 'NO_DATA', 'PERMISSION_DENIED', 'UNSUPPORTED', 'FAILED'");
  });

  test('derives the iOS 13-task count from the canonical registry',()=>{
    const registry=read('src/services/healthMetricRegistry.ts');
    const appleEntries=[...registry.matchAll(/appleHealthType:(null|'[^']+')/g)].filter(([,value])=>value!=='null');
    expect(appleEntries).toHaveLength(13);
    expect(registry).toContain('APPLE_HEALTH_QUERYABLE_METRICS = HEALTH_METRIC_REGISTRY.filter');
  });

  test('keeps native metric status independent and does not alias heart rate or workouts',()=>{
    const apple=read('src/services/appleHealthService.ts');
    const diagnostics=read('src/services/healthSourceDiagnostics.ts');
    expect(apple).toContain('statuses[metric] = nextStatus');
    expect(apple).not.toContain('STATUS_KEY_BY_METRIC');
    expect(diagnostics).toContain('definition.appleHealthType');
  });

  test('reports every unsupported metric explicitly and transitions phases around real work',()=>{
    const coordinator=read('src/services/canonicalHealthSyncCoordinator.ts');
    const manager=read('src/services/healthSyncManager.ts');
    expect(coordinator).toContain("? 'READING' : 'UNSUPPORTED'");
    expect(coordinator).toContain('onLifecyclePhase: (phase)');
    expect(manager.indexOf("onLifecyclePhase?.('NORMALIZING')")).toBeLessThan(manager.indexOf('deriveObservations(payload)'));
    expect(manager.indexOf("onLifecyclePhase?.('PERSISTING')")).toBeLessThan(manager.indexOf('await persistLocalSyncBatch'));
    expect(manager.indexOf("onLifecyclePhase?.('AGGREGATING')")).toBeLessThan(manager.indexOf('const canonicalAggregates=await recomputeLocalHealthAggregates'));
  });

  test('preserves Health Connect canonical precision instead of rounding native records',()=>{
    const service=read('src/services/healthConnectService.ts');
    expect(service).not.toContain("value.toFixed(mapped.metricType === 'sleep_minutes' ? 0 : 2)");
    expect(service).not.toContain("value.toFixed(metricType === 'sleep_minutes' ? 0 : 2)");
    expect(service).toContain('metricType: mapped.metricType, value,');
  });

  test('uses explicit truthful UI states without production placeholders',()=>{
    const screen=read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
    for(const mapping of ["NO_DATA:'No data'","PERMISSION_DENIED:'Permission denied'","UNSUPPORTED:'Unsupported'","FAILED:'Couldn’t read'"])expect(screen).toContain(mapping);
    expect(screen).not.toMatch(/value:\s*['\"](?:--|0)['\"]/);
  });
});
