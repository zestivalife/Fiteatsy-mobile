import {
  classifyRuntimeReachability,
  createSingleFlightRecovery,
  initialRuntimeNetworkState,
  transitionRuntimeNetwork
} from '../src/services/networkRuntimeService';

describe('network runtime state machine', () => {
  it('does not treat connected Wi-Fi with unknown internet reachability as online', () => {
    expect(classifyRuntimeReachability({ type: 'wifi', isConnected: true, isInternetReachable: null })).toBeNull();
    expect(classifyRuntimeReachability({ type: 'wifi', isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('recovers on offline-to-online and Wi-Fi-to-cellular transitions only', () => {
    const offline = transitionRuntimeNetwork(initialRuntimeNetworkState(), {
      type: 'wifi', isConnected: true, isInternetReachable: false
    });
    expect(offline.shouldRecover).toBe(false);
    const wifi = transitionRuntimeNetwork(offline.state, {
      type: 'wifi', isConnected: true, isInternetReachable: true
    });
    expect(wifi.shouldRecover).toBe(true);
    const duplicateWifi = transitionRuntimeNetwork(wifi.state, {
      type: 'wifi', isConnected: true, isInternetReachable: true
    });
    expect(duplicateWifi.shouldRecover).toBe(false);
    const cellular = transitionRuntimeNetwork(duplicateWifi.state, {
      type: 'cellular', isConnected: true, isInternetReachable: true
    });
    expect(cellular.shouldRecover).toBe(true);
    expect(cellular.state.epoch).toBe(2);
  });

  it('recovers when the underlying Wi-Fi network or cellular generation changes', () => {
    const firstWifi = transitionRuntimeNetwork(initialRuntimeNetworkState(), {
      type: 'wifi', isConnected: true, isInternetReachable: true, details: { ipAddress: '192.168.1.2' }
    });
    const secondWifi = transitionRuntimeNetwork(firstWifi.state, {
      type: 'wifi', isConnected: true, isInternetReachable: true, details: { ipAddress: '10.0.0.2' }
    });
    expect(secondWifi.shouldRecover).toBe(true);
    const cellular4g = transitionRuntimeNetwork(secondWifi.state, {
      type: 'cellular', isConnected: true, isInternetReachable: true, details: { cellularGeneration: '4g' }
    });
    const cellular5g = transitionRuntimeNetwork(cellular4g.state, {
      type: 'cellular', isConnected: true, isInternetReachable: true, details: { cellularGeneration: '5g' }
    });
    expect(cellular5g.shouldRecover).toBe(true);
  });

  it('coalesces duplicate recovery triggers into one in-flight operation', async () => {
    let release: (() => void) | undefined;
    const recover = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const run = createSingleFlightRecovery(recover);
    const first = run();
    const second = run();
    expect(second).toBe(first);
    expect(recover).toHaveBeenCalledTimes(1);
    release?.();
    await first;
    const third = run();
    release?.();
    await third;
    expect(recover).toHaveBeenCalledTimes(2);
  });
});
