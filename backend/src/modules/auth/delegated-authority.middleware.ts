import type { NextFunction, Request, Response } from 'express';
import { DelegatedAuthorityError, verifyDelegatedAuthority } from './delegated-authority.js';

export const requireDelegatedAuthority = (permission: string, purpose: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('x-zestiva-delegation');
    if (!token) return res.status(401).json({ error: 'DELEGATED_AUTHORITY_REQUIRED', message: 'Delegated authority is required.' });
    try {
      (req as Request & { delegatedAuthority?: unknown }).delegatedAuthority = await verifyDelegatedAuthority(token, permission, purpose);
      return next();
    } catch (error) {
      const delegatedError = error instanceof DelegatedAuthorityError ? error : null;
      return res.status(401).json({ error: delegatedError?.code ?? 'INVALID_DELEGATED_AUTHORITY', message: 'Delegated authority is invalid.' });
    }
  };
