import net from 'node:net';
import tls from 'node:tls';
import { env } from '../../config/env.js';

type RedisSocket = net.Socket | tls.TLSSocket;

const incomplete = () => new Error('Incomplete Redis response.');
const encode = (value: string) => `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
const command = (parts: string[]) => `*${parts.length}\r\n${parts.map(encode).join('')}`;

export const readExternalRedisReply = (buffer: Buffer, offset = 0): { value: unknown; offset: number } => {
  const end = buffer.indexOf('\r\n', offset);
  if (end < 0) throw incomplete();
  const prefix = String.fromCharCode(buffer[offset]);
  const line = buffer.subarray(offset + 1, end).toString();
  if (prefix === '+' || prefix === ':' || prefix === '-') {
    if (prefix === '-') throw new Error(line);
    return { value: prefix === ':' ? Number(line) : line, offset: end + 2 };
  }
  if (prefix === '$') {
    const length = Number(line);
    if (length < 0) return { value: null, offset: end + 2 };
    const start = end + 2;
    const replyEnd = start + length + 2;
    if (buffer.length < replyEnd) throw incomplete();
    if (buffer[start + length] !== 13 || buffer[start + length + 1] !== 10) throw incomplete();
    return { value: buffer.subarray(start, start + length).toString(), offset: replyEnd };
  }
  if (prefix === '*') {
    const count = Number(line);
    const values: unknown[] = [];
    let cursor = end + 2;
    for (let index = 0; index < count; index += 1) {
      const reply = readExternalRedisReply(buffer, cursor);
      values.push(reply.value);
      cursor = reply.offset;
    }
    return { value: values, offset: cursor };
  }
  throw new Error('Unsupported Redis response.');
};

export const externalReportReviewRedisCommand = async (parts: string[]) => {
  if (!env.redisUrl) throw new Error('REDIS_URL is required for External report review persistence.');
  const url = new URL(env.redisUrl);
  const secure = url.protocol === 'rediss:';
  const socket = (secure
    ? tls.connect({ host: url.hostname, port: Number(url.port) || 6380 })
    : net.connect({ host: url.hostname, port: Number(url.port) || 6379 })) as RedisSocket;
  const auth = url.password
    ? url.username
      ? command(['AUTH', decodeURIComponent(url.username), decodeURIComponent(url.password)])
      : command(['AUTH', decodeURIComponent(url.password)])
    : '';
  const select = url.pathname && url.pathname !== '/' ? command(['SELECT', url.pathname.slice(1)]) : '';
  const requests = [auth, select, command(parts)].filter(Boolean);
  const chunks: Buffer[] = [];
  return await new Promise<unknown>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(value);
    };
    socket.once('error', (error) => finish(error));
    socket.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk));
      try {
        const buffer = Buffer.concat(chunks);
        const replies: unknown[] = [];
        let cursor = 0;
        while (replies.length < requests.length) {
          const reply = readExternalRedisReply(buffer, cursor);
          replies.push(reply.value);
          cursor = reply.offset;
        }
        finish(undefined, replies.at(-1));
      } catch (error) {
        if (!(error instanceof Error && error.message === 'Incomplete Redis response.')) finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.once(secure ? 'secureConnect' : 'connect', () => socket.write(requests.join('')));
  });
};
