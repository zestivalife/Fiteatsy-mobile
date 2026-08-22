export const resolveClientName = (canonicalName?: string | null, fallback = 'Member') => {
  const normalized = canonicalName?.trim();
  return normalized || fallback;
};

export const resolveClientFirstName = (canonicalName?: string | null, fallback = 'there') =>
  resolveClientName(canonicalName, fallback).split(/\s+/)[0];
