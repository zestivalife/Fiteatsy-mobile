import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { hasEntitlement } from './subscriptions.service.js';
export const requireEntitlement = (entitlement) => [
    requireAuthenticatedAccount,
    async (req, res, next) => {
        const account = getAuthenticatedAccount(req);
        if (await hasEntitlement(account, entitlement))
            return next();
        return res.status(403).json({
            error: {
                code: 'SUBSCRIPTION_REQUIRED',
                message: 'An active Fiteatsy plan is required.',
                requiredEntitlement: entitlement
            }
        });
    }
];
