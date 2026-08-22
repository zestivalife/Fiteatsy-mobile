export type CanonicalResourceStatus = 'IDLE' | 'LOADING' | 'READY' | 'NO_DATA' | 'ERROR';

export type CanonicalResourceState = {
  status: CanonicalResourceStatus;
  errorCode: string | null;
};

export type ClientBootstrapState = {
  status: 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
  userId: string | null;
  clientId: string | null;
  profile: CanonicalResourceState;
  nutrition: CanonicalResourceState;
};

export const idleResourceState = (): CanonicalResourceState => ({ status: 'IDLE', errorCode: null });

export const createClientBootstrapState = (): ClientBootstrapState => ({
  status: 'IDLE',
  userId: null,
  clientId: null,
  profile: idleResourceState(),
  nutrition: idleResourceState()
});

const canonicalErrorCode = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

export const resourceErrorCode = (error: unknown) => canonicalErrorCode(error) ?? 'UNKNOWN_ERROR';

export const isCanonicalNoData = (error: unknown) => canonicalErrorCode(error) === 'NOT_FOUND';

export const assertCanonicalIdentity = (input: {
  authenticatedUserId: string;
  sessionUserId: string;
  clientId: string;
}) => {
  if (!input.authenticatedUserId || input.authenticatedUserId !== input.sessionUserId || !input.clientId) {
    throw new Error('CANONICAL_IDENTITY_MISMATCH');
  }
  return { userId: input.authenticatedUserId, clientId: input.clientId };
};

export const settleClientBootstrap = (state: ClientBootstrapState): ClientBootstrapState => ({
  ...state,
  status: state.profile.status === 'ERROR' || state.nutrition.status === 'ERROR' ? 'ERROR' : 'READY'
});
