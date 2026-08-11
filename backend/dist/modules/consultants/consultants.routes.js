import { Router } from 'express';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { canAccessConsultantClientApi, getConsultantClientProfile, listConsultantClients } from './consultants.service.js';
export const consultantsRouter = Router();
const requireConsultantAccount = (req, res, next) => {
    const account = getAuthenticatedAccount(req);
    if (!canAccessConsultantClientApi(account)) {
        return res.status(403).json({
            error: 'ROLE_NOT_ALLOWED',
            message: 'A consultant account is required to access client management APIs.'
        });
    }
    return next();
};
consultantsRouter.use(requireAuthenticatedAccount);
consultantsRouter.use(requireConsultantAccount);
consultantsRouter.get('/clients', async (_req, res) => {
    const clients = await listConsultantClients();
    return res.status(200).json({ clients });
});
consultantsRouter.get('/clients/:clientId', async (req, res) => {
    const client = await getConsultantClientProfile(req.params.clientId);
    if (!client) {
        return res.status(404).json({
            error: 'CLIENT_NOT_FOUND',
            message: 'Client not found or not available for consultant management.'
        });
    }
    return res.status(200).json(client);
});
