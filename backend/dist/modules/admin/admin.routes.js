import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { assignRoleAsAdmin, getAdminStatus } from './admin.service.js';
export const adminRouter = Router();
const roleAssignmentSchema = z.object({
    role: z.enum(['user', 'consultant', 'admin']),
    reason: z.string().trim().max(240).optional()
});
adminRouter.use(requireAuthenticatedAccount);
adminRouter.get('/status', async (req, res) => {
    const result = await getAdminStatus(getAuthenticatedAccount(req));
    if (!result.ok) {
        return res.status(result.status).json({
            error: result.error,
            message: result.message
        });
    }
    return res.status(200).json({
        role: result.role,
        permissions: result.permissions,
        bootstrapConfigured: result.bootstrapConfigured,
        activeAdmins: result.activeAdmins,
        bootstrapAuditRecorded: result.bootstrapAuditRecorded
    });
});
adminRouter.post('/users/:userId/role', async (req, res) => {
    const parsed = roleAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: 'INVALID_INPUT',
            details: parsed.error.flatten()
        });
    }
    const result = await assignRoleAsAdmin(getAuthenticatedAccount(req), req.params.userId, parsed.data.role, parsed.data.reason);
    if (!result.ok) {
        return res.status(result.status).json({
            error: result.error,
            message: result.message
        });
    }
    return res.status(200).json({
        user: {
            id: result.userId,
            role: result.role
        },
        auditEvent: result.auditEvent
    });
});
