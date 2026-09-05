import { getAuthenticatedAccountByToken } from './auth.repository.js';
const readBearerToken = (req) => {
    const header = req.header('authorization');
    if (!header)
        return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
};
export const requireAuthenticatedAccount = async (req, res, next) => {
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
        const seniorAllocationRouteAllowed = req.originalUrl.startsWith('/v1/professional-assignments')
            && ['senior_consultant', 'admin', 'super_admin', 'platform_owner'].includes(String(account.user.role ?? '').toLowerCase());
        if (account.authProvider === 'consultant_dashboard' && !req.originalUrl.startsWith('/v1/consultants') && !consultantWorkspaceRouteAllowed && !seniorAllocationRouteAllowed) {
            return res.status(403).json({
                error: 'EXTERNAL_SESSION_SCOPE_NOT_ALLOWED',
                message: 'This dashboard session is not authorised for the requested API.'
            });
        }
        req.authenticatedAccount = account;
        return next();
    }
    catch (error) {
        return res.status(500).json({
            error: 'AUTH_RESOLUTION_FAILED',
            message: error instanceof Error ? error.message : 'Unable to resolve authenticated account.'
        });
    }
};
export const getAuthenticatedAccount = (req) => {
    const account = req.authenticatedAccount;
    if (!account) {
        throw new Error('Authenticated account missing from request context.');
    }
    return account;
};
