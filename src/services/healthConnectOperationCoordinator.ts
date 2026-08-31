export type HealthConnectOperationState = 'IDLE' | 'CHECKING' | 'REQUESTING_PERMISSION' | 'AWAITING_PERMISSION_RETURN' | 'RECONCILING_PERMISSION' | 'SYNCING' | 'PARTIAL_SUCCESS' | 'SUCCESS' | 'ERROR';

let state: HealthConnectOperationState = 'IDLE';
let activeOperation: Promise<unknown> | null = null;

export const getHealthConnectOperationState = () => state;
export const markHealthConnectAwaitingPermissionReturn = () => { state = 'AWAITING_PERMISSION_RETURN'; };

export const runHealthConnectOperation = async <T>(
  operationState: HealthConnectOperationState,
  operation: () => Promise<T>,
  terminalState: (result: T) => HealthConnectOperationState = () => 'SUCCESS'
): Promise<T> => {
  if (activeOperation) throw new Error('health_connect_operation_in_progress');
  state = operationState;
  const pending = operation();
  activeOperation = pending;
  try {
    const result = await pending;
    state = terminalState(result);
    return result;
  } catch (error) {
    state = 'ERROR';
    throw error;
  } finally {
    activeOperation = null;
    if (state !== 'AWAITING_PERMISSION_RETURN') state = 'IDLE';
  }
};
