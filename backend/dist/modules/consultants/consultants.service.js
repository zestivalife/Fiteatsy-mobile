import { ensureRegisteredClientsForEligibleUsers, getRegisteredConsultantClientProfile, listRegisteredConsultantClients } from './consultants.repository.js';
const CONSULTANT_ROLES = new Set(['consultant', 'practitioner', 'admin', 'super_admin']);
export const canAccessConsultantClientApi = (account) => CONSULTANT_ROLES.has(account.user.role ?? '');
export const listConsultantClients = async () => {
    await ensureRegisteredClientsForEligibleUsers();
    return listRegisteredConsultantClients();
};
export const getConsultantClientProfile = async (publicClientId) => {
    await ensureRegisteredClientsForEligibleUsers();
    return getRegisteredConsultantClientProfile(publicClientId);
};
