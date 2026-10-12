import assert from 'node:assert/strict';
import test from 'node:test';
import { toAuthMeClient } from '../../backend/src/modules/auth/auth.routes.js';

test('auth/me omits the client projection for consultant dashboard bridge accounts', () => {
  assert.equal(toAuthMeClient(undefined), null);
  assert.equal(toAuthMeClient(null), null);
});

test('auth/me preserves the existing client projection for native client accounts', () => {
  const client = {
    fiteatsyClientId: 'fc_0123456789abcdef0123456789abcdef',
    status: 'ACTIVE'
  };

  assert.deepEqual(toAuthMeClient(client as never), client);
});
