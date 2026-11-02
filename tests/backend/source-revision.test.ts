import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readPackagedSourceRevision,
  validateSourceRevision,
  verifyPackagedSourceRevision
} from '../../backend/src/config/source-revision.js';

const VALID_SHA = '9877c1c8465abe1f42d03aa35881c39f109bcfdb';
const OTHER_SHA = '6ab7c51c82c7977d21ebed03fd29b7d7bbd73a12';

test('accepts an exact full hexadecimal source revision', () => {
  assert.equal(validateSourceRevision(`${VALID_SHA}\n`), VALID_SHA);
});

test('rejects missing and malformed source revisions', () => {
  assert.throws(() => validateSourceRevision(''), /exactly 40 hexadecimal/);
  assert.throws(() => validateSourceRevision(VALID_SHA.slice(0, 12)), /exactly 40 hexadecimal/);
  assert.throws(() => validateSourceRevision(`${VALID_SHA.slice(0, 39)}z`), /exactly 40 hexadecimal/);
});

test('fails when packaged revision metadata is missing', () => {
  const missing = path.join(os.tmpdir(), `missing-source-revision-${process.pid}`);
  assert.throws(() => readPackagedSourceRevision(missing), /is missing/);
});

test('reads valid packaged revision metadata', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'source-revision-'));
  const revision = path.join(directory, '.source-revision');
  fs.writeFileSync(revision, `${VALID_SHA}\n`);
  try {
    assert.equal(readPackagedSourceRevision(revision), VALID_SHA);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects stale or mismatched packaged metadata', () => {
  assert.throws(
    () => verifyPackagedSourceRevision(OTHER_SHA, VALID_SHA),
    /does not match expected revision/
  );
  assert.equal(verifyPackagedSourceRevision(VALID_SHA, VALID_SHA), VALID_SHA);
});
