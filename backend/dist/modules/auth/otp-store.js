import net from 'node:net';
import tls from 'node:tls';
import { env } from '../../config/env.js';
const memoryChallenges = new Map();
const memoryRateLimits = new Map();
const isTestRuntime = () => env.environment.toLowerCase() === 'test' || process.execArgv.some((arg) => arg.includes('--test'));
const challengeKey = (id) => `fiteatsy:otp:challenge:${id}`;
const mobileKey = (mobile) => `fiteatsy:otp:mobile:${mobile}`;
const rateKey = (mobile) => `fiteatsy:otp:rate:${mobile}`;
const encode = (value) => `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
const command = (parts) => `*${parts.length}\r\n${parts.map(encode).join('')}`;
const readRedisReply = (buffer, offset = 0) => {
    const end = buffer.indexOf('\r\n', offset);
    if (end < 0)
        throw new Error('Incomplete Redis response.');
    const prefix = String.fromCharCode(buffer[offset]);
    const line = buffer.subarray(offset + 1, end).toString();
    if (prefix === '+' || prefix === ':' || prefix === '-') {
        if (prefix === '-')
            throw new Error(line);
        return { value: prefix === ':' ? Number(line) : line, offset: end + 2 };
    }
    if (prefix === '$') {
        const length = Number(line);
        if (length < 0)
            return { value: null, offset: end + 2 };
        const start = end + 2;
        return { value: buffer.subarray(start, start + length).toString(), offset: start + length + 2 };
    }
    if (prefix === '*') {
        const count = Number(line);
        const values = [];
        let cursor = end + 2;
        for (let i = 0; i < count; i += 1) {
            const reply = readRedisReply(buffer, cursor);
            values.push(reply.value);
            cursor = reply.offset;
        }
        return { value: values, offset: cursor };
    }
    throw new Error('Unsupported Redis response.');
};
export const redisCommand = async (parts) => {
    const configured = env.redisUrl;
    if (!configured)
        throw new Error('REDIS_URL is required for OTP persistence outside tests.');
    const url = new URL(configured);
    const secure = url.protocol === 'rediss:';
    const socket = (secure ? tls.connect({ host: url.hostname, port: Number(url.port) || 6380 }) : net.connect({ host: url.hostname, port: Number(url.port) || 6379 }));
    const chunks = [];
    const auth = url.password
        ? url.username
            ? command(['AUTH', decodeURIComponent(url.username), decodeURIComponent(url.password)])
            : command(['AUTH', decodeURIComponent(url.password)])
        : '';
    const select = url.pathname && url.pathname !== '/' ? command(['SELECT', url.pathname.slice(1)]) : '';
    const requests = [auth, select, command(parts)].filter(Boolean);
    return await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, value) => {
            if (settled)
                return;
            settled = true;
            socket.destroy();
            error ? reject(error) : resolve(value);
        };
        socket.once('error', (error) => finish(error));
        let cursor = 0;
        const replies = [];
        socket.on('data', (chunk) => {
            chunks.push(Buffer.from(chunk));
            try {
                const buffer = Buffer.concat(chunks);
                while (cursor < buffer.length && replies.length < requests.length) {
                    const reply = readRedisReply(buffer, cursor);
                    replies.push(reply.value);
                    cursor = reply.offset;
                }
                if (replies.length === requests.length)
                    finish(undefined, replies[replies.length - 1]);
            }
            catch (error) {
                if (!(error instanceof Error && error.message === 'Incomplete Redis response.')) {
                    finish(error instanceof Error ? error : new Error(String(error)));
                }
            }
        });
        socket.once(secure ? 'secureConnect' : 'connect', () => {
            socket.write(requests.join(''));
        });
    });
};
export const otpStore = {
    async get(challengeId) {
        if (isTestRuntime())
            return memoryChallenges.get(challengeId) ?? null;
        const value = await redisCommand(['GET', challengeKey(challengeId)]);
        return value ? JSON.parse(String(value)) : null;
    },
    async set(challenge, ttlMs) {
        if (isTestRuntime()) {
            memoryChallenges.set(challenge.challengeId, challenge);
            return;
        }
        await redisCommand(['SET', challengeKey(challenge.challengeId), JSON.stringify(challenge), 'PX', String(ttlMs)]);
    },
    async delete(challengeId) {
        if (isTestRuntime())
            memoryChallenges.delete(challengeId);
        else
            await redisCommand(['DEL', challengeKey(challengeId)]);
    },
    async getActiveId(mobile) {
        if (isTestRuntime()) {
            return Array.from(memoryChallenges.values()).find((item) => item.user.mobileNumber === mobile && !item.verified && item.expiresAtMs >= Date.now())?.challengeId ?? null;
        }
        const value = await redisCommand(['GET', mobileKey(mobile)]);
        return value ? String(value) : null;
    },
    async setActiveId(mobile, challengeId, ttlMs) {
        if (isTestRuntime())
            return;
        await redisCommand(['SET', mobileKey(mobile), challengeId, 'PX', String(ttlMs)]);
    },
    async invalidateMobile(mobile) {
        const id = await otpStore.getActiveId(mobile);
        if (id)
            await otpStore.delete(id);
        if (isTestRuntime()) {
            for (const [key, value] of memoryChallenges)
                if (value.user.mobileNumber === mobile)
                    memoryChallenges.delete(key);
        }
        else
            await redisCommand(['DEL', mobileKey(mobile)]);
    },
    async rateTimestamps(mobile) {
        if (isTestRuntime())
            return memoryRateLimits.get(mobile) ?? [];
        const values = await redisCommand(['LRANGE', rateKey(mobile), '0', '-1']);
        return (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
    },
    async recordRateTimestamp(mobile, timestamp, ttlMs) {
        if (isTestRuntime()) {
            memoryRateLimits.set(mobile, [...(memoryRateLimits.get(mobile) ?? []), timestamp]);
            return;
        }
        await redisCommand(['RPUSH', rateKey(mobile), String(timestamp)]);
        await redisCommand(['PEXPIRE', rateKey(mobile), String(ttlMs)]);
    },
    resetForTests() {
        memoryChallenges.clear();
        memoryRateLimits.clear();
    }
};
