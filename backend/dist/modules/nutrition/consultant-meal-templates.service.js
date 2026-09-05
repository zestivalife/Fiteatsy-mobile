import { templateStructureHash, templateStructureSchema, stableTemplateId } from './consultant-meal-template.domain.js';
import { activateTemplate, archiveTemplate, createTemplate, createTemplateRevision, getTemplate, listTemplates, recordTemplateApplication } from './consultant-meal-templates.repository.js';
import { CommonFoodApiError, validateCommonFoodOption } from './common-food-consultant.service.js';
const assertConsultant = (account) => { if (!['consultant', 'senior_consultant', 'admin', 'super_admin', 'platform_owner'].includes(String(account.user.role).toLowerCase()))
    throw new CommonFoodApiError('ROLE_NOT_ALLOWED', 403); };
const governed = (action) => action().catch((error) => { const code = String(error?.code ?? error?.message ?? 'TEMPLATE_OPERATION_FAILED'); if (['TEMPLATE_NAME_EXISTS', 'DRAFT_ALREADY_EXISTS'].includes(code))
    throw new CommonFoodApiError(code, 409); if (['TEMPLATE_OWNER_REQUIRED', 'TEAM_MEMBERSHIP_REQUIRED'].includes(code))
    throw new CommonFoodApiError(code, 403); if (['TEMPLATE_DRAFT_REQUIRED'].includes(code))
    throw new CommonFoodApiError(code, 422); throw error; });
export async function createConsultantMealTemplate(account, input) { assertConsultant(account); const value = templateStructureSchema.parse(input); return governed(() => createTemplate(account.accountId, value, templateStructureHash(value), stableTemplateId(value.name, account.accountId))); }
export async function reviseConsultantMealTemplate(account, templateId, input) { assertConsultant(account); const value = templateStructureSchema.parse(input); return governed(() => createTemplateRevision(account.accountId, templateId, value, templateStructureHash(value))); }
export async function listConsultantMealTemplates(account, input) { assertConsultant(account); return listTemplates(account.accountId, input); }
export async function activateConsultantMealTemplate(account, templateId) { assertConsultant(account); return governed(() => activateTemplate(account.accountId, templateId)); }
export async function archiveConsultantMealTemplate(account, templateId) { assertConsultant(account); await governed(() => archiveTemplate(account.accountId, templateId)); return { archived: true }; }
export async function cloneConsultantMealTemplate(account, templateId, name) { assertConsultant(account); const source = await getTemplate(account.accountId, templateId); if (!source)
    throw new CommonFoodApiError('TEMPLATE_NOT_FOUND', 404); const value = templateStructureSchema.parse({ name: name?.trim() || `${source.revision.name} Copy`, description: source.revision.description ?? undefined, mealHead: source.revision.mealHead, mealStructure: source.revision.mealStructure, components: source.revision.components, visibility: 'PRIVATE' }); return governed(() => createTemplate(account.accountId, value, templateStructureHash(value), stableTemplateId(value.name, account.accountId))); }
export async function applyConsultantMealTemplate(account, clientId, planId, templateId, revisionId) { assertConsultant(account); const template = await getTemplate(account.accountId, templateId, revisionId); if (!template)
    throw new CommonFoodApiError('TEMPLATE_NOT_FOUND', 404); if (template.revision.status !== 'ACTIVE')
    throw new CommonFoodApiError('TEMPLATE_NOT_ACTIVE', 422); try {
    const option = await validateCommonFoodOption(account, clientId, planId, { mealHead: template.revision.mealHead, components: template.revision.components.map((component) => ({ foodId: component.catalogEntityId, servingId: component.servingSelection.servingId, multiplier: component.servingSelection.multiplier })) });
    await recordTemplateApplication({ actorId: account.accountId, templateId, revisionId: template.revision.id, clientId, accepted: true, metadata: { structureSha256: template.revision.structureSha256 } });
    return { ...option, templateStableId: template.stableTemplateId, templateRevisionId: template.revision.id, templateRevisionNumber: template.revision.number };
}
catch (error) {
    await recordTemplateApplication({ actorId: account.accountId, templateId, revisionId: template.revision.id, clientId, accepted: false, reason: error instanceof Error ? error.message : 'TEMPLATE_APPLICATION_REJECTED' });
    if (error instanceof CommonFoodApiError)
        throw error;
    throw new CommonFoodApiError('TEMPLATE_APPLICATION_REJECTED', 422);
} }
