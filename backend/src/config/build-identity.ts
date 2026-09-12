import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const buildInfoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'build-info.json');

export type PackagedBuildIdentity = {
  commitSha?: unknown;
  builtAt?: unknown;
  identitySource?: unknown;
};

export type BuildIdentity = {
  commitSha: string | null;
  identityStatus: 'VERIFIED' | 'INVALID' | 'UNKNOWN';
  buildIdentityVersion: 1;
  source: 'FITEATSY_COMMIT_SHA' | 'PACKAGED_BUILD' | 'RAILWAY_GIT' | null;
  builtAt: string | null;
  identityError: 'BUILD_IDENTITY_MISMATCH' | null;
};

export const readPackagedBuildIdentity = (): PackagedBuildIdentity | null => {
  try {
    return JSON.parse(fs.readFileSync(buildInfoPath, 'utf8')) as PackagedBuildIdentity;
  } catch {
    return null;
  }
};

export const resolveBuildIdentity = (
  runtimeEnvironment: NodeJS.ProcessEnv = process.env,
  packaged: PackagedBuildIdentity | null = readPackagedBuildIdentity()
): BuildIdentity => {
  const canonicalCommitSha = runtimeEnvironment.FITEATSY_COMMIT_SHA?.trim() ?? '';
  const railwayCommitSha = runtimeEnvironment.RAILWAY_GIT_COMMIT_SHA?.trim() ?? '';
  const packagedCommitSha = typeof packaged?.commitSha === 'string' ? packaged.commitSha.trim() : '';
  const packagedBuiltAt = typeof packaged?.builtAt === 'string' ? packaged.builtAt.trim() : '';
  const hasPackagedIdentity =
    FULL_SHA.test(packagedCommitSha) &&
    packaged?.identitySource === 'PACKAGED_BUILD' &&
    !Number.isNaN(Date.parse(packagedBuiltAt));

  if (canonicalCommitSha) {
    if (!FULL_SHA.test(canonicalCommitSha) || canonicalCommitSha !== canonicalCommitSha.toLowerCase()) {
      return { commitSha: null, identityStatus: 'INVALID', buildIdentityVersion: 1, source: null, builtAt: null, identityError: null };
    }
    return { commitSha: canonicalCommitSha, identityStatus: 'VERIFIED', buildIdentityVersion: 1, source: 'FITEATSY_COMMIT_SHA', builtAt: packagedBuiltAt && !Number.isNaN(Date.parse(packagedBuiltAt)) ? packagedBuiltAt : null, identityError: null };
  }

  if (hasPackagedIdentity && FULL_SHA.test(railwayCommitSha) && packagedCommitSha.toLowerCase() !== railwayCommitSha.toLowerCase()) {
    return {
      commitSha: null,
      identityStatus: 'INVALID',
      buildIdentityVersion: 1,
      source: null,
      builtAt: null,
      identityError: 'BUILD_IDENTITY_MISMATCH'
    };
  }

  if (hasPackagedIdentity) {
    return {
      commitSha: packagedCommitSha.toLowerCase(),
      identityStatus: 'VERIFIED',
      buildIdentityVersion: 1,
      source: 'PACKAGED_BUILD',
      builtAt: packagedBuiltAt,
      identityError: null
    };
  }

  if (FULL_SHA.test(railwayCommitSha)) {
    return {
      commitSha: railwayCommitSha.toLowerCase(),
      identityStatus: 'VERIFIED',
      buildIdentityVersion: 1,
      source: 'RAILWAY_GIT',
      builtAt: null,
      identityError: null
    };
  }

  return {
    commitSha: null,
    identityStatus: 'UNKNOWN',
    buildIdentityVersion: 1,
    source: null,
    builtAt: null,
    identityError: null
  };
};
