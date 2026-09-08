import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(backendRoot, '..');
const info = JSON.parse(fs.readFileSync(path.join(backendRoot, 'build-info.json'), 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim().toLowerCase();
if (info.commitSha !== head || info.identitySource !== 'PACKAGED_BUILD' || Number.isNaN(Date.parse(info.builtAt))) {
  throw new Error('Packaged build identity does not match the exact repository HEAD.');
}
console.log(`Packaged build identity verified for ${head}.`);
