const ALLOW_MARKER = 'FITEATSY_ALLOW_DESTRUCTIVE_TEST_RESET';
const SAFE_NAME_PATTERN = /(^|[^a-z0-9])(test|testing|qa|env[\s_-]?c|pre[\s_-]?apk|disposable)([^a-z0-9]|$)/i;
const PRODUCTION_NAME_PATTERN = /(^|[^a-z0-9])(prod|production|live)([^a-z0-9]|$)/i;

type ResetEnvironment = Record<string, string | undefined>;

export type DestructiveResetTarget = {
  environment: string;
  hostname: string;
  database: string;
  targetKind: 'localhost-test' | 'disposable-railway';
};

export class DestructiveTestResetBlockedError extends Error {
  readonly code = 'DESTRUCTIVE_TEST_RESET_BLOCKED';

  constructor(reason: string, details: { environment: string; hostname?: string; database?: string }) {
    const safeDetails = [
      `environment=${details.environment || 'missing'}`,
      `hostname=${details.hostname || 'unavailable'}`,
      `database=${details.database || 'unavailable'}`
    ].join(' ');
    super(`DESTRUCTIVE_TEST_RESET_BLOCKED: ${reason}; ${safeDetails}`);
    this.name = 'DestructiveTestResetBlockedError';
  }
}

const blocked = (
  reason: string,
  details: { environment: string; hostname?: string; database?: string }
): never => {
  throw new DestructiveTestResetBlockedError(reason, details);
};

const parseDatabaseTarget = (databaseUrl: string, environment: string) => {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return blocked('DATABASE_URL is malformed', { environment });
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    return blocked('DATABASE_URL must use PostgreSQL', { environment });
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  let database = '';
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).toLowerCase();
  } catch {
    return blocked('database name is malformed', { environment, hostname });
  }
  if (!hostname || !database || database.includes('/')) {
    return blocked('database target is incomplete', { environment, hostname, database });
  }
  return { hostname, database };
};

export const assertDestructiveTestResetAllowed = (
  source: ResetEnvironment = process.env
): DestructiveResetTarget => {
  const environment = source.NODE_ENV?.trim().toLowerCase() ?? '';
  if (environment !== 'test') {
    return blocked('NODE_ENV must be test', { environment });
  }
  if (source[ALLOW_MARKER]?.trim().toLowerCase() !== 'true') {
    return blocked(`${ALLOW_MARKER}=true is required`, { environment });
  }
  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return blocked('DATABASE_URL is required', { environment });
  }
  const { hostname, database } = parseDatabaseTarget(databaseUrl, environment);
  const designations = [
    source.RAILWAY_PROJECT_NAME,
    source.RAILWAY_ENVIRONMENT_NAME,
    source.RAILWAY_ENVIRONMENT,
    source.FITEATSY_TEST_ENVIRONMENT
  ].filter(Boolean).join(' ');

  if (PRODUCTION_NAME_PATTERN.test(designations) || PRODUCTION_NAME_PATTERN.test(database)) {
    return blocked('production-like database target is forbidden', { environment, hostname, database });
  }
  const localhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (localhost && SAFE_NAME_PATTERN.test(database)) {
    return { environment, hostname, database, targetKind: 'localhost-test' };
  }
  const railwayHost = hostname.endsWith('.railway.internal')
    || hostname.endsWith('.proxy.rlwy.net')
    || hostname.endsWith('.up.railway.app');
  if (railwayHost && SAFE_NAME_PATTERN.test(designations)) {
    return { environment, hostname, database, targetKind: 'disposable-railway' };
  }
  return blocked('database target is not positively identified as disposable', {
    environment,
    hostname,
    database
  });
};
