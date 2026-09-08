import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBuildIdentity } from '../../backend/src/config/build-identity.js';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const packaged = (commitSha: string) => ({ commitSha, builtAt: '2026-09-08T18:30:00.000Z', identitySource: 'PACKAGED_BUILD' });

test('Railway deployment SHA is the canonical runtime build identity', () => {
  assert.deepEqual(resolveBuildIdentity({ RAILWAY_GIT_COMMIT_SHA: SHA_A }, null), {
    commitSha: SHA_A,
    identityStatus: 'RAILWAY_GIT',
    buildIdentityVersion: 1,
    source: 'RAILWAY_GIT',
    builtAt: null,
    identityError: null
  });
});

test('CLI upload resolves immutable packaged identity without Railway Git metadata', () => {
  const identity = resolveBuildIdentity({}, packaged(SHA_A));
  assert.equal(identity.commitSha, SHA_A);
  assert.equal(identity.identityStatus, 'PACKAGED_BUILD');
  assert.equal(identity.builtAt, '2026-09-08T18:30:00.000Z');
});

test('stale mutable GIT_COMMIT cannot override the deployment identity', () => {
  const identity = resolveBuildIdentity({
    GIT_COMMIT: SHA_A,
    RAILWAY_GIT_COMMIT_SHA: SHA_B
  }, packaged(SHA_B));
  assert.equal(identity.commitSha, SHA_B);
});

test('missing or malformed deployment identity fails closed', () => {
  assert.deepEqual(resolveBuildIdentity({ GIT_COMMIT: SHA_A }, null), {
    commitSha: null,
    identityStatus: 'UNKNOWN',
    buildIdentityVersion: 1,
    source: null,
    builtAt: null,
    identityError: null
  });
  assert.equal(resolveBuildIdentity({ RAILWAY_GIT_COMMIT_SHA: 'unknown' }, null).commitSha, null);
});

test('packaged and Railway identity conflict fails closed', () => {
  const identity = resolveBuildIdentity({ RAILWAY_GIT_COMMIT_SHA: SHA_B }, packaged(SHA_A));
  assert.equal(identity.commitSha, null);
  assert.equal(identity.identityStatus, 'UNKNOWN');
  assert.equal(identity.identityError, 'BUILD_IDENTITY_MISMATCH');
});

test('successive deployment environments cannot retain the previous SHA', () => {
  assert.equal(resolveBuildIdentity({}, packaged(SHA_A)).commitSha, SHA_A);
  assert.equal(resolveBuildIdentity({}, packaged(SHA_B)).commitSha, SHA_B);
});
