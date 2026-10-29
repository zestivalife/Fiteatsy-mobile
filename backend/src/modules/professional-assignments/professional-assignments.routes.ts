import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { ensureRegisteredClientsForEligibleUsers } from '../consultants/consultants.repository.js';
import { createProfessionalAssignment, createProfessionalAssignmentsBatch, discoverClientsForAssignment, discoverProfessionalsForAssignment, listClientAllocationPool, listProfessionalAssignments, ReassignmentRequiredError, revokeProfessionalAssignment, type ProfessionalType } from './professional-assignments.repository.js';

export const professionalAssignmentsRouter = Router();
professionalAssignmentsRouter.use(requireAuthenticatedAccount);

export const canManageProfessionalAssignments = (role: string | null | undefined) => ['admin', 'super_admin', 'platform_owner', 'senior_consultant', 'care_operations'].includes(String(role).toLowerCase());
const assignmentSchema = z.object({ clientUserId: z.string().min(1), professionalUserId: z.string().min(1), professionalType: z.enum(['CONSULTANT', 'PRACTITIONER', 'MENTOR']), relationshipType: z.string().trim().min(2).max(80), reason: z.string().trim().max(240).optional(), allowReassignment: z.boolean().optional().default(false) });
const assignmentBatchSchema = assignmentSchema.omit({ clientUserId: true }).extend({ clientUserIds: z.array(z.string().uuid()).min(1).max(100).transform((values) => [...new Set(values)]) });

professionalAssignmentsRouter.get('/clients/search', async (req, res) => {
  if (!canManageProfessionalAssignments(getAuthenticatedAccount(req).user.role)) return res.status(403).json({ error: 'ASSIGNMENT_PERMISSION_REQUIRED' });
  await ensureRegisteredClientsForEligibleUsers();
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
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
  return res.status(200).json({ clients: await listClientAllocationPool({ query, limit, offset, assignmentFilter, professionalUserId: account.accountId }) });
});

professionalAssignmentsRouter.get('/professionals', async (req, res) => {
  if (!canManageProfessionalAssignments(getAuthenticatedAccount(req).user.role)) return res.status(403).json({ error: 'ASSIGNMENT_PERMISSION_REQUIRED' });
  const type = typeof req.query.type === 'string' && ['CONSULTANT', 'PRACTITIONER', 'MENTOR'].includes(req.query.type) ? req.query.type as ProfessionalType : undefined;
  return res.status(200).json({ professionals: await discoverProfessionalsForAssignment(type) });
});

professionalAssignmentsRouter.get('/', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  if (!canManageProfessionalAssignments(account.user.role)) return res.status(200).json({ assignments: await listProfessionalAssignments(account.accountId) });
  return res.status(200).json({ assignments: await listProfessionalAssignments() });
});

professionalAssignmentsRouter.post('/', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  if (!canManageProfessionalAssignments(account.user.role)) return res.status(403).json({ error: 'ASSIGNMENT_PERMISSION_REQUIRED' });
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  let assignment;
  try {
    assignment = await createProfessionalAssignment({ ...parsed.data, actorUserId: account.accountId, professionalType: parsed.data.professionalType as ProfessionalType });
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
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const assignments = await createProfessionalAssignmentsBatch({ ...parsed.data, actorUserId: account.accountId, professionalType: parsed.data.professionalType as ProfessionalType });
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
  const assignment = await revokeProfessionalAssignment(req.params.assignmentId, account.accountId, typeof req.body?.reason === 'string' ? req.body.reason : undefined);
  if (!assignment) return res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
  return res.status(200).json({ assignment });
});
