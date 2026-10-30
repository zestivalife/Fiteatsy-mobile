import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { ensureRegisteredClientsForEligibleUsers } from '../consultants/consultants.repository.js';
import { createProfessionalAssignment, createProfessionalAssignmentsBatch, createSeniorDelegatedAssignment, createSeniorDelegatedAssignmentsBatch, discoverClientsForAssignment, discoverProfessionalsForAssignment, listClientAllocationPool, listProfessionalAssignments, ReassignmentRequiredError, revokeProfessionalAssignment, revokeSeniorDelegatedAssignment, type ProfessionalType } from './professional-assignments.repository.js';
import { assignmentValidationDetails, professionalAssignmentBatchSchema, professionalAssignmentSchema } from './professional-assignment.contract.js';

export const professionalAssignmentsRouter = Router();
professionalAssignmentsRouter.use(requireAuthenticatedAccount);

export const canManageProfessionalAssignments = (role: string | null | undefined) => ['admin', 'super_admin', 'platform_owner', 'senior_consultant', 'care_operations'].includes(String(role).toLowerCase());
const assignmentSchema = professionalAssignmentSchema;
const assignmentBatchSchema = professionalAssignmentBatchSchema;

professionalAssignmentsRouter.get('/clients/search', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  if (!canManageProfessionalAssignments(account.user.role)) return res.status(403).json({ error: 'ASSIGNMENT_PERMISSION_REQUIRED' });
  await ensureRegisteredClientsForEligibleUsers();
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  if (String(account.user.role).toLowerCase() === 'senior_consultant') {
    return res.status(200).json({ clients: await listClientAllocationPool({ query, limit, offset, assignmentFilter: 'all', professionalUserId: account.accountId, supervisorOnly: true }) });
  }
  return res.status(200).json({ clients: await discoverClientsForAssignment(query, limit, offset) });
});

professionalAssignmentsRouter.get('/clients/pool', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  if (String(account.user.role).toLowerCase() !== 'senior_consultant' && !['admin', 'super_admin', 'platform_owner'].includes(String(account.user.role).toLowerCase())) return res.status(403).json({ error: 'ASSIGNMENT_PERMISSION_REQUIRED' });
  await ensureRegisteredClientsForEligibleUsers();
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const assignmentFilter = typeof req.query.assignment === 'string' && ['all', 'unassigned', 'assigned', 'mine'].includes(req.query.assignment) ? req.query.assignment as 'all' | 'unassigned' | 'assigned' | 'mine' : 'all';
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return res.status(200).json({ clients: await listClientAllocationPool({ query, limit, offset, assignmentFilter, professionalUserId: account.accountId, supervisorOnly: String(account.user.role).toLowerCase() === 'senior_consultant' }) });
});

professionalAssignmentsRouter.get('/professionals', async (req, res) => {
  if (!canManageProfessionalAssignments(getAuthenticatedAccount(req).user.role)) return res.status(403).json({ error: 'ASSIGNMENT_PERMISSION_REQUIRED' });
  const type = typeof req.query.type === 'string' && ['CONSULTANT', 'PRACTITIONER', 'MENTOR'].includes(req.query.type) ? req.query.type as ProfessionalType : undefined;
  const seniorDelegation = String(getAuthenticatedAccount(req).user.role).toLowerCase() === 'senior_consultant';
  return res.status(200).json({ professionals: await discoverProfessionalsForAssignment(type, seniorDelegation) });
});

professionalAssignmentsRouter.get('/', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const role = String(account.user.role).toLowerCase();
  if (['admin', 'super_admin', 'platform_owner', 'care_operations'].includes(role)) {
    return res.status(200).json({ assignments: await listProfessionalAssignments() });
  }
  return res.status(200).json({ assignments: await listProfessionalAssignments(account.accountId, role === 'senior_consultant') });
});

professionalAssignmentsRouter.post('/', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  if (!canManageProfessionalAssignments(account.user.role)) return res.status(403).json({ error: 'ASSIGNMENT_PERMISSION_REQUIRED' });
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', message: 'Assignment request contains invalid fields.', details: assignmentValidationDetails(parsed.error) });
  let assignment;
  try {
    assignment = String(account.user.role).toLowerCase() === 'senior_consultant'
      ? await createSeniorDelegatedAssignment({ ...parsed.data, actorUserId: account.accountId })
      : await createProfessionalAssignment({ ...parsed.data, actorUserId: account.accountId, professionalType: parsed.data.professionalType as ProfessionalType });
  } catch (error) {
    if (error instanceof ReassignmentRequiredError) {
      return res.status(409).json({ error: 'REASSIGNMENT_CONFIRMATION_REQUIRED', currentAssignment: error.currentAssignment });
    }
    throw error;
  }
  if (!assignment) return res.status(400).json({ error: 'INVALID_ASSIGNMENT_TARGET' });
  return res.status(201).json({ assignment });
});

professionalAssignmentsRouter.post('/batch', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  if (!canManageProfessionalAssignments(account.user.role)) return res.status(403).json({ error: 'ASSIGNMENT_PERMISSION_REQUIRED' });
  const parsed = assignmentBatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', message: 'Assignment request contains invalid fields.', details: assignmentValidationDetails(parsed.error) });
  try {
    const assignments = String(account.user.role).toLowerCase() === 'senior_consultant'
      ? await createSeniorDelegatedAssignmentsBatch({ ...parsed.data, actorUserId: account.accountId })
      : await createProfessionalAssignmentsBatch({ ...parsed.data, actorUserId: account.accountId, professionalType: parsed.data.professionalType as ProfessionalType });
    if (!assignments) return res.status(400).json({ error: 'INVALID_ASSIGNMENT_TARGET' });
    return res.status(201).json({ assignments });
  } catch (error) {
    if (error instanceof ReassignmentRequiredError) {
      return res.status(409).json({ error: 'REASSIGNMENT_CONFIRMATION_REQUIRED', currentAssignment: error.currentAssignment });
    }
    throw error;
  }
});

professionalAssignmentsRouter.delete('/:assignmentId', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  if (!canManageProfessionalAssignments(account.user.role)) return res.status(403).json({ error: 'ASSIGNMENT_PERMISSION_REQUIRED' });
  const assignment = String(account.user.role).toLowerCase() === 'senior_consultant'
    ? await revokeSeniorDelegatedAssignment(req.params.assignmentId, account.accountId, typeof req.body?.reason === 'string' ? req.body.reason : undefined)
    : await revokeProfessionalAssignment(req.params.assignmentId, account.accountId, typeof req.body?.reason === 'string' ? req.body.reason : undefined);
  if (!assignment) return res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
  return res.status(200).json({ assignment });
});
