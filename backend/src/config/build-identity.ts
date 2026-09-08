const FULL_SHA = /^[0-9a-f]{40}$/i;

export type BuildIdentity = {
  commitSha: string | null;
  identityStatus: 'VERIFIED' | 'UNKNOWN';
  buildIdentityVersion: 1;
  source: 'RAILWAY_DEPLOYMENT' | null;
};

export const resolveBuildIdentity = (
  runtimeEnvironment: NodeJS.ProcessEnv = process.env
): BuildIdentity => {
  const railwayCommitSha = runtimeEnvironment.RAILWAY_GIT_COMMIT_SHA?.trim() ?? '';
  if (FULL_SHA.test(railwayCommitSha)) {
    return {
      commitSha: railwayCommitSha.toLowerCase(),
      identityStatus: 'VERIFIED',
      buildIdentityVersion: 1,
      source: 'RAILWAY_DEPLOYMENT'
    };
  }

  return {
    commitSha: null,
    identityStatus: 'UNKNOWN',
    buildIdentityVersion: 1,
    source: null
  };
};
