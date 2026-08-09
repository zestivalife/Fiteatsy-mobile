import { getIdentityScopedStorageKey, getIdentityStorageSuffix } from '../src/utils/identityScopedStorage';

describe('identity scoped storage keys', () => {
  it('builds keys from authenticated account and client identity', () => {
    expect(
      getIdentityScopedStorageKey('fiteatsy.reportHistory', {
        accountId: 'acct_a',
        fiteatsyClientId: 'fc_a'
      })
    ).toBe('fiteatsy.reportHistory:acct_a:fc_a');
  });

  it('does not fall back to a global key when identity is incomplete', () => {
    expect(getIdentityStorageSuffix({ accountId: 'acct_a' })).toBeNull();
    expect(getIdentityScopedStorageKey('fiteatsy.sessionSignals.v1', null)).toBeNull();
  });

  it('sanitizes key segments before composing persisted storage keys', () => {
    expect(
      getIdentityScopedStorageKey('fiteatsy.platform.syncQueue.v1', {
        userId: 'acct a/../b',
        clientId: 'fc:a'
      })
    ).toBe('fiteatsy.platform.syncQueue.v1:acct_a_.._b:fc_a');
  });
});
