import { redisCommand } from '../auth/otp-store.js';
import { env } from '../../config/env.js';
const memory = new Map();
const isTestRuntime = () => env.environment.toLowerCase() === 'test' || process.execArgv.some((arg) => arg.includes('--test')) || process.argv.some((arg) => arg.includes('--test'));
const keyFor = (operation, key) => `fiteatsy:delegated:idempotency:${operation}:${key}`;
export const executeDelegatedIdempotently = async (input) => {
    const ttlSeconds = 24 * 60 * 60;
    const key = keyFor(input.operation, input.key);
    if (isTestRuntime()) {
        const existing = memory.get(key);
        if (existing && existing.expiresAt > Date.now())
            return { replayed: true, value: existing.value };
        const value = await input.execute();
        memory.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
        return { replayed: false, value };
    }
    if (!env.redisUrl)
        throw new Error('REDIS_URL is required for delegated idempotency.');
    const claimed = await redisCommand(['SET', key, JSON.stringify({ state: 'in_progress' }), 'EX', String(ttlSeconds), 'NX']);
    if (claimed !== 'OK') {
        const prior = await redisCommand(['GET', key]);
        if (prior) {
            const parsed = JSON.parse(String(prior));
            if (parsed.state === 'complete')
                return { replayed: true, value: parsed.value };
        }
        throw Object.assign(new Error('An identical operation is already in progress.'), { status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' });
    }
    try {
        const value = await input.execute();
        await redisCommand(['SET', key, JSON.stringify({ state: 'complete', value }), 'EX', String(ttlSeconds)]);
        return { replayed: false, value };
    }
    catch (error) {
        await redisCommand(['DEL', key]);
        throw error;
    }
};
export const resetDelegatedIdempotencyForTests = () => memory.clear();
