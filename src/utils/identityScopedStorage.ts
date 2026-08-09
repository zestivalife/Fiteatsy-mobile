export type StorageIdentity = {
  userId?: string | null;
  accountId?: string | null;
  clientId?: string | null;
  fiteatsyClientId?: string | null;
};

const cleanSegment = (value?: string | null) =>
  typeof value === 'string' ? value.trim().replace(/[^A-Za-z0-9._-]/g, '_') : '';

export const getIdentityStorageSuffix = (identity?: StorageIdentity | null): string | null => {
  const userId = cleanSegment(identity?.userId ?? identity?.accountId);
  const clientId = cleanSegment(identity?.clientId ?? identity?.fiteatsyClientId);
  if (!userId || !clientId) return null;
  return `${userId}:${clientId}`;
};

export const getIdentityScopedStorageKey = (baseKey: string, identity?: StorageIdentity | null): string | null => {
  const suffix = getIdentityStorageSuffix(identity);
  return suffix ? `${baseKey}:${suffix}` : null;
};
