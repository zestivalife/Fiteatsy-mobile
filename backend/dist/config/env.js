import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const LOCAL_DATABASE_FALLBACK = 'postgres://postgres:postgres@localhost:5432/nuetra';
const SERVICE_NAME = 'fiteatsy-backend';
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJsonPath = path.join(backendRoot, 'package.json');
const parseBoolean = (value) => /^(1|true|yes|on)$/i.test(value?.trim() ?? '');
const readPackageVersion = () => {
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version?.trim() || '0.0.0';
    }
    catch {
        return '0.0.0';
    }
};
const packageVersion = readPackageVersion();
const readNodeEnv = () => process.env.NODE_ENV?.trim() || '';
const readEnvironmentName = () => process.env.RAILWAY_ENVIRONMENT_NAME?.trim() || process.env.RAILWAY_ENVIRONMENT?.trim() || '';
const isRailwayRuntime = () => Boolean(process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    readEnvironmentName());
const isLocalDevelopmentRuntime = () => {
    const nodeEnv = readNodeEnv().toLowerCase();
    return !isRailwayRuntime() && nodeEnv !== 'production' && nodeEnv !== 'staging';
};
const resolveDatabaseUrl = () => {
    const configured = process.env.DATABASE_URL?.trim();
    if (configured)
        return configured;
    if (isLocalDevelopmentRuntime())
        return LOCAL_DATABASE_FALLBACK;
    throw new Error('DATABASE_URL is required for staging and production runtime startup.');
};
const resolvePort = () => {
    const rawPort = process.env.PORT?.trim();
    if (!rawPort)
        return 4001;
    const parsed = Number(rawPort);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('PORT must be a positive integer when provided.');
    }
    return parsed;
};
const resolveEnvironment = () => readNodeEnv() || readEnvironmentName() || 'development';
const resolveGitCommit = () => process.env.GIT_COMMIT?.trim() ||
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    'unknown';
export const isOtpDebugResponseEnabled = () => {
    if (readNodeEnv().toLowerCase() === 'production')
        return false;
    return parseBoolean(process.env.OTP_DEBUG_RESPONSE_ENABLED);
};
export const isDevelopmentOtpBypassEnabled = () => {
    const nodeEnv = readNodeEnv().toLowerCase();
    return !isRailwayRuntime() && (nodeEnv === '' || nodeEnv === 'development');
};
export const env = {
    get serviceName() {
        return SERVICE_NAME;
    },
    get version() {
        return packageVersion;
    },
    get environment() {
        return resolveEnvironment();
    },
    get gitCommit() {
        return resolveGitCommit();
    },
    get port() {
        return resolvePort();
    },
    get databaseUrl() {
        return resolveDatabaseUrl();
    },
    get openAiApiKey() {
        return process.env.OPENAI_API_KEY?.trim() ?? '';
    },
    get otpDebugResponseEnabled() {
        return isOtpDebugResponseEnabled();
    },
    get developmentOtpBypassEnabled() {
        return isDevelopmentOtpBypassEnabled();
    }
};
