import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../../backend/src/config/env.js';

const keys = ['RELEASE_GIT_COMMIT_SHA', 'RAILWAY_GIT_COMMIT_SHA', 'GIT_COMMIT'] as const;

test('packaged release SHA cannot be overridden by runtime source metadata', () => {
  const packagedRevision = env.gitCommit;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.RELEASE_GIT_COMMIT_SHA = 'release-candidate-sha';
    process.env.RAILWAY_GIT_COMMIT_SHA = 'configured-source-branch-sha';
    process.env.GIT_COMMIT = 'image-build-sha';
    assert.equal(env.gitCommit, packagedRevision);
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('packaged release SHA remains authoritative when runtime metadata is partial', () => {
  const packagedRevision = env.gitCommit;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    delete process.env.RELEASE_GIT_COMMIT_SHA;
    process.env.RAILWAY_GIT_COMMIT_SHA = 'configured-source-branch-sha';
    process.env.GIT_COMMIT = 'image-build-sha';
    assert.equal(env.gitCommit, packagedRevision);
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
