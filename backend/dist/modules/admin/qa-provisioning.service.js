import { createAuthSession } from '../auth/auth.repository.js';
import { canManageRoles } from './admin.service.js';
import { assignUserRole } from './admin.repository.js';
import { createQaAssignment, deactivateQaIdentity, getQaIdentity, issueQaSessionAudit, listQaAssignments, provisionQaIdentity, resetQaOnboarding, revokeQaAssignment } from './qa-provisioning.repository.js';
const assertAdmin = (account) => {
    if (!canManageRoles(account))
        throw Object.assign(new Error('An admin account is required.'), { status: 403, code: 'ROLE_NOT_ALLOWED' });
};
export const provisionQa = async (account, input) => {
    assertAdmin(account);
    return provisionQaIdentity({ ...input, actorUserId: account.user.id });
};
export const assignQaRole = async (account, userId, role, reason) => {
    assertAdmin(account);
    const target = await getQaIdentity(userId);
    if (!target)
        throw Object.assign(new Error('QA identity not found.'), { status: 404, code: 'QA_IDENTITY_NOT_FOUND' });
    return assignUserRole({ performedByUserId: account.user.id, targetUserId: userId, role, reason });
};
export const issueQaSession = async (account, userId, reason) => {
    assertAdmin(account);
    const target = await getQaIdentity(userId);
    if (!target || target.status.toLowerCase() !== 'active')
        throw Object.assign(new Error('Active QA identity not found.'), { status: 404, code: 'QA_IDENTITY_NOT_FOUND' });
    const session = await createAuthSession(userId, { userAgent: 'qa-provisioning', ipAddress: null });
    await issueQaSessionAudit(account.user.id, userId, reason);
    return session;
};
export const assignQaClient = async (account, input) => {
    assertAdmin(account);
    return createQaAssignment({ ...input, actorUserId: account.user.id });
};
export const revokeQaClientAssignment = async (account, assignmentId, reason) => {
    assertAdmin(account);
    return revokeQaAssignment({ actorUserId: account.user.id, assignmentId, reason });
};
export const getQaIdentityForAdmin = async (account, userId) => {
    assertAdmin(account);
    return getQaIdentity(userId);
};
export const getQaAssignmentsForAdmin = async (account) => {
    assertAdmin(account);
    return listQaAssignments();
};
export const deactivateQa = async (account, userId, reason) => {
    assertAdmin(account);
    return deactivateQaIdentity({ actorUserId: account.user.id, userId, reason });
};
export const resetQaClientOnboarding = async (account, userId, reason) => {
    assertAdmin(account);
    return resetQaOnboarding({ actorUserId: account.user.id, userId, reason });
};
