import type { HealthSyncStatus, HealthSyncConnectionState } from '../src/services/healthSyncManager';
import { resolveHealthSyncRoute } from '../src/services/healthSyncRouting';

const status = (providerStatus: HealthSyncConnectionState, connected = true): HealthSyncStatus => ({
  fiteatsyClientId:'fixture',overallStatus:providerStatus,lastSyncISO:null,latestMeasurementISO:null,recordsSynced:0,sources:{},
  appleHealth: connected ? {connectionId:'connection-1',connectionAuthority:'DURABLE_CONNECTION',consentStatus:'ACTIVE',status:providerStatus,lastSyncISO:null,latestMeasurementISO:null,recordsSynced:0}
    : {connectionAuthority:'NONE',consentStatus:null,status:'NOT_CONNECTED',lastSyncISO:null,latestMeasurementISO:null,recordsSynced:0},
  healthConnect:{connectionAuthority:'NONE',consentStatus:null,status:'NOT_CONNECTED',lastSyncISO:null,latestMeasurementISO:null,recordsSynced:0}
});

describe('health sync routing', () => {
  test('unresolved state never opens legacy onboarding', () => {
    expect(resolveHealthSyncRoute(null)).toEqual({connectionState:'UNKNOWN',destination:null,ctaLabel:'Checking…'});
  });

  test('only confirmed absence routes to connection onboarding', () => {
    expect(resolveHealthSyncRoute(status('NOT_CONNECTED',false))).toEqual({connectionState:'NEVER_CONNECTED',destination:'SyncWearable',ctaLabel:'Connect'});
  });

  test.each(['CONNECTED','ERROR','INSUFFICIENT_DATA','PARTIAL','NO_DATA','ACTION_REQUIRED','STALE'] as HealthSyncConnectionState[])(
    'persisted provider identity routes %s outcome to the control centre', (outcome) => {
      expect(resolveHealthSyncRoute(status(outcome))).toEqual({connectionState:'CONNECTED',destination:'HealthDataSync',ctaLabel:'Sync'});
    });

  test('observation-inferred legacy identity remains connected', () => {
    const inferred=status('ERROR',false);
    inferred.appleHealth.connectionAuthority='OBSERVATION_INFERRED';
    inferred.appleHealth.consentStatus='ACTIVE';
    expect(resolveHealthSyncRoute(inferred).destination).toBe('HealthDataSync');
  });

  test('explicit withdrawal cannot preserve connected routing', () => {
    const withdrawn=status('ERROR');
    withdrawn.appleHealth.consentStatus='WITHDRAWN';
    expect(resolveHealthSyncRoute(withdrawn).destination).toBe('SyncWearable');
  });
});
