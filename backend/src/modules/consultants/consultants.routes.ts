import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import {
  acknowledgeConsultantMedicationException,
  canAccessConsultantClientApi,
  getConsultantClientMedicationExceptions,
  getConsultantClientMedicationMonitoring,
  getConsultantClientAssessmentResult,
  getConsultantClientAssessmentSummary,
  getConsultantClientWorkspace,
  getConsultantMedicationExceptionDetail,
  getConsultantClientProfile,
  listConsultantMedicationExceptions,
  listConsultantClients
} from './consultants.service.js';
import {
  completeExternalConsultantOnboarding,
  ExternalSignupProvisionError,
  getExternalConsultantOnboarding,
  updateExternalConsultantOnboarding
} from '../external-signup/external-signup.repository.js';

export const consultantsRouter = Router();

const requireConsultantAccount = (req: Request, res: Response, next: NextFunction) => {
  const account = getAuthenticatedAccount(req);
  if (!canAccessConsultantClientApi(account)) {
    return res.status(403).json({
      error: 'ROLE_NOT_ALLOWED',
      message: 'A consultant account is required to access client management APIs.'
    });
  }
  return next();
};

consultantsRouter.use(requireAuthenticatedAccount);
consultantsRouter.use(requireConsultantAccount);

const externalOnboardingUpdateSchema = z.object({
  version: z.number().int().positive(),
  consultantName: z.string().trim().min(2).max(120).optional(),
  professionalTitle: z.string().trim().max(120).nullable().optional(),
  speciality: z.string().trim().max(120).nullable().optional(),
  practiceName: z.string().trim().max(160).nullable().optional(),
  country: z.string().trim().length(2).optional(),
  timezone: z.string().trim().min(3).max(80).optional(),
  contactInformation: z.record(z.string(), z.unknown()).optional(),
  professionalDetails: z.record(z.string(), z.unknown()).optional(),
  acceptTerms: z.boolean().optional()
}).strict();

const onboardingError = (res: Response, error: unknown) => {
  const typed = error as ExternalSignupProvisionError;
  return res.status(typed.status ?? 500).json({
    error: typed.code ?? 'EXTERNAL_ONBOARDING_FAILED',
    message: typed.status ? typed.message : 'Consultant onboarding could not be completed.'
  });
};

consultantsRouter.get('/onboarding', async (req, res) => {
  try {
    const onboarding = await getExternalConsultantOnboarding(getAuthenticatedAccount(req).accountId);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ onboarding });
  } catch (error) { return onboardingError(res, error); }
});

consultantsRouter.patch('/onboarding', async (req, res) => {
  const parsed = externalOnboardingUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_ONBOARDING_INPUT', details: parsed.error.flatten() });
  try {
    const onboarding = await updateExternalConsultantOnboarding(getAuthenticatedAccount(req).accountId, parsed.data);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ onboarding });
  } catch (error) { return onboardingError(res, error); }
});

consultantsRouter.post('/onboarding/complete', async (req, res) => {
  const parsed = z.object({ version: z.number().int().positive() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_ONBOARDING_INPUT', details: parsed.error.flatten() });
  try {
    const onboarding = await completeExternalConsultantOnboarding(getAuthenticatedAccount(req).accountId, parsed.data.version);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ onboarding });
  } catch (error) { return onboardingError(res, error); }
});

const clientDirectoryQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  sort: z.enum(['registeredAt', 'name', 'lastActiveAt']).default('registeredAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

consultantsRouter.get('/clients', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const parsed = clientDirectoryQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_CLIENT_DIRECTORY_QUERY', details: parsed.error.flatten() });
  const directory = await listConsultantClients(account, {
    query: parsed.data.q,
    status: parsed.data.status,
    sort: parsed.data.sort,
    order: parsed.data.order,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize
  });
  return res.status(200).json({
    clients: directory.clients,
    pagination: { total: directory.total, page: directory.page, pageSize: directory.pageSize }
  });
});

consultantsRouter.get('/medication-exceptions', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const payload = await listConsultantMedicationExceptions(account);
  return res.status(200).json(payload);
});

consultantsRouter.get('/medication-exceptions/:exceptionId', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const exception = await getConsultantMedicationExceptionDetail(req.params.exceptionId, account);
  if (!exception) {
    return res.status(404).json({
      error: 'MEDICATION_EXCEPTION_NOT_FOUND',
      message: 'Medication exception not found.'
    });
  }
  if ('error' in exception) {
    return res.status(403).json({
      error: exception.error,
      message: 'Medication exception access requires an assigned client relationship.'
    });
  }
  return res.status(200).json({ exception });
});

consultantsRouter.post('/medication-exceptions/:exceptionId/acknowledge', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const result = await acknowledgeConsultantMedicationException(req.params.exceptionId, account);
  if (!result) {
    return res.status(404).json({
      error: 'MEDICATION_EXCEPTION_NOT_FOUND',
      message: 'Medication exception not found.'
    });
  }
  if ('error' in result) {
    return res.status(403).json({
      error: result.error,
      message: 'Medication exception access requires an assigned client relationship.'
    });
  }
  return res.status(200).json(result);
});

consultantsRouter.get('/clients/:clientId/workspace', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const workspace = await getConsultantClientWorkspace(req.params.clientId, account);
  if (!workspace) {
    return res.status(404).json({
      error: 'CLIENT_NOT_FOUND',
      message: 'Client not found or not available for consultant management.'
    });
  }
  return res.status(200).json(workspace);
});

consultantsRouter.get('/clients/:clientId/medications', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const medicationMonitoring = await getConsultantClientMedicationMonitoring(req.params.clientId, account);
  if (!medicationMonitoring) {
    return res.status(404).json({
      error: 'CLIENT_NOT_FOUND',
      message: 'Client not found or not available for consultant management.'
    });
  }
  if ('error' in medicationMonitoring) {
    return res.status(403).json({
      error: medicationMonitoring.error,
      message: 'Medication monitoring requires an assigned client relationship.',
      assignmentValidation: medicationMonitoring.assignmentValidation
    });
  }
  return res.status(200).json(medicationMonitoring);
});

const sendAssessmentAccessResponse = (res: Response, payload: Awaited<ReturnType<typeof getConsultantClientAssessmentSummary>>) => {
  if (!payload) {
    return res.status(404).json({
      error: 'CLIENT_NOT_FOUND',
      message: 'Client not found or not available for consultant management.'
    });
  }
  if ('error' in payload) {
    return res.status(403).json({
      error: payload.error,
      message: 'Perceived-stress assessment access requires an assigned client relationship.',
      assignmentValidation: payload.assignmentValidation
    });
  }
  return res.status(200).json(payload);
};

consultantsRouter.get('/clients/:clientId/assessments/PSS10/summary', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const summary = await getConsultantClientAssessmentSummary(req.params.clientId, account);
  return sendAssessmentAccessResponse(res, summary);
});

consultantsRouter.get('/clients/:clientId/assessments/PSS10/history', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const summary = await getConsultantClientAssessmentSummary(req.params.clientId, account);
  if (!summary) return sendAssessmentAccessResponse(res, summary);
  if ('error' in summary) return sendAssessmentAccessResponse(res, summary);
  return res.status(200).json({
    client: summary.client,
    access: summary.access,
    assessmentType: summary.assessment.assessmentType,
    history: summary.assessment.history
  });
});

consultantsRouter.get('/clients/:clientId/assessments/results/:resultId', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const result = await getConsultantClientAssessmentResult(req.params.clientId, req.params.resultId, account);
  if (!result) {
    return res.status(404).json({ error: 'ASSESSMENT_RESULT_NOT_FOUND', message: 'Assessment result not found.' });
  }
  if ('error' in result) {
    return res.status(403).json({
      error: result.error,
      message: 'Perceived-stress assessment access requires an assigned client relationship.',
      assignmentValidation: result.assignmentValidation
    });
  }
  return res.status(200).json(result);
});

consultantsRouter.get('/clients/:clientId/medication-exceptions', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const exceptions = await getConsultantClientMedicationExceptions(req.params.clientId, account);
  if (!exceptions) {
    return res.status(404).json({
      error: 'CLIENT_NOT_FOUND',
      message: 'Client not found or not available for consultant management.'
    });
  }
  if ('error' in exceptions) {
    return res.status(403).json({
      error: exceptions.error,
      message: 'Medication exceptions require an assigned client relationship.',
      assignmentValidation: exceptions.assignmentValidation
    });
  }
  return res.status(200).json(exceptions);
});

consultantsRouter.get('/clients/:clientId', async (req, res) => {
  const client = await getConsultantClientProfile(req.params.clientId, getAuthenticatedAccount(req));
  if (!client) {
    return res.status(404).json({
      error: 'CLIENT_NOT_FOUND',
      message: 'Client not found or not available for consultant management.'
    });
  }
  return res.status(200).json(client);
});


export const consultantWorkspaceContractRouter = Router();
consultantWorkspaceContractRouter.use(requireAuthenticatedAccount);
consultantWorkspaceContractRouter.use(requireConsultantAccount);
consultantWorkspaceContractRouter.get('/:clientId/workspace', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const workspace = await getConsultantClientWorkspace(req.params.clientId, account);
  if (!workspace) {
    return res.status(404).json({
      error: 'CLIENT_NOT_FOUND',
      message: 'Client not found or not available for consultant management.'
    });
  }
  return res.status(200).json(workspace);
});
