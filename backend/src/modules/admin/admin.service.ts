import { env } from '../../config/env.js';
import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import {
  assignUserRole,
  countActiveAdmins,
  countRoleAuditEventsByReason,
  findActiveVerifiedUserIdByMobile,
  isManagedRole,
  type ManagedRole
} from './admin.repository.js';

const INITIAL_ADMIN_BOOTSTRAP_REASON = 'initial_admin_bootstrap';

export const canManageRoles = (account: AuthenticatedAccount) => account.user.role?.toLowerCase() === 'admin';

const isQaAdmin = (account: AuthenticatedAccount) =>
  canManageRoles(account) && account.user.accountPurpose.toUpperCase() === 'QA_TEST';

export const getAdminStatus = async (account: AuthenticatedAccount) => {
  if (!canManageRoles(account)) {
    return {
      ok: false as const,
      status: 403,
      error: 'ROLE_NOT_ALLOWED',
      message: 'An admin account is required to view admin status.'
    };
  }

  return {
    ok: true as const,
    role: 'admin',
    permissions: isQaAdmin(account) ? ['qa_provisioning'] : ['role_management'],
    bootstrapConfigured: Boolean(env.initialAdminPhone),
    activeAdmins: await countActiveAdmins(),
    bootstrapAuditRecorded: (await countRoleAuditEventsByReason(INITIAL_ADMIN_BOOTSTRAP_REASON)) > 0
  };
};

export const assignRoleAsAdmin = async (
  actor: AuthenticatedAccount,
  targetUserId: string,
  role: string,
  reason?: string | null
) => {
  if (!canManageRoles(actor)) {
    return {
      ok: false as const,
      status: 403,
      error: 'ROLE_NOT_ALLOWED',
      message: 'An admin account is required to manage user roles.'
    };
  }

  if (isQaAdmin(actor)) {
    return {
      ok: false as const,
      status: 403,
      error: 'QA_ADMIN_SCOPE_RESTRICTED',
      message: 'QA_TEST administrators cannot manage production user roles.'
    };
  }

  const normalizedRole = role.toLowerCase();
  if (!isManagedRole(normalizedRole)) {
    return {
      ok: false as const,
      status: 400,
      error: 'INVALID_ROLE',
      message: 'Role must be one of: user, consultant, admin.'
    };
  }

  const result = await assignUserRole({
    performedByUserId: actor.user.id,
    targetUserId,
    role: normalizedRole,
    reason
  });

  if (!result) {
    return {
      ok: false as const,
      status: 404,
      error: 'USER_NOT_FOUND',
      message: 'Target user was not found.'
    };
  }

  return { ok: true as const, ...result };
};

export const bootstrapInitialAdminFromEnvironment = async () => {
  const configuredPhone = env.initialAdminPhone;
  const enabled = Boolean(configuredPhone);
  if (!enabled) {
    return {
      status: 'skipped' as const,
      enabled,
      activeAdminExists: false,
      bootstrapAuditExists: false,
      adminUserFound: false,
      completed: false,
      reason: 'not_configured'
    };
  }

  const activeAdminCount = await countActiveAdmins();
  const activeAdminExists = activeAdminCount > 0;
  if (activeAdminExists) {
    return {
      status: 'skipped' as const,
      enabled,
      activeAdminExists,
      bootstrapAuditExists: false,
      adminUserFound: false,
      completed: false,
      reason: 'admin_exists'
    };
  }

  const priorBootstrapEvents = await countRoleAuditEventsByReason(INITIAL_ADMIN_BOOTSTRAP_REASON);
  const bootstrapAuditExists = priorBootstrapEvents > 0;
  if (priorBootstrapEvents > 0) {
    return {
      status: 'skipped' as const,
      enabled,
      activeAdminExists,
      bootstrapAuditExists,
      adminUserFound: false,
      completed: false,
      reason: 'already_used'
    };
  }

  const targetUserId = await findActiveVerifiedUserIdByMobile(configuredPhone);
  if (!targetUserId) {
    return {
      status: 'skipped' as const,
      enabled,
      activeAdminExists,
      bootstrapAuditExists,
      adminUserFound: false,
      completed: false,
      reason: 'INITIAL_ADMIN_USER_NOT_FOUND'
    };
  }

  await assignUserRole({
    performedByUserId: null,
    targetUserId,
    role: 'admin' satisfies ManagedRole,
    reason: INITIAL_ADMIN_BOOTSTRAP_REASON
  });
  return {
    status: 'bootstrapped' as const,
    enabled,
    activeAdminExists,
    bootstrapAuditExists,
    adminUserFound: true,
    completed: true,
    userId: targetUserId
  };
};
