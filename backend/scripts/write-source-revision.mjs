import fs from 'node:fs';
import { resolveGitHead, revisionPath } from './source-revision.mjs';

const revision = resolveGitHead();
fs.writeFileSync(revisionPath, `${revision}\n`, { encoding: 'utf8', mode: 0o644 });
process.stdout.write(`${revision}\n`);
