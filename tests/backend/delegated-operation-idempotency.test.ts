import assert from 'node:assert/strict';
import test from 'node:test';
import { executeDelegatedIdempotently, resetDelegatedIdempotencyForTests } from '../../backend/src/modules/admin/delegated-operation-idempotency.js';

test.beforeEach(() => resetDelegatedIdempotencyForTests());

test('delegated provisioning retry returns the original result without executing twice', async () => {
  let executions = 0;
  const first = await executeDelegatedIdempotently({
    operation: 'qa_client_provision',
    key: 'retry-key',
    execute: async () => {
      executions += 1;
      return { userId: 'qa-user-1' };
    },
  });
  const retry = await executeDelegatedIdempotently({
    operation: 'qa_client_provision',
    key: 'retry-key',
    execute: async () => {
      executions += 1;
      return { userId: 'qa-user-2' };
    },
  });
  assert.equal(first.replayed, false);
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.value, { userId: 'qa-user-1' });
  assert.equal(executions, 1);
});
