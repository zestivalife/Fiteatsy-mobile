import fs from 'node:fs';

export const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export const validateSourceRevision = (value: string, label = 'packaged source revision') => {
  const revision = value.trim().toLowerCase();
  if (!FULL_GIT_SHA_PATTERN.test(revision)) {
    throw new Error(`${label} must be exactly 40 hexadecimal characters.`);
  }
  return revision;
};

export const readPackagedSourceRevision = (revisionPath: string) => {
  let contents: string;
  try {
    contents = fs.readFileSync(revisionPath, 'utf8');
  } catch {
    throw new Error(`Packaged source revision is missing at ${revisionPath}.`);
  }
  return validateSourceRevision(contents);
};

export const verifyPackagedSourceRevision = (packagedRevision: string, expectedRevision: string) => {
  const packaged = validateSourceRevision(packagedRevision, 'packaged source revision');
  const expected = validateSourceRevision(expectedRevision, 'expected source revision');
  if (packaged !== expected) {
    throw new Error(`Packaged source revision ${packaged} does not match expected revision ${expected}.`);
  }
  return packaged;
};
