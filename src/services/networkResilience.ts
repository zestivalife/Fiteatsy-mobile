export type NetworkRuntimeState =
  | 'OFFLINE'
  | 'NETWORK_AVAILABLE'
  | 'INTERNET_AVAILABLE'
  | 'BACKEND_REACHABLE'
  | 'AUTH_REQUIRED'
  | 'DEGRADED'
  | 'RECOVERING';

export type NetworkFailureClass = 'DNS_FAILURE' | 'BACKEND_UNREACHABLE' | 'TIMEOUT';

export type NetworkRuntimeSnapshot = {
  state: NetworkRuntimeState;
  transportConnected: boolean | null;
  internetReachable: boolean | null;
  backendReachable: boolean | null;
  failureClass: NetworkFailureClass | null;
  networkType: string;
  changedAtISO: string;
};

type Listener = (snapshot: NetworkRuntimeSnapshot, previous: NetworkRuntimeSnapshot) => void;

const initialSnapshot = (): NetworkRuntimeSnapshot => ({
  state: 'NETWORK_AVAILABLE',
  transportConnected: null,
  internetReachable: null,
  backendReachable: null,
  failureClass: null,
  networkType: 'UNKNOWN',
  changedAtISO: new Date(0).toISOString()
});

let snapshot = initialSnapshot();
const listeners = new Set<Listener>();

const publish = (next: NetworkRuntimeSnapshot) => {
  const previous = snapshot;
  if (JSON.stringify({ ...previous, changedAtISO: '' }) === JSON.stringify({ ...next, changedAtISO: '' })) return;
  snapshot = { ...next, changedAtISO: new Date().toISOString() };
  listeners.forEach((listener) => listener(snapshot, previous));
};

export const getNetworkRuntimeSnapshot = () => snapshot;

export const subscribeNetworkRuntime = (listener: Listener) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const updateNetworkTransport = (input: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  networkType?: string | null;
}) => {
  const networkType = input.networkType?.toUpperCase() || snapshot.networkType;
  if (input.isConnected === false) {
    publish({ ...snapshot, state: 'OFFLINE', transportConnected: false, internetReachable: false,
      backendReachable: false, failureClass: null, networkType });
    return;
  }
  if (input.isInternetReachable === false) {
    publish({ ...snapshot, state: 'DEGRADED', transportConnected: input.isConnected, internetReachable: false,
      backendReachable: false, failureClass: 'BACKEND_UNREACHABLE', networkType });
    return;
  }
  const recovering = snapshot.state === 'OFFLINE' || snapshot.state === 'DEGRADED';
  publish({ ...snapshot, state: recovering ? 'RECOVERING' : input.isInternetReachable === true ? 'INTERNET_AVAILABLE' : 'NETWORK_AVAILABLE',
    transportConnected: input.isConnected, internetReachable: input.isInternetReachable,
    backendReachable: recovering ? null : snapshot.backendReachable, failureClass: null, networkType });
};

export const reportBackendSuccess = () => publish({ ...snapshot, state: 'BACKEND_REACHABLE',
  backendReachable: true, failureClass: null });

export const reportBackendAuthRequired = () => publish({ ...snapshot, state: 'AUTH_REQUIRED',
  backendReachable: true, failureClass: null });

export const reportBackendFailure = (failureClass: NetworkFailureClass) => publish({ ...snapshot,
  state: 'DEGRADED', backendReachable: false, failureClass });

export const resetNetworkRuntimeForTests = () => {
  snapshot = initialSnapshot();
  listeners.clear();
};
