import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import {
  ensureRegisteredClientsForEligibleUsers,
  getRegisteredConsultantClientProfile,
  listRegisteredConsultantClients
} from './consultants.repository.js';

const CONSULTANT_ROLES = new Set(['consultant', 'practitioner', 'admin', 'super_admin']);

export const canAccessConsultantClientApi = (account: AuthenticatedAccount) =>
  CONSULTANT_ROLES.has(account.user.role ?? '');

export const listConsultantClients = async () => {
  await ensureRegisteredClientsForEligibleUsers();
  return listRegisteredConsultantClients();
};

export const getConsultantClientProfile = async (publicClientId: string) => {
  await ensureRegisteredClientsForEligibleUsers();
  return getRegisteredConsultantClientProfile(publicClientId);
};
