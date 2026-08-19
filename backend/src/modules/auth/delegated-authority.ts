import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { redisCommand } from './otp-store.js';

export type DelegatedAuthority = {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  product: string;
  permissions: string[];
  purpose: string;
  actor_type: string;
  tenant_id?: string;
};

export class DelegatedAuthorityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DelegatedAuthorityError';
  }
}

type ReplayStore = {
  claim(jti: string, expiresAt: number): Promise<boolean>;
};

const replayedJtis = new Map<string, number>();
const memoryReplayStore: ReplayStore = {
  async claim(jti, expiresAt) {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, expiry] of replayedJtis) if (expiry <= now) replayedJtis.delete(key);
    if (replayedJtis.has(jti)) return false;
    replayedJtis.set(jti, expiresAt);
    return true;
  }
};

const redisReplayStore: ReplayStore = {
  async claim(jti, expiresAt) {
    const ttlSeconds = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
    if (!env.redisUrl) throw new DelegatedAuthorityError('CONFIGURATION_ERROR', 'REDIS_URL is required for delegated replay protection.');
    const result = await redisCommand(['SET', `fiteatsy:delegation:jti:${jti}`, '1', 'EX', String(ttlSeconds), 'NX']);
    return result === 'OK';
  }
};

let replayStore: ReplayStore = env.environment.toLowerCase() === 'test' || process.execArgv.some((arg) => arg.includes('--test')) ? memoryReplayStore : redisReplayStore;

export const setDelegatedAuthorityReplayStoreForTests = (store: ReplayStore | null) => {
  replayStore = store ?? memoryReplayStore;
};

export const resetDelegatedAuthorityReplayStoreForTests = () => {
  replayedJtis.clear();
  replayStore = memoryReplayStore;
};

const decodePart = (value: string) => {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new DelegatedAuthorityError('INVALID_TOKEN', 'Delegated authority token is malformed.');
  }
};

const hasPermission = (permissions: unknown, required: string) =>
  Array.isArray(permissions) && permissions.every((item) => typeof item === 'string') && permissions.includes(required);

export const verifyDelegatedAuthority = async (
  token: string,
  requiredPermission: string,
  expectedPurpose: string
): Promise<DelegatedAuthority> => {
  const parts = token.split('.');
  if (parts.length !== 3) throw new DelegatedAuthorityError('INVALID_TOKEN', 'Delegated authority token is malformed.');
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (header.alg !== 'RS256' || header.typ !== 'Zestiva-Delegated-Authority' || header.kid !== env.zestivaDelegationKeyId) {
    throw new DelegatedAuthorityError('INVALID_HEADER', 'Delegated authority token header is not trusted.');
  }
  if (!env.zestivaDelegationPublicKey) throw new DelegatedAuthorityError('CONFIGURATION_ERROR', 'Delegated authority public key is not configured.');
  const validSignature = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    env.zestivaDelegationPublicKey,
    Buffer.from(parts[2], 'base64url')
  );
  if (!validSignature) throw new DelegatedAuthorityError('INVALID_SIGNATURE', 'Delegated authority signature is invalid.');

  const now = Math.floor(Date.now() / 1000);
  const numberClaim = (name: string) => typeof payload[name] === 'number' ? payload[name] as number : null;
  const exp = numberClaim('exp');
  const iat = numberClaim('iat');
  if (payload.iss !== env.zestivaDelegationIssuer) throw new DelegatedAuthorityError('INVALID_ISSUER', 'Delegated authority issuer is not trusted.');
  if (payload.aud !== env.zestivaDelegationAudience) throw new DelegatedAuthorityError('INVALID_AUDIENCE', 'Delegated authority audience is invalid.');
  if (!exp || exp <= now || !iat || iat > now + env.zestivaDelegationClockSkewSeconds) throw new DelegatedAuthorityError('EXPIRED_TOKEN', 'Delegated authority token is expired or has invalid timing.');
  if (payload.product !== 'fiteatsy') throw new DelegatedAuthorityError('INVALID_PRODUCT', 'Delegated authority product binding is invalid.');
  if (payload.purpose !== expectedPurpose) throw new DelegatedAuthorityError('INVALID_PURPOSE', 'Delegated authority purpose binding is invalid.');
  if (typeof payload.sub !== 'string' || !payload.sub.trim()) throw new DelegatedAuthorityError('INVALID_ACTOR', 'Delegated authority actor identity is missing.');
  if (!hasPermission(payload.permissions, requiredPermission)) throw new DelegatedAuthorityError('MISSING_PERMISSION', 'Delegated authority permission is missing.');
  if (typeof payload.jti !== 'string' || !payload.jti.trim()) throw new DelegatedAuthorityError('INVALID_JTI', 'Delegated authority jti is missing.');
  if (!(await replayStore.claim(payload.jti, exp))) throw new DelegatedAuthorityError('REPLAYED_TOKEN', 'Delegated authority token has already been used.');

  return payload as unknown as DelegatedAuthority;
};
