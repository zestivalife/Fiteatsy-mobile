import { getAuthErrorCode, isTerminalSessionCode } from '../src/services/sessionLifecyclePolicy';

describe('session lifecycle policy', () => {
  it.each(['SESSION_REVOKED', 'SESSION_EXPIRED', 'ACCOUNT_DISABLED'])(
    'hard-closes only explicit terminal evidence: %s',
    (code) => expect(isTerminalSessionCode(code)).toBe(true)
  );

  it.each([undefined, 'INVALID_SESSION', 'AUTH_REQUIRED', 'NETWORK_OFFLINE', 'TIMEOUT'])(
    'preserves local identity for non-terminal evidence: %s',
    (code) => expect(isTerminalSessionCode(code)).toBe(false)
  );

  it('extracts a typed service error without treating arbitrary values as evidence', () => {
    expect(getAuthErrorCode({ code: 'SESSION_EXPIRED' })).toBe('SESSION_EXPIRED');
    expect(getAuthErrorCode(new Error('offline'))).toBeUndefined();
    expect(getAuthErrorCode(null)).toBeUndefined();
  });
});
