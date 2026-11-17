export const TERMINAL_SESSION_CODES = new Set([
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'ACCOUNT_DISABLED'
]);

export const isTerminalSessionCode = (code: string | null | undefined) =>
  Boolean(code && TERMINAL_SESSION_CODES.has(code));

export const getAuthErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
};
