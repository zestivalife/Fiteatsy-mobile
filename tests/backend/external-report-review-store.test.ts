import assert from 'node:assert/strict';
import test from 'node:test';
import { readExternalRedisReply } from '../../backend/src/modules/external-clients/external-report-review-store.js';

test('large External report review payload waits for every Redis bulk-string byte', () => {
  const payload = JSON.stringify({ items: Array.from({ length: 58 }, (_, index) => ({ rowIdentity: `row-${index}`, rawName: `Marker ${index}` })) });
  const response = Buffer.from(`$${Buffer.byteLength(payload)}\r\n${payload}\r\n`);
  const partial = response.subarray(0, 1231);
  assert.throws(() => readExternalRedisReply(partial), /Incomplete Redis response/);
  assert.equal(readExternalRedisReply(response).value, payload);
});

test('External report Redis reader preserves complete arrays and simple replies', () => {
  assert.deepEqual(readExternalRedisReply(Buffer.from('*2\r\n+OK\r\n:58\r\n')).value, ['OK', 58]);
});
