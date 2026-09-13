import type { HealthSyncStatus, HealthSyncConnectionState } from '../src/services/healthSyncManager';
import { deriveHealthProviderState, providerStatusCopy } from '../src/services/healthSyncState';

const status = (providerStatus: HealthSyncConnectionState, connected = true): HealthSyncStatus => ({
  fiteatsyClientId:'fixture',overallStatus:providerStatus,lastSyncISO:null,latestMeasurementISO:null,recordsSynced:0,sources:{},
  appleHealth: connected ? {connectionId:'connection-1',connectionAuthority:'DURABLE_CONNECTION',consentStatus:'ACTIVE',status:providerStatus,lastSyncISO:null,latestMeasurementISO:null,recordsSynced:0}
    : {connectionAuthority:'NONE',consentStatus:null,status:'NOT_CONNECTED',lastSyncISO:null,latestMeasurementISO:null,recordsSynced:0},
  healthConnect:{connectionAuthority:'NONE',consentStatus:null,status:'NOT_CONNECTED',lastSyncISO:null,latestMeasurementISO:null,recordsSynced:0}
});

describe('canonical health provider state', () => {
  test('unresolved backend state leaves a locally supported provider available', () => {
    expect(deriveHealthProviderState(null, 'APPLE_HEALTH')).toBe('AVAILABLE');
  });

  test('only confirmed absence routes to connection onboarding', () => {
    expect(deriveHealthProviderState(status('NOT_CONNECTED',false), 'APPLE_HEALTH')).toBe('AVAILABLE');
  });

  test.each(['CONNECTED','ERROR','INSUFFICIENT_DATA','PARTIAL','NO_DATA','ACTION_REQUIRED','STALE'] as HealthSyncConnectionState[])(
    'persisted provider identity routes %s outcome to the control centre', (outcome) => {
      expect(deriveHealthProviderState(status(outcome), 'APPLE_HEALTH')).toBe('CONNECTED');
    });

  test('observation-inferred legacy identity remains connected', () => {
    const inferred=status('ERROR',false);
    inferred.appleHealth.connectionAuthority='OBSERVATION_INFERRED';
    inferred.appleHealth.consentStatus='ACTIVE';
    expect(deriveHealthProviderState(inferred, 'APPLE_HEALTH')).toBe('CONNECTED');
  });

  test('explicit withdrawal cannot preserve connected routing', () => {
    const withdrawn=status('ERROR');
    withdrawn.appleHealth.consentStatus='WITHDRAWN';
    expect(deriveHealthProviderState(withdrawn, 'APPLE_HEALTH')).toBe('AVAILABLE');
  });

  test('provider copy cannot render connecting or checking for connected state', () => {
    expect(providerStatusCopy('CONNECTED')).toBe('Connected');
    expect(providerStatusCopy('CONNECTED')).not.toMatch(/Connecting|Checking/);
  });
});
