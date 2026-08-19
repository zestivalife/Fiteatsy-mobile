import { createAuthSession } from '../auth/auth.repository.js';
import { getAuthenticatedAccount } from '../auth/auth.middleware.js';
import { canManageRoles } from './admin.service.js';
import { assignUserRole } from './admin.repository.js';
import { createQaAssignment, deactivateQaIdentity, getQaIdentity, issueQaSessionAudit, listQaAssignments, provisionQaIdentity, revokeQaAssignment } from './qa-provisioning.repository.js';

const assertAdmin = (account: ReturnType<typeof getAuthenticatedAccount>) => {
  if (!canManageRoles(account)) throw Object.assign(new Error('An admin account is required.'), { status: 403, code: 'ROLE_NOT_ALLOWED' });
};

export const provisionQa = async (account: ReturnType<typeof getAuthenticatedAccount>, input: { name: string; email: string; mobileNumber: string; role: 'user' | 'consultant'; reason: string }) => {
  assertAdmin(account);
  return provisionQaIdentity({ ...input, actorUserId: account.user.id });
};

export const assignQaRole = async (account: ReturnType<typeof getAuthenticatedAccount>, userId: string, role: 'consultant', reason: string) => {
  assertAdmin(account);
  const target = await getQaIdentity(userId);
  if (!target) throw Object.assign(new Error('QA identity not found.'), { status: 404, code: 'QA_IDENTITY_NOT_FOUND' });
  return assignUserRole({ performedByUserId: account.user.id, targetUserId: userId, role, reason });
};

export const issueQaSession = async (account: ReturnType<typeof getAuthenticatedAccount>, userId: string, reason: string) => {
  assertAdmin(account);
  const target = await getQaIdentity(userId);
  if (!target || target.status.toLowerCase() !== 'active') throw Object.assign(new Error('Active QA identity not found.'), { status: 404, code: 'QA_IDENTITY_NOT_FOUND' });
  const session = await createAuthSession(userId, { userAgent: 'qa-provisioning', ipAddress: null });
  await issueQaSessionAudit(account.user.id, userId, reason);
  return session;
};

export const assignQaClient = async (account: ReturnType<typeof getAuthenticatedAccount>, input: { consultantUserId: string; clientUserId: string; reason: string }) => {
  assertAdmin(account);
  return createQaAssignment({ ...input, actorUserId: account.user.id });
};

export const revokeQaClientAssignment = async (account: ReturnType<typeof getAuthenticatedAccount>, assignmentId: string, reason: string) => {
  assertAdmin(account);
  return revokeQaAssignment({ actorUserId: account.user.id, assignmentId, reason });
};

export const getQaIdentityForAdmin = async (account: ReturnType<typeof getAuthenticatedAccount>, userId: string) => {
  assertAdmin(account);
  return getQaIdentity(userId);
};

export const getQaAssignmentsForAdmin = async (account: ReturnType<typeof getAuthenticatedAccount>) => {
  assertAdmin(account);
  return listQaAssignments();
};

export const deactivateQa = async (account: ReturnType<typeof getAuthenticatedAccount>, userId: string, reason: string) => {
  assertAdmin(account);
  return deactivateQaIdentity({ actorUserId: account.user.id, userId, reason });
};
