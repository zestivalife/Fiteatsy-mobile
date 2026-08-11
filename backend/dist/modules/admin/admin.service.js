import { env } from '../../config/env.js';
import { assignUserRole, countActiveAdmins, countRoleAuditEventsByReason, findActiveUserIdByMobile, isManagedRole } from './admin.repository.js';
const INITIAL_ADMIN_BOOTSTRAP_REASON = 'initial_admin_bootstrap';
export const canManageRoles = (account) => account.user.role === 'admin';
export const assignRoleAsAdmin = async (actor, targetUserId, role, reason) => {
    if (!canManageRoles(actor)) {
        return {
            ok: false,
            status: 403,
            error: 'ROLE_NOT_ALLOWED',
            message: 'An admin account is required to manage user roles.'
        };
    }
    if (!isManagedRole(role)) {
        return {
            ok: false,
            status: 400,
            error: 'INVALID_ROLE',
            message: 'Role must be one of: user, consultant, admin.'
        };
    }
    const result = await assignUserRole({
        performedByUserId: actor.user.id,
        targetUserId,
        role,
        reason
    });
    if (!result) {
        return {
            ok: false,
            status: 404,
            error: 'USER_NOT_FOUND',
            message: 'Target user was not found.'
        };
    }
    return { ok: true, ...result };
};
export const bootstrapInitialAdminFromEnvironment = async () => {
    const configuredPhone = env.initialAdminPhone;
    if (!configuredPhone)
        return { status: 'skipped', reason: 'not_configured' };
    const priorBootstrapEvents = await countRoleAuditEventsByReason(INITIAL_ADMIN_BOOTSTRAP_REASON);
    if (priorBootstrapEvents > 0) {
        return { status: 'skipped', reason: 'already_used' };
    }
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins > 0) {
        return { status: 'skipped', reason: 'admin_exists' };
    }
    const targetUserId = await findActiveUserIdByMobile(configuredPhone);
    if (!targetUserId) {
        return { status: 'skipped', reason: 'target_user_not_found' };
    }
    await assignUserRole({
        performedByUserId: null,
        targetUserId,
        role: 'admin',
        reason: INITIAL_ADMIN_BOOTSTRAP_REASON
    });
    return { status: 'bootstrapped', userId: targetUserId };
};
