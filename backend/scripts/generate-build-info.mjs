import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(backendRoot, '..');
const outputPath = path.join(backendRoot, 'build-info.json');
const runGit = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();

const status = runGit('status', '--porcelain=v1');
if (status) throw new Error('Production packaging requires a clean worktree before identity generation.');

const commitSha = runGit('rev-parse', 'HEAD').toLowerCase();
if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('Unable to resolve an exact Git commit SHA.');

fs.writeFileSync(outputPath, `${JSON.stringify({ commitSha, builtAt: new Date().toISOString(), identitySource: 'PACKAGED_BUILD' }, null, 2)}\n`);
console.log(`Packaged build identity generated for ${commitSha}.`);
