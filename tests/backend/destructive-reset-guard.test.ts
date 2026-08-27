import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDestructiveTestResetAllowed,
  DestructiveTestResetBlockedError
} from '../../backend/src/test-support/destructive-reset-guard.js';

const marker = { FITEATSY_ALLOW_DESTRUCTIVE_TEST_RESET: 'true' };
const productionUrl = 'postgresql://user:secret@postgres-production.railway.internal:5432/railway';
const safeLocalUrl = 'postgresql://user:secret@localhost:5432/fiteatsy_test';
const safeRailwayUrl = 'postgresql://user:secret@reseau.proxy.rlwy.net:10407/railway';

const expectBlocked = (environment: Record<string, string | undefined>) => {
  assert.throws(
    () => assertDestructiveTestResetAllowed(environment),
    (error: unknown) => {
      assert.ok(error instanceof DestructiveTestResetBlockedError);
      assert.equal(error.code, 'DESTRUCTIVE_TEST_RESET_BLOCKED');
      assert.equal(error.message.includes('secret'), false);
      return true;
    }
  );
};

test('denies production environment and production database before reset SQL', () => {
  expectBlocked({ NODE_ENV: 'production', DATABASE_URL: productionUrl, ...marker });
});

test('denies test environment pointed at production even with marker', () => {
  expectBlocked({ NODE_ENV: 'test', DATABASE_URL: productionUrl, ...marker });
});

test('denies unknown, malformed, missing, and incomplete database targets', () => {
  expectBlocked({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://db.example.com/app', ...marker });
  expectBlocked({ NODE_ENV: 'test', DATABASE_URL: 'not-a-url', ...marker });
  expectBlocked({ NODE_ENV: 'test', ...marker });
  expectBlocked({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost', ...marker });
});

test('denies a safe local test database when the acknowledgement marker is absent', () => {
  expectBlocked({ NODE_ENV: 'test', DATABASE_URL: safeLocalUrl });
});

test('allows a safe local test database only with test environment and marker', () => {
  assert.deepEqual(
    assertDestructiveTestResetAllowed({ NODE_ENV: 'test', DATABASE_URL: safeLocalUrl, ...marker }),
    { environment: 'test', hostname: 'localhost', database: 'fiteatsy_test', targetKind: 'localhost-test' }
  );
});

test('allows a named disposable ENV-C Railway target with marker', () => {
  const target = assertDestructiveTestResetAllowed({
    NODE_ENV: 'test', DATABASE_URL: safeRailwayUrl,
    RAILWAY_PROJECT_NAME: 'fiteatsy-preapk-env-c-20260827', RAILWAY_ENVIRONMENT_NAME: 'test', ...marker
  });
  assert.equal(target.targetKind, 'disposable-railway');
});

test('marker never overrides production designation, encoding, or hostname suffix tricks', () => {
  expectBlocked({
    NODE_ENV: 'test', DATABASE_URL: safeRailwayUrl,
    RAILWAY_PROJECT_NAME: 'fiteatsy-preapk-env-c', RAILWAY_ENVIRONMENT_NAME: 'production', ...marker
  });
  expectBlocked({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost:5432/%70roduction', ...marker });
  expectBlocked({
    NODE_ENV: 'test', DATABASE_URL: 'postgresql://railway.internal.attacker.example/fiteatsy_test', ...marker
  });
});

test('direct reset helper invocation rejects an unsafe target before database access', async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    FITEATSY_ALLOW_DESTRUCTIVE_TEST_RESET: process.env.FITEATSY_ALLOW_DESTRUCTIVE_TEST_RESET
  };
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = productionUrl;
  process.env.FITEATSY_ALLOW_DESTRUCTIVE_TEST_RESET = 'true';
  try {
    const { resetBackendStateForTests } = await import('../../backend/src/test-support/reset.js');
    await assert.rejects(
      resetBackendStateForTests,
      (error: unknown) => (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'DESTRUCTIVE_TEST_RESET_BLOCKED'
      )
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
