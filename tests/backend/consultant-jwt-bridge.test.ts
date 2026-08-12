import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  getConsultantDashboardJwtDiagnostics,
  getConsultantDashboardJwtSecretSources,
  isValidConsultantDashboardBridgePayload,
  verifyConsultantDashboardJwt
} from '../../backend/src/modules/auth/auth.repository.js';

const trackedEnvKeys = [
  'CONSULTANT_DASHBOARD_JWT_SECRET_KEYS',
  'CONSULTANT_DASHBOARD_JWT_SECRET_KEY',
  'CONSULTANT_DASHBOARD_JWT_SECRET',
  'AUTH_SERVICE_JWT_SECRET_KEY',
  'AUTH_SERVICE_JWT_SECRET',
  'API_GATEWAY_JWT_SECRET_KEY',
  'API_GATEWAY_JWT_SECRET',
  'JWT_SECRET_KEY',
  'JWT_SECRET'
];

const originalEnv = Object.fromEntries(trackedEnvKeys.map((key) => [key, process.env[key]]));

const restoreEnv = () => {
  for (const key of trackedEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const clearEnv = () => {
  for (const key of trackedEnvKeys) {
    delete process.env[key];
  }
};

const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url');

const signJwt = ({
  secret,
  algorithm = 'HS256',
  payload
}: {
  secret: string;
  algorithm?: 'HS256' | 'HS384' | 'HS512';
  payload: Record<string, unknown>;
}) => {
  const digest = algorithm === 'HS512' ? 'sha512' : algorithm === 'HS384' ? 'sha384' : 'sha256';
  const header = encode({ alg: algorithm, typ: 'JWT' });
  const body = encode(payload);
  const signature = crypto.createHmac(digest, secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};

test.afterEach(() => {
  restoreEnv();
});

test('consultant bridge verifies auth-service signed dashboard access tokens', () => {
  clearEnv();
  process.env.CONSULTANT_DASHBOARD_JWT_SECRET_KEY = 'stale-fiteatsy-secret';
  process.env.AUTH_SERVICE_JWT_SECRET_KEY = 'auth-service-production-secret';
  const token = signJwt({
    secret: 'auth-service-production-secret',
    payload: {
      sub: '14848d83-8a39-4674-90f9-13909e0bd728',
      role: 'consultant',
      status: 'ACTIVE',
      credential_status: 'PERMANENT',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 600
    }
  });

  const result = verifyConsultantDashboardJwt(token);

  assert.equal(result.expiryResult, 'valid');
  assert.equal(result.matchedSecretSource, 'AUTH_SERVICE_JWT_SECRET_KEY');
  assert.equal(result.payload?.sub, '14848d83-8a39-4674-90f9-13909e0bd728');
});

test('consultant bridge verifies api-gateway signed dashboard access tokens', () => {
  clearEnv();
  process.env.API_GATEWAY_JWT_SECRET_KEY = 'gateway-production-secret';
  const token = signJwt({
    secret: 'gateway-production-secret',
    algorithm: 'HS512',
    payload: {
      sub: 'gateway-user',
      role: 'consultant',
      status: 'ACTIVE',
      credential_status: 'PERMANENT',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 600
    }
  });

  const result = verifyConsultantDashboardJwt(token);

  assert.equal(result.expiryResult, 'valid');
  assert.equal(result.matchedSecretSource, 'API_GATEWAY_JWT_SECRET_KEY');
  assert.equal(result.payload?.sub, 'gateway-user');
});

test('consultant bridge rejects tokens signed with unknown secrets', () => {
  clearEnv();
  process.env.AUTH_SERVICE_JWT_SECRET_KEY = 'expected-secret';
  const token = signJwt({
    secret: 'wrong-secret',
    payload: {
      sub: 'consultant-user',
      role: 'consultant',
      status: 'ACTIVE',
      credential_status: 'PERMANENT',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 600
    }
  });

  const result = verifyConsultantDashboardJwt(token);

  assert.equal(result.expiryResult, 'invalid_signature');
  assert.equal(result.matchedSecretSource, null);
});

test('consultant bridge de-duplicates identical configured secrets', () => {
  clearEnv();
  process.env.CONSULTANT_DASHBOARD_JWT_SECRET_KEY = 'same-secret';
  process.env.JWT_SECRET_KEY = 'same-secret';

  assert.deepEqual(
    getConsultantDashboardJwtSecretSources().map((item) => item.source),
    ['CONSULTANT_DASHBOARD_JWT_SECRET_KEY']
  );
});

test('consultant bridge tolerates accidentally quoted Railway secret values', () => {
  clearEnv();
  process.env.AUTH_SERVICE_JWT_SECRET_KEY = '"auth-service-production-secret"';
  const token = signJwt({
    secret: 'auth-service-production-secret',
    payload: {
      sub: 'quoted-secret-user',
      role: 'consultant',
      status: 'ACTIVE',
      credential_status: 'PERMANENT',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 600
    }
  });

  const result = verifyConsultantDashboardJwt(token);

  assert.equal(result.expiryResult, 'valid');
  assert.equal(result.matchedSecretSource, 'AUTH_SERVICE_JWT_SECRET_KEY:unquoted');
});

test('consultant bridge tolerates Railway secrets copied with internal whitespace', () => {
  clearEnv();
  process.env.AUTH_SERVICE_JWT_SECRET_KEY = 'auth-service-production-\nsecret';
  const token = signJwt({
    secret: 'auth-service-production-secret',
    payload: {
      sub: 'wrapped-secret-user',
      role: 'consultant',
      status: 'ACTIVE',
      credential_status: 'PERMANENT',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 600
    }
  });

  const result = verifyConsultantDashboardJwt(token);

  assert.equal(result.expiryResult, 'valid');
  assert.equal(result.matchedSecretSource, 'AUTH_SERVICE_JWT_SECRET_KEY:compact_whitespace');
});

test('consultant bridge accepts dashboard access token claim aliases', () => {
  clearEnv();
  process.env.AUTH_SERVICE_JWT_SECRET_KEY = 'auth-service-production-secret';
  const token = signJwt({
    secret: 'auth-service-production-secret',
    payload: {
      sub: 'alias-user',
      user_role: 'consultant',
      account_status: 'ACTIVE',
      credentialStatus: 'PERMANENT',
      tokenType: 'access',
      exp: Math.floor(Date.now() / 1000) + 600
    }
  });

  const result = verifyConsultantDashboardJwt(token);
  const diagnostics = getConsultantDashboardJwtDiagnostics(token, result);

  assert.equal(result.expiryResult, 'valid');
  assert.equal(diagnostics.role, 'consultant');
  assert.equal(diagnostics.status, 'ACTIVE');
  assert.equal(diagnostics.credentialStatus, 'PERMANENT');
  assert.equal(diagnostics.tokenType, 'access');
  assert.equal(isValidConsultantDashboardBridgePayload({
    expiryResult: result.expiryResult,
    userId: String(result.payload?.sub),
    role: diagnostics.role,
    status: diagnostics.status,
    credentialStatus: diagnostics.credentialStatus,
    tokenType: diagnostics.tokenType
  }), true);
});

test('consultant bridge accepts access tokens and rejects refresh tokens for dashboard API access', () => {
  clearEnv();
  process.env.AUTH_SERVICE_JWT_SECRET_KEY = 'auth-service-production-secret';
  const accessToken = signJwt({
    secret: 'auth-service-production-secret',
    payload: {
      sub: 'access-user',
      role: 'consultant',
      status: 'ACTIVE',
      credential_status: 'PERMANENT',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 600
    }
  });
  const refreshToken = signJwt({
    secret: 'auth-service-production-secret',
    payload: {
      sub: 'refresh-user',
      role: 'consultant',
      status: 'ACTIVE',
      credential_status: 'PERMANENT',
      type: 'refresh',
      exp: Math.floor(Date.now() / 1000) + 600
    }
  });

  const access = verifyConsultantDashboardJwt(accessToken);
  const refresh = verifyConsultantDashboardJwt(refreshToken);

  assert.equal(isValidConsultantDashboardBridgePayload({
    expiryResult: access.expiryResult,
    userId: String(access.payload?.sub),
    role: String(access.payload?.role).toLowerCase(),
    status: String(access.payload?.status).toUpperCase(),
    credentialStatus: String(access.payload?.credential_status).toUpperCase(),
    tokenType: String(access.payload?.type).toLowerCase()
  }), true);
  assert.equal(isValidConsultantDashboardBridgePayload({
    expiryResult: refresh.expiryResult,
    userId: String(refresh.payload?.sub),
    role: String(refresh.payload?.role).toLowerCase(),
    status: String(refresh.payload?.status).toUpperCase(),
    credentialStatus: String(refresh.payload?.credential_status).toUpperCase(),
    tokenType: String(refresh.payload?.type).toLowerCase()
  }), false);
});
