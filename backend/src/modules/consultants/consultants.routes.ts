import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import {
  acknowledgeConsultantMedicationException,
  canAccessConsultantClientApi,
  getConsultantClientMedicationExceptions,
  getConsultantClientMedicationMonitoring,
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
  const client = await getConsultantClientProfile(req.params.clientId);
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
