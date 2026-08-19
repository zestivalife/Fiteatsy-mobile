import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { assignRoleAsAdmin, getAdminStatus } from './admin.service.js';
import { assignQaClient, deactivateQa, getQaAssignmentsForAdmin, getQaIdentityForAdmin, issueQaSession, provisionQa, revokeQaClientAssignment } from './qa-provisioning.service.js';

export const adminRouter = Router();

const roleAssignmentSchema = z.object({
  role: z.preprocess(
    (value) => (typeof value === 'string' ? value.toLowerCase() : value),
    z.enum(['user', 'consultant', 'admin'])
  ),
  reason: z.string().trim().max(240).optional()
});

const qaIdentitySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(180),
  mobileNumber: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
  role: z.enum(['user', 'consultant']),
  reason: z.string().trim().min(3).max(240)
});

const qaSessionSchema = z.object({ reason: z.string().trim().min(3).max(240) });
const qaAssignmentSchema = z.object({ consultantUserId: z.string().trim().min(1), clientUserId: z.string().trim().min(1), reason: z.string().trim().min(3).max(240) });
const qaRevokeSchema = z.object({ reason: z.string().trim().min(3).max(240) });

adminRouter.use(requireAuthenticatedAccount);

adminRouter.get('/status', async (req, res) => {
  const result = await getAdminStatus(getAuthenticatedAccount(req));
  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      message: result.message
    });
  }

  return res.status(200).json({
    role: result.role,
    permissions: result.permissions,
    bootstrapConfigured: result.bootstrapConfigured,
    activeAdmins: result.activeAdmins,
    bootstrapAuditRecorded: result.bootstrapAuditRecorded
  });
});

adminRouter.post('/users/:userId/role', async (req, res) => {
  const parsed = roleAssignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      details: parsed.error.flatten()
    });
  }

  const result = await assignRoleAsAdmin(
    getAuthenticatedAccount(req),
    req.params.userId,
    parsed.data.role,
    parsed.data.reason
  );

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      message: result.message
    });
  }

  return res.status(200).json({
    user: {
      id: result.userId,
      role: result.role
    },
    auditEvent: result.auditEvent
  });
});

adminRouter.post('/qa-identities', async (req, res) => {
  const parsed = qaIdentitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await provisionQa(getAuthenticatedAccount(req), parsed.data);
    return res.status(201).json(result);
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return res.status(typed.status ?? 500).json({ error: typed.code ?? 'QA_PROVISIONING_FAILED', message: typed.message });
  }
});

adminRouter.post('/qa-identities/:userId/session', async (req, res) => {
  const parsed = qaSessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await issueQaSession(getAuthenticatedAccount(req), req.params.userId, parsed.data.reason);
    return res.status(201).json(result);
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return res.status(typed.status ?? 500).json({ error: typed.code ?? 'QA_SESSION_FAILED', message: typed.message });
  }
});

adminRouter.get('/qa-identities/:userId', async (req, res) => {
  try {
    const identity = await getQaIdentityForAdmin(getAuthenticatedAccount(req), req.params.userId);
    if (!identity) return res.status(404).json({ error: 'QA_IDENTITY_NOT_FOUND' });
    return res.status(200).json({ identity });
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return res.status(typed.status ?? 500).json({ error: typed.code ?? 'QA_IDENTITY_LOOKUP_FAILED', message: typed.message });
  }
});

adminRouter.post('/qa-identities/:userId/deactivate', async (req, res) => {
  const parsed = qaRevokeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await deactivateQa(getAuthenticatedAccount(req), req.params.userId, parsed.data.reason);
    if (!result) return res.status(404).json({ error: 'QA_IDENTITY_NOT_FOUND' });
    return res.status(200).json(result);
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return res.status(typed.status ?? 500).json({ error: typed.code ?? 'QA_DEACTIVATION_FAILED', message: typed.message });
  }
});

adminRouter.post('/client-assignments', async (req, res) => {
  const parsed = qaAssignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await assignQaClient(getAuthenticatedAccount(req), parsed.data);
    if (!result) return res.status(400).json({ error: 'INVALID_QA_ASSIGNMENT', message: 'Both identities must be active QA accounts with compatible roles.' });
    return res.status(201).json({ assignment: result });
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return res.status(typed.status ?? 500).json({ error: typed.code ?? 'QA_ASSIGNMENT_FAILED', message: typed.message });
  }
});

adminRouter.get('/client-assignments', async (req, res) => {
  try {
    return res.status(200).json({ assignments: await getQaAssignmentsForAdmin(getAuthenticatedAccount(req)) });
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return res.status(typed.status ?? 500).json({ error: typed.code ?? 'QA_ASSIGNMENT_LOOKUP_FAILED', message: typed.message });
  }
});

adminRouter.post('/client-assignments/:assignmentId/revoke', async (req, res) => {
  const parsed = qaRevokeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await revokeQaClientAssignment(getAuthenticatedAccount(req), req.params.assignmentId, parsed.data.reason);
    if (!result) return res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
    return res.status(200).json({ assignment: result });
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return res.status(typed.status ?? 500).json({ error: typed.code ?? 'QA_ASSIGNMENT_REVOKE_FAILED', message: typed.message });
  }
});
