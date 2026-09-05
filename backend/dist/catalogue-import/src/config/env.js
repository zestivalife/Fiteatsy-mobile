import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const LOCAL_DATABASE_FALLBACK = 'postgres://postgres:postgres@localhost:5432/nuetra';
const SERVICE_NAME = 'fiteatsy-backend';
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJsonPath = path.join(backendRoot, 'package.json');
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
    get documentIntelligenceProvider() {
        return process.env.DOCUMENT_INTELLIGENCE_PROVIDER?.trim().toLowerCase() ?? '';
    },
    get openAiVisionModel() {
        return process.env.OPENAI_VISION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
    },
    get pingmateApiKey() {
        return process.env.PINGMATE_API_KEY?.trim() ?? '';
    },
    get pingmateBaseUrl() {
        return process.env.PINGMATE_BASE_URL?.trim() || 'https://api.pingmate.app/api/v1';
    },
    get redisUrl() {
        return process.env.REDIS_URL?.trim() || process.env.REDIS_PRIVATE_URL?.trim() || '';
    },
    get zestivaDelegationPublicKey() {
        return process.env.ZESTIVA_DELEGATION_PUBLIC_KEY?.replace(/\\n/g, '\n').trim() ?? '';
    },
    get zestivaDelegationKeyId() {
        return process.env.ZESTIVA_DELEGATION_KEY_ID?.trim() ?? '';
    },
    get zestivaDelegationIssuer() {
        return process.env.ZESTIVA_DELEGATION_ISSUER?.trim() || 'zestiva-platform';
    },
    get zestivaDelegationAudience() {
        return process.env.ZESTIVA_DELEGATION_AUDIENCE?.trim() || 'fiteatsy-backend';
    },
    get zestivaDelegationClockSkewSeconds() {
        const parsed = Number(process.env.ZESTIVA_DELEGATION_CLOCK_SKEW_SECONDS?.trim() || 5);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
    },
    get pingmateTemplate() {
        return process.env.PINGMATE_TEMPLATE?.trim() || 'auth_otp';
    },
    get pingmateLanguage() {
        return process.env.PINGMATE_LANGUAGE?.trim() || 'en';
    },
    get initialAdminPhone() {
        return process.env.INITIAL_ADMIN_PHONE?.trim() || '';
    },
    get razorpayKeyId() {
        return process.env.RAZORPAY_KEY_ID?.trim() ?? '';
    },
    get razorpayKeySecret() {
        return process.env.RAZORPAY_KEY_SECRET?.trim() ?? '';
    },
    get razorpayWebhookSecret() {
        return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? '';
    },
    get subscriptionExpiryWarningDays() {
        const parsed = Number(process.env.SUBSCRIPTION_EXPIRY_WARNING_DAYS?.trim() || 7);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
    },
};
