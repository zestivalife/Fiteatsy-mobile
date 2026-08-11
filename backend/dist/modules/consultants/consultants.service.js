import { persistHealthCalculations } from '../health/health-calculations.repository.js';
import { calculateHealthMetrics } from '../health/health-calculations.service.js';
import { ensureRegisteredClientsForEligibleUsers, getRegisteredConsultantClientProfileContext, listValidatedBiomarkerSummaryForClient, listRegisteredConsultantClients } from './consultants.repository.js';
const CONSULTANT_ROLES = new Set(['consultant', 'practitioner', 'admin', 'super_admin']);
export const canAccessConsultantClientApi = (account) => CONSULTANT_ROLES.has(account.user.role ?? '');
export const listConsultantClients = async () => {
    await ensureRegisteredClientsForEligibleUsers();
    return listRegisteredConsultantClients();
};
export const getConsultantClientProfile = async (publicClientId) => {
    await ensureRegisteredClientsForEligibleUsers();
    const context = await getRegisteredConsultantClientProfileContext(publicClientId);
    if (!context)
        return null;
    const healthMetrics = calculateHealthMetrics(context.calculationInput);
    await persistHealthCalculations({ accountId: context.accountId, clientId: context.internalClientId }, healthMetrics);
    const biomarkers = await listValidatedBiomarkerSummaryForClient(context.internalClientId, context.accountId);
    return {
        ...context.profile,
        healthMetrics,
        biomarkers
    };
};
