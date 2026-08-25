import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireDelegatedAuthority } from '../auth/delegated-authority.middleware.js';
import { executeDelegatedIdempotently } from './delegated-operation-idempotency.js';
import { issueQaAdminSessionHandoff } from '../auth/qa-session-handoff.js';
import { createQaAssignment, deactivateQaIdentity, provisionQaIdentity, recordQaIdentityReuse, resetQaOnboarding, revokeQaAssignment } from './qa-provisioning.repository.js';

export const delegatedRouter = Router();

const identitySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(180),
  mobileNumber: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
  reason: z.string().trim().min(3).max(240),
});
const qaAdminIdentitySchema = identitySchema.strict();
const assignmentSchema = z.object({ consultantUserId: z.string().trim().min(1), clientUserId: z.string().trim().min(1), reason: z.string().trim().min(3).max(240) });
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(240) });

const actorId = (req: Request) => {
  const value = (req as Request & { delegatedAuthority?: { sub?: string } }).delegatedAuthority?.sub;
  if (!value) throw Object.assign(new Error('Delegated actor is missing.'), { status: 401, code: 'INVALID_ACTOR' });
  return value;
};

const respondError = (res: Response, error: unknown, fallback: string) => {
  const typed = error as Error & { status?: number; code?: string };
  return res.status(typed.status ?? 500).json({ error: typed.code ?? fallback, message: typed.status ? typed.message : 'Fiteatsy operation could not be completed.' });
};
const correlationReason = (req: Request, reason: string) => `${reason} [correlation:${req.header('x-correlation-id') || 'unavailable'}]`;

delegatedRouter.post('/qa-clients', requireDelegatedAuthority('fiteatsy.qa.identity.create', 'qa_provisioning'), async (req, res) => {
  const parsed = identitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const delegatedActorId = actorId(req);
    const result = await executeDelegatedIdempotently({ operation: 'qa_client_provision', key: req.header('idempotency-key') || '', execute: () => provisionQaIdentity({ ...parsed.data, reason: correlationReason(req, parsed.data.reason), role: 'user', actorUserId: null, actorReference: delegatedActorId }) });
    const reused = result.replayed || result.value.identityReused;
    return res.status(reused ? 200 : 201).json({ ...result.value, idempotentReplay: reused });
  } catch (error) { return respondError(res, error, 'QA_CLIENT_PROVISIONING_FAILED'); }
});

delegatedRouter.post('/qa-consultants', requireDelegatedAuthority('fiteatsy.qa.identity.create', 'qa_provisioning'), async (req, res) => {
  const parsed = identitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const delegatedActorId = actorId(req);
    const result = await executeDelegatedIdempotently({ operation: 'qa_consultant_provision', key: req.header('idempotency-key') || '', execute: () => provisionQaIdentity({ ...parsed.data, reason: correlationReason(req, parsed.data.reason), role: 'consultant', actorUserId: null, actorReference: delegatedActorId }) });
    const reused = result.replayed || result.value.identityReused;
    return res.status(reused ? 200 : 201).json({ ...result.value, idempotentReplay: reused });
  } catch (error) { return respondError(res, error, 'QA_CONSULTANT_PROVISIONING_FAILED'); }
});

delegatedRouter.post('/qa-senior-consultants', requireDelegatedAuthority('fiteatsy.qa.identity.create', 'qa_provisioning'), async (req, res) => {
  const parsed = identitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const delegatedActorId = actorId(req);
    const result = await executeDelegatedIdempotently({ operation: 'qa_senior_consultant_provision', key: req.header('idempotency-key') || '', execute: () => provisionQaIdentity({ ...parsed.data, reason: correlationReason(req, parsed.data.reason), role: 'senior_consultant', actorUserId: null, actorReference: delegatedActorId }) });
    const reused = result.replayed || result.value.identityReused;
    return res.status(reused ? 200 : 201).json({ ...result.value, idempotentReplay: reused });
  } catch (error) { return respondError(res, error, 'QA_SENIOR_CONSULTANT_PROVISIONING_FAILED'); }
});

delegatedRouter.post('/qa-admins', requireDelegatedAuthority('fiteatsy.qa.admin.create', 'qa_provisioning', 'platform_owner'), async (req, res) => {
  const idempotencyKey = req.header('idempotency-key')?.trim();
  if (!idempotencyKey) return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A non-empty idempotency key is required.' });
  const parsed = qaAdminIdentitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const reason = correlationReason(req, parsed.data.reason);
    const delegatedActorId = actorId(req);
    const result = await executeDelegatedIdempotently({
      operation: 'qa_admin_provision',
      key: idempotencyKey,
      execute: () => provisionQaIdentity({ ...parsed.data, reason, role: 'admin', actorUserId: null, actorReference: delegatedActorId })
    });
    if (result.replayed) {
      await recordQaIdentityReuse({ actorUserId: null, actorReference: delegatedActorId, targetUserId: result.value.user.id, role: 'admin', reason });
    }
    const reused = result.replayed || result.value.identityReused;
    return res.status(reused ? 200 : 201).json({ ...result.value, idempotentReplay: reused });
  } catch (error) { return respondError(res, error, 'QA_ADMIN_PROVISIONING_FAILED'); }
});

delegatedRouter.post('/client-assignments', requireDelegatedAuthority('fiteatsy.client.assign', 'client_assignment'), async (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await executeDelegatedIdempotently({ operation: 'client_assignment', key: req.header('idempotency-key') || '', execute: async () => {
      const assignment = await createQaAssignment({ ...parsed.data, reason: correlationReason(req, parsed.data.reason), actorUserId: actorId(req) });
      if (!assignment) throw Object.assign(new Error('Both identities must be active QA accounts with compatible roles.'), { status: 400, code: 'INVALID_QA_ASSIGNMENT' });
      return { assignment };
    } });
    return res.status(result.replayed ? 200 : 201).json({ ...result.value, idempotentReplay: result.replayed });
  } catch (error) { return respondError(res, error, 'QA_ASSIGNMENT_FAILED'); }
});

delegatedRouter.delete('/client-assignments/:assignmentId', requireDelegatedAuthority('fiteatsy.client.assignment.revoke', 'client_assignment'), async (req, res) => {
  try {
    const result = await revokeQaAssignment({ actorUserId: actorId(req), assignmentId: String(req.params.assignmentId), reason: correlationReason(req, String(req.body?.reason || 'Delegated assignment revocation')) });
    if (!result) return res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment was not found or is already revoked.' });
    return res.status(200).json({ assignment: result });
  } catch (error) { return respondError(res, error, 'QA_ASSIGNMENT_REVOKE_FAILED'); }
});

delegatedRouter.post('/qa-identities/:userId/deactivate', requireDelegatedAuthority('fiteatsy.qa.identity.deactivate', 'qa_provisioning'), async (req, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await deactivateQaIdentity({ actorUserId: actorId(req), userId: String(req.params.userId), reason: correlationReason(req, parsed.data.reason) });
    if (!result) return res.status(404).json({ error: 'QA_IDENTITY_NOT_FOUND', message: 'Active QA identity was not found.' });
    return res.status(200).json(result);
  } catch (error) { return respondError(res, error, 'QA_DEACTIVATION_FAILED'); }
});

delegatedRouter.post('/qa-identities/:userId/session', requireDelegatedAuthority('fiteatsy.qa.session.issue', 'qa_session'), async (req, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const userId = String(req.params.userId);
    const handoff = await issueQaAdminSessionHandoff({
      actorReference: actorId(req),
      targetUserId: userId,
      reason: correlationReason(req, parsed.data.reason)
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.status(201).json({ userId, handoff: 'one_time_exchange', exchange: handoff });
  } catch (error) { return respondError(res, error, 'QA_SESSION_FAILED'); }
});

delegatedRouter.post('/qa-identities/:userId/onboarding/reset', requireDelegatedAuthority('fiteatsy.qa.onboarding.reset', 'qa_provisioning'), async (req, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await resetQaOnboarding({ actorUserId: actorId(req), userId: String(req.params.userId), reason: correlationReason(req, parsed.data.reason) });
    if (!result) return res.status(404).json({ error: 'QA_CLIENT_NOT_FOUND', message: 'Active QA client was not found.' });
    return res.status(200).json(result);
  } catch (error) { return respondError(res, error, 'QA_ONBOARDING_RESET_FAILED'); }
});
