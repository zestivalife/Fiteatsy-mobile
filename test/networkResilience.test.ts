import {
  getNetworkRuntimeSnapshot,
  reportBackendAuthRequired,
  reportBackendFailure,
  reportBackendSuccess,
  resetNetworkRuntimeForTests,
  subscribeNetworkRuntime,
  updateNetworkTransport
} from '../src/services/networkResilience';

describe('canonical network resilience state machine', () => {
  beforeEach(() => resetNetworkRuntimeForTests());

  it('moves through offline, recovering, and backend reachable', () => {
    const states: string[] = [];
    const unsubscribe = subscribeNetworkRuntime((next) => states.push(next.state));
    updateNetworkTransport({ isConnected: false, isInternetReachable: false, networkType: 'wifi' });
    updateNetworkTransport({ isConnected: true, isInternetReachable: true, networkType: 'cellular' });
    reportBackendSuccess();
    unsubscribe();
    expect(states).toEqual(['OFFLINE', 'RECOVERING', 'BACKEND_REACHABLE']);
    expect(getNetworkRuntimeSnapshot()).toMatchObject({
      state: 'BACKEND_REACHABLE', networkType: 'CELLULAR', backendReachable: true
    });
  });

  it('distinguishes degraded internet, backend timeout, and authentication requirements', () => {
    updateNetworkTransport({ isConnected: true, isInternetReachable: false, networkType: 'wifi' });
    expect(getNetworkRuntimeSnapshot()).toMatchObject({ state: 'DEGRADED', failureClass: 'BACKEND_UNREACHABLE' });
    reportBackendFailure('TIMEOUT');
    expect(getNetworkRuntimeSnapshot()).toMatchObject({ state: 'DEGRADED', failureClass: 'TIMEOUT' });
    reportBackendAuthRequired();
    expect(getNetworkRuntimeSnapshot()).toMatchObject({ state: 'AUTH_REQUIRED', backendReachable: true });
  });
});
