import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
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

consultantsRouter.get('/clients', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const clients = await listConsultantClients(account);
  return res.status(200).json({ clients });
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
