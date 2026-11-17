export type RuntimeReachability = true | false | null;

export type RuntimeNetworkState = {
  transport: string;
  connectionKey: string;
  reachability: RuntimeReachability;
  epoch: number;
};

export type RuntimeNetworkSample = {
  type?: string | null;
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
  details?: unknown;
};

export const initialRuntimeNetworkState = (): RuntimeNetworkState => ({
  transport: 'UNKNOWN',
  connectionKey: 'UNKNOWN',
  reachability: null,
  epoch: 0
});

export const classifyRuntimeReachability = (sample: RuntimeNetworkSample): RuntimeReachability => {
  if (sample.isConnected === false || sample.isInternetReachable === false) return false;
  if (sample.isConnected === true && sample.isInternetReachable === true) return true;
  return null;
};

const connectionKeyFor = (sample: RuntimeNetworkSample, transport: string) => {
  const details = sample.details && typeof sample.details === 'object'
    ? sample.details as Record<string, unknown>
    : {};
  const discriminator = details.ssid ?? details.bssid ?? details.ipAddress ??
    details.carrier ?? details.cellularGeneration ?? '';
  return `${transport}:${String(discriminator)}`;
};

export const transitionRuntimeNetwork = (
  previous: RuntimeNetworkState,
  sample: RuntimeNetworkSample
): { state: RuntimeNetworkState; shouldRecover: boolean } => {
  const transport = sample.type?.toUpperCase() || 'UNKNOWN';
  const connectionKey = connectionKeyFor(sample, transport);
  const reachability = classifyRuntimeReachability(sample);
  const connectionChanged = previous.connectionKey !== 'UNKNOWN' && connectionKey !== previous.connectionKey;
  const shouldRecover = reachability === true && (previous.reachability !== true || connectionChanged);
  return {
    state: {
      transport,
      connectionKey,
      reachability,
      epoch: shouldRecover ? previous.epoch + 1 : previous.epoch
    },
    shouldRecover
  };
};

export const createSingleFlightRecovery = (recover: () => Promise<void>) => {
  let active: Promise<void> | null = null;
  return () => {
    if (active) return active;
    active = recover().finally(() => {
      active = null;
    });
    return active;
  };
};
