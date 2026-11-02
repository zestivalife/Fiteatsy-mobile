import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repositoryRoot = path.resolve(backendRoot, '..');
export const revisionPath = path.join(backendRoot, '.source-revision');

export const validateRevision = (value, label) => {
  const revision = String(value ?? '').trim().toLowerCase();
  if (!FULL_GIT_SHA_PATTERN.test(revision)) {
    throw new Error(`${label} must be exactly 40 hexadecimal characters.`);
  }
  return revision;
};

export const resolveGitHead = (cwd = repositoryRoot) => {
  let output;
  try {
    output = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch {
    throw new Error('Unable to establish Git HEAD for source provenance.');
  }
  return validateRevision(output, 'Git HEAD');
};

export const readRevisionFile = (filePath = revisionPath) => {
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Source revision metadata is missing at ${filePath}.`);
  }
  return validateRevision(contents, 'Packaged source revision');
};

export const verifyRevision = (actual, expected) => {
  const packaged = validateRevision(actual, 'Packaged source revision');
  const required = validateRevision(expected, 'Expected source revision');
  if (packaged !== required) {
    throw new Error(`Packaged source revision ${packaged} does not match expected revision ${required}.`);
  }
  return packaged;
};
