import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import {
  getRegisteredConsultantClientProfile,
  listRegisteredConsultantClients
} from './consultants.repository.js';

const CONSULTANT_ROLES = new Set(['consultant', 'practitioner', 'admin', 'super_admin']);

export const canAccessConsultantClientApi = (account: AuthenticatedAccount) =>
  CONSULTANT_ROLES.has(account.user.role ?? '');

export const listConsultantClients = () => listRegisteredConsultantClients();

export const getConsultantClientProfile = (publicClientId: string) =>
  getRegisteredConsultantClientProfile(publicClientId);
