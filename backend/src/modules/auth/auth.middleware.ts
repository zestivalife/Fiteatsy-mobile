import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedAccountByToken, type AuthenticatedAccount } from './auth.repository.js';

type AuthenticatedRequest = Request & {
  authenticatedAccount?: AuthenticatedAccount;
};

const readBearerToken = (req: Request) => {
  const header = req.header('authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

export const requireAuthenticatedAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Bearer token is required.' });
    }

    const account = await getAuthenticatedAccountByToken(token);
    if (!account) {
      return res.status(401).json({ error: 'INVALID_SESSION', message: 'Session token is invalid, expired, or revoked.' });
    }

    const consultantWorkspaceRouteAllowed = /^\/v1\/clients\/[^/]+\/workspace(?:$|[?#/])/.test(req.originalUrl);
    if (account.authProvider === 'consultant_dashboard' && !req.originalUrl.startsWith('/v1/consultants') && !consultantWorkspaceRouteAllowed) {
      return res.status(403).json({
        error: 'EXTERNAL_SESSION_SCOPE_NOT_ALLOWED',
        message: 'Consultant dashboard sessions are only valid for consultant APIs.'
      });
    }

    (req as AuthenticatedRequest).authenticatedAccount = account;
    return next();
  } catch (error) {
    return res.status(500).json({
      error: 'AUTH_RESOLUTION_FAILED',
      message: error instanceof Error ? error.message : 'Unable to resolve authenticated account.'
    });
  }
};

export const getAuthenticatedAccount = (req: Request) => {
  const account = (req as AuthenticatedRequest).authenticatedAccount;
  if (!account) {
    throw new Error('Authenticated account missing from request context.');
  }
  return account;
};
