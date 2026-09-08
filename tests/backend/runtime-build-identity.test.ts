import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBuildIdentity } from '../../backend/src/config/build-identity.js';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

test('Railway deployment SHA is the canonical runtime build identity', () => {
  assert.deepEqual(resolveBuildIdentity({ RAILWAY_GIT_COMMIT_SHA: SHA_A }), {
    commitSha: SHA_A,
    identityStatus: 'VERIFIED',
    buildIdentityVersion: 1,
    source: 'RAILWAY_DEPLOYMENT'
  });
});

test('stale mutable GIT_COMMIT cannot override the deployment identity', () => {
  const identity = resolveBuildIdentity({
    GIT_COMMIT: SHA_A,
    RAILWAY_GIT_COMMIT_SHA: SHA_B
  });
  assert.equal(identity.commitSha, SHA_B);
});

test('missing or malformed deployment identity fails closed', () => {
  assert.deepEqual(resolveBuildIdentity({ GIT_COMMIT: SHA_A }), {
    commitSha: null,
    identityStatus: 'UNKNOWN',
    buildIdentityVersion: 1,
    source: null
  });
  assert.equal(resolveBuildIdentity({ RAILWAY_GIT_COMMIT_SHA: 'unknown' }).commitSha, null);
});

test('successive deployment environments cannot retain the previous SHA', () => {
  assert.equal(resolveBuildIdentity({ RAILWAY_GIT_COMMIT_SHA: SHA_A }).commitSha, SHA_A);
  assert.equal(resolveBuildIdentity({ RAILWAY_GIT_COMMIT_SHA: SHA_B }).commitSha, SHA_B);
});
