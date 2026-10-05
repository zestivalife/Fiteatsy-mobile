export const EXTERNAL_SIGNUP_STATES = [
  'STARTED',
  'OTP_PENDING',
  'MOBILE_VERIFIED',
  'REGISTRATION_ACCEPTED',
  'ACCOUNT_CREATED',
  'TENANT_CREATED',
  'PROFILE_PENDING',
  'ONBOARDING_IN_PROGRESS',
  'READY',
  'OTP_EXPIRED',
  'BLOCKED',
  'SUSPENDED',
  'CANCELLED',
] as const;

export type ExternalSignupState = typeof EXTERNAL_SIGNUP_STATES[number];

const terminalStates = new Set<ExternalSignupState>(['BLOCKED', 'SUSPENDED', 'CANCELLED']);

const transitions: Readonly<Record<ExternalSignupState, readonly ExternalSignupState[]>> = {
  STARTED: ['OTP_PENDING', 'BLOCKED', 'CANCELLED'],
  OTP_PENDING: ['MOBILE_VERIFIED', 'OTP_EXPIRED', 'BLOCKED', 'CANCELLED'],
  MOBILE_VERIFIED: ['ACCOUNT_CREATED', 'BLOCKED', 'SUSPENDED', 'CANCELLED'],
  REGISTRATION_ACCEPTED: ['ACCOUNT_CREATED', 'BLOCKED', 'SUSPENDED', 'CANCELLED'],
  ACCOUNT_CREATED: ['TENANT_CREATED', 'BLOCKED', 'SUSPENDED', 'CANCELLED'],
  TENANT_CREATED: ['PROFILE_PENDING', 'BLOCKED', 'SUSPENDED', 'CANCELLED'],
  PROFILE_PENDING: ['ONBOARDING_IN_PROGRESS', 'BLOCKED', 'SUSPENDED', 'CANCELLED'],
  ONBOARDING_IN_PROGRESS: ['READY', 'BLOCKED', 'SUSPENDED', 'CANCELLED'],
  READY: ['SUSPENDED', 'BLOCKED'],
  OTP_EXPIRED: ['OTP_PENDING', 'CANCELLED'],
  BLOCKED: [],
  SUSPENDED: [],
  CANCELLED: [],
};

export class InvalidExternalSignupTransitionError extends Error {
  readonly code = 'INVALID_SIGNUP_TRANSITION';
  readonly status = 409;

  constructor(from: ExternalSignupState, to: ExternalSignupState) {
    super(`External signup cannot transition from ${from} to ${to}.`);
    this.name = 'InvalidExternalSignupTransitionError';
  }
}

export const canTransitionExternalSignup = (from: ExternalSignupState, to: ExternalSignupState) =>
  from === to || transitions[from].includes(to);

export const assertExternalSignupTransition = (from: ExternalSignupState, to: ExternalSignupState) => {
  if (!canTransitionExternalSignup(from, to)) throw new InvalidExternalSignupTransitionError(from, to);
};

export const isExternalSignupTerminal = (state: ExternalSignupState) => terminalStates.has(state);
