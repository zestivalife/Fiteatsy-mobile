import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(__dirname,'..');
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');

describe('canonical health sync architecture',()=>{
  const screen=read('src/screens/sync/CanonicalHealthDataSyncScreen.tsx');
  const coordinator=read('src/services/canonicalHealthSyncCoordinator.ts');
  const adapter=read('src/services/healthPlatformAdapter.ts');
  const manager=read('src/services/healthSyncManager.ts');

  test('screen is a pure coordinator consumer with no native, backend, checkpoint, or legacy imports',()=>{
    expect(screen).toContain('useCanonicalHealthSyncCoordinator');
    for(const forbidden of ['appleHealthService','healthConnectService','healthSyncManager\';','wearablePlatformService','SyncWearableScreen','HealthDataSyncExperience','AppState.addEventListener'])expect(screen).not.toContain(forbidden);
  });

  test('one coordinator owns the only health foreground listener',()=>{
    const files=['src/screens/sync/CanonicalHealthDataSyncScreen.tsx','src/services/canonicalHealthSyncCoordinator.ts'];
    const count=files.reduce((total,file)=>total+(read(file).match(/AppState\.addEventListener/g)?.length??0),0);
    expect(count).toBe(1);
    expect(coordinator).toContain("if (nextState !== 'active') return");
    expect(coordinator).toContain('foregroundRefreshAt.current');
  });

  test('one mounted provider owns the only live provider and metric state authority',()=>{
    const app=read('App.tsx');
    expect(app.match(/<CanonicalHealthSyncProvider>/g)).toHaveLength(1);
    expect(coordinator.match(/useState<HealthProviderState>/g)).toHaveLength(1);
    expect(coordinator.match(/useState<Record<string, HealthMetricQueryState>>/g)).toHaveLength(1);
  });

  test('provider, metric, and upload finite states are separate',()=>{
    expect(read('src/services/healthPlatformAdapter.ts')).toContain("'UNAVAILABLE' | 'AVAILABLE' | 'CONNECTED' | 'ACTION_REQUIRED' | 'ERROR'");
    expect(read('src/services/healthSyncState.ts')).toContain("'IDLE'|'QUERYING'|'DATA_AVAILABLE'|'NO_VISIBLE_DATA'|'ERROR'|'TIMEOUT'|'UPLOAD_PENDING'");
    expect(read('src/services/healthSyncState.ts')).toContain("'IDLE'|'UPLOADING'|'SYNCED'|'PENDING'|'ERROR'");
  });

  test('platform adapters are the only coordinator-facing native source boundary',()=>{
    expect(adapter).toContain('export interface HealthPlatformAdapter');
    expect(adapter).toContain('appleHealthAdapter');
    expect(adapter).toContain('healthConnectAdapter');
    expect(manager).toContain('adapter.queryAllSupportedMetrics');
    expect(manager).not.toContain('syncConnectedHealthApp');
  });

  test('local read and persistence precede backend work, while backend failure preserves local values',()=>{
    expect(manager.indexOf('adapter.queryAllSupportedMetrics')).toBeLessThan(manager.indexOf('beginWearableSyncRun(governed.connectionId'));
    expect(manager.indexOf('persistLocalSyncBatch')).toBeLessThan(manager.indexOf('beginWearableSyncRun(governed.connectionId'));
    expect(manager).toContain('if (payload) throw new HealthSyncUploadPendingError(payload, observations)');
    expect(coordinator).toContain('mergeLocalObservations(error.observations)');
    expect(coordinator.indexOf('access = await adapter.requestAccess()')).toBeLessThan(coordinator.indexOf('await acceptWearableConsent'));
    expect(coordinator).toContain("setUploadState('PENDING')");
  });

  test('available metric count derives only from metric data state',()=>{
    expect(coordinator).toContain("metric.queryState === 'DATA_AVAILABLE'");
    expect(coordinator).not.toContain("metric.queryState === 'DATA_AVAILABLE' ||");
    expect(screen).toContain('{health.availableMetricCount}');
    expect(screen).not.toContain('recordsAvailable');
  });

  test('connected rendering cannot simultaneously show connecting or global checking',()=>{
    expect(screen).not.toContain('Connecting to Apple Health');
    expect(screen).not.toContain('Checking your health connection');
    expect(screen).not.toContain('<ActivityIndicator');
  });

  test('one native module registration remains for iOS',()=>{
    const registrations=fs.readdirSync(path.join(root,'modules')).filter(name=>/healthkit/i.test(name));
    expect(registrations).toEqual(['fiteatsy-healthkit']);
    expect(read('modules/fiteatsy-healthkit/expo-module.config.json')).toContain('FiteatsyHealthKitModule');
  });

  test('legacy installation and foreground keys are migrated into the canonical store',()=>{
    const store=read('src/services/healthSyncLocalStore.ts');
    expect(store).toContain("@fiteatsy/health-sync-local-v${STORE_VERSION}:installation-id");
    expect(store).toContain("'@fiteatsy/wearable-installation-id'");
    expect(store).toContain("'@fiteatsy/wearable-last-foreground-sync'");
    expect(store).toContain('AsyncStorage.multiRemove([...LEGACY_KEYS])');
  });

  test('Home, Tracker, diagnostics, and connected metrics use the canonical authority',()=>{
    const home=read('src/screens/home/HomeScreen.tsx');
    const tracker=read('src/screens/home/TrackerScreen.tsx');
    const debug=read('src/screens/sync/CanonicalHealthSyncDebugScreen.tsx');
    const connected=read('src/screens/sync/CanonicalConnectedMetricsScreen.tsx');
    const appContext=read('src/state/AppContext.tsx');
    expect(home).toContain('useCanonicalHealthSyncCoordinator');
    expect(home).not.toContain('HealthSyncStatus');
    expect(home).not.toContain('getHealthSyncStatus');
    expect(tracker).toContain('useCanonicalHealthSyncCoordinator');
    expect(tracker).not.toContain('wearableSyncData');
    expect(debug).toContain('health.syncLocalMetrics()');
    expect(debug).not.toContain('runHealthSync');
    expect(connected).toContain('useCanonicalHealthSyncCoordinator');
    expect(connected).not.toContain('wearableSyncData');
    expect(appContext).not.toContain('wearableSyncData');
    expect(appContext).not.toContain('addWearableSyncData');
  });

  test('onboarding metadata cannot define live provider state',()=>{
    expect(coordinator).not.toContain('wearableSetupCompleted');
    expect(coordinator).not.toContain('wearablePreference');
    const ready=read('src/screens/onboarding/OnboardingReadyScreen.tsx');
    expect(ready).not.toContain("status={healthConnected ? 'Connected'");
  });

  test('Health Connect has adapter sequencing but no duplicate operation-state authority',()=>{
    expect(fs.existsSync(path.join(root,'src/services/healthConnectOperationCoordinator.ts'))).toBe(false);
    expect(adapter).toContain('serializeHealthConnect');
    expect(adapter).not.toContain("'CHECKING'");
    expect(adapter).not.toContain("'SYNCING'");
  });
});
