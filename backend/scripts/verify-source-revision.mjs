import { readRevisionFile, resolveGitHead, verifyRevision } from './source-revision.mjs';

const formatOnly = process.argv.includes('--format-only');
const packaged = readRevisionFile();
const verified = formatOnly ? packaged : verifyRevision(packaged, resolveGitHead());
process.stdout.write(`${verified}\n`);
