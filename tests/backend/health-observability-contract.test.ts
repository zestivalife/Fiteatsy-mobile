import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../../backend/src/modules/health/health-observability.ts',import.meta.url),'utf8');
test('health API diagnostics exclude clinical values and authenticated identity',()=>{
  assert.match(source,/correlationId/);assert.match(source,/durationMs/);assert.match(source,/statusCode/);
  assert.match(source,/excludes body, query values, account\/client identity, raw/);
  for(const forbidden of ['req.body','req.query','accountId','clientId','accessToken','sourceRecordId'])assert.equal(source.includes(forbidden),false);
});
