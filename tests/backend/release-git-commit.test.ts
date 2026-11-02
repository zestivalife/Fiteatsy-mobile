import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../../backend/src/config/env.js';

const keys = ['RELEASE_GIT_COMMIT_SHA', 'RAILWAY_GIT_COMMIT_SHA', 'GIT_COMMIT'] as const;

test('explicit release SHA takes precedence over Railway source metadata', () => {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.RELEASE_GIT_COMMIT_SHA = 'release-candidate-sha';
    process.env.RAILWAY_GIT_COMMIT_SHA = 'configured-source-branch-sha';
    process.env.GIT_COMMIT = 'image-build-sha';
    assert.equal(env.gitCommit, 'release-candidate-sha');
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('source metadata remains the fallback when no release SHA is supplied', () => {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    delete process.env.RELEASE_GIT_COMMIT_SHA;
    process.env.RAILWAY_GIT_COMMIT_SHA = 'configured-source-branch-sha';
    process.env.GIT_COMMIT = 'image-build-sha';
    assert.equal(env.gitCommit, 'configured-source-branch-sha');
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
