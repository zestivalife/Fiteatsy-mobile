import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { EntitlementCode } from './subscriptions.types.js';
import { hasEntitlement } from './subscriptions.service.js';

export const requireEntitlement = (entitlement: EntitlementCode) => [
  requireAuthenticatedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    const account = getAuthenticatedAccount(req);
    if (await hasEntitlement(account, entitlement)) return next();
    return res.status(403).json({
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'An active Fiteatsy plan is required.',
        requiredEntitlement: entitlement
      }
    });
  }
];
