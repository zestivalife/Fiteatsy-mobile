import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { assignRoleAsAdmin, getAdminStatus } from './admin.service.js';
import { diagnoseFiteatsyIntakeLeadSearch, listFiteatsyIntakeLeads } from './admin.repository.js';
import { issueTemporaryLoginPin } from '../auth/auth.service.js';
import { assignQaClient, deactivateQa, getQaAssignmentsForAdmin, getQaIdentityForAdmin, issueQaSession, provisionQa, resetQaClientOnboarding, revokeQaClientAssignment } from './qa-provisioning.service.js';
import { addAdminCommonFoodAlias, addAdminCommonFoodServing, CommonFoodAdminError, inspectAdminCommonFood, listAdminCommonFoodAudit, listAdminCommonFoods, removeAdminCommonFoodAlias, setAdminCommonFoodMeal, setAdminCommonFoodRole, setAdminCommonFoodServingState, setAdminCommonFoodState } from './common-food-admin.service.js';

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
  role: z.enum(['user', 'consultant', 'senior_consultant']),
  reason: z.string().trim().min(3).max(240)
});

const qaSessionSchema = z.object({ reason: z.string().trim().min(3).max(240) });
const qaAssignmentSchema = z.object({ consultantUserId: z.string().trim().min(1), clientUserId: z.string().trim().min(1), reason: z.string().trim().min(3).max(240) });
const qaRevokeSchema = z.object({ reason: z.string().trim().min(3).max(240) });

adminRouter.use(requireAuthenticatedAccount);
const assertSuperAdmin = (req: import('express').Request, res: import('express').Response) => {
  const role = String(getAuthenticatedAccount(req).user.role ?? '').toLowerCase();
  if (!['admin', 'super_admin', 'platform_owner'].includes(role)) {
    res.status(403).json({ error: 'SUPER_ADMIN_REQUIRED', message: 'Super Admin authority is required.' });
    return false;
  }
  return true;
};
const adminReason=z.string().trim().min(3).max(240);
const adminError=(res:import('express').Response,error:unknown)=>{if(error instanceof CommonFoodAdminError)return res.status(error.statusCode).json({error:error.code,message:error.message});throw error;};
adminRouter.get('/common-foods',async(req,res)=>{const parsed=z.object({active:z.enum(['true','false']).transform(x=>x==='true').optional(),category:z.string().optional(),family:z.string().optional(),sourcePolicy:z.string().optional(),generatorEligible:z.enum(['true','false']).transform(x=>x==='true').optional(),mealHead:z.string().optional()}).safeParse(req.query);if(!parsed.success)return res.status(400).json({error:'INVALID_INPUT'});try{return res.json(await listAdminCommonFoods(getAuthenticatedAccount(req),parsed.data));}catch(e){return adminError(res,e);}});
adminRouter.get('/common-foods/:foodId',async(req,res)=>{try{return res.json(await inspectAdminCommonFood(getAuthenticatedAccount(req),req.params.foodId));}catch(e){return adminError(res,e);}});
adminRouter.patch('/common-foods/:foodId/state',async(req,res)=>{const parsed=z.object({active:z.boolean().optional(),generatorEligible:z.boolean().optional(),reason:adminReason}).refine(x=>x.active!==undefined||x.generatorEligible!==undefined).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'INVALID_INPUT'});try{return res.json(await setAdminCommonFoodState(getAuthenticatedAccount(req),req.params.foodId,parsed.data));}catch(e){return adminError(res,e);}});
adminRouter.post('/common-foods/:foodId/aliases',async(req,res)=>{const parsed=z.object({alias:z.string().trim().min(1),reason:adminReason}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'INVALID_INPUT'});try{return res.status(201).json(await addAdminCommonFoodAlias(getAuthenticatedAccount(req),req.params.foodId,parsed.data));}catch(e){return adminError(res,e);}});
adminRouter.delete('/common-foods/:foodId/aliases/:aliasId',async(req,res)=>{const parsed=z.object({reason:adminReason}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'INVALID_INPUT'});try{return res.json(await removeAdminCommonFoodAlias(getAuthenticatedAccount(req),req.params.foodId,req.params.aliasId,parsed.data.reason));}catch(e){return adminError(res,e);}});
adminRouter.post('/common-foods/:foodId/servings',async(req,res)=>{const parsed=z.object({displayName:z.string().min(1),grams:z.number().positive(),minMultiplier:z.number().positive(),maxMultiplier:z.number().positive(),allowedMultipliers:z.array(z.number().positive()).min(1),reason:adminReason}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'INVALID_INPUT'});try{return res.status(201).json(await addAdminCommonFoodServing(getAuthenticatedAccount(req),req.params.foodId,parsed.data));}catch(e){return adminError(res,e);}});
adminRouter.patch('/common-foods/:foodId/servings/:servingId/state',async(req,res)=>{const parsed=z.object({active:z.boolean(),reason:adminReason}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'INVALID_INPUT'});try{return res.json(await setAdminCommonFoodServingState(getAuthenticatedAccount(req),req.params.foodId,req.params.servingId,parsed.data));}catch(e){return adminError(res,e);}});
adminRouter.get('/common-foods/:foodId/audit',async(req,res)=>{try{return res.json(await listAdminCommonFoodAudit(getAuthenticatedAccount(req),req.params.foodId));}catch(e){return adminError(res,e);}});
adminRouter.put('/common-foods/:foodId/meal-eligibility',async(req,res)=>{const parsed=z.object({mealHead:z.string().min(1),eligible:z.boolean(),reason:adminReason}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'INVALID_INPUT'});try{return res.json(await setAdminCommonFoodMeal(getAuthenticatedAccount(req),req.params.foodId,parsed.data));}catch(e){return adminError(res,e);}});
adminRouter.put('/common-foods/:foodId/roles',async(req,res)=>{const parsed=z.object({role:z.string().min(1),enabled:z.boolean(),reason:adminReason}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'INVALID_INPUT'});try{return res.json(await setAdminCommonFoodRole(getAuthenticatedAccount(req),req.params.foodId,parsed.data));}catch(e){return adminError(res,e);}});

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

adminRouter.get('/intake-leads', async (req, res) => {
  if (!assertSuperAdmin(req, res)) return;
  const parsed = z.object({
    q: z.string().trim().max(180).default(''),
    status: z.enum(['all', 'active', 'inactive']).default('all'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  const result = await listFiteatsyIntakeLeads({
    query: parsed.data.q,
    status: parsed.data.status,
    order: parsed.data.order,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize
  });
  const diagnostic = result.pagination.total === 0 && parsed.data.q
    ? await diagnoseFiteatsyIntakeLeadSearch(parsed.data.q)
    : null;
  return res.status(200).json({ ...result, diagnostic });
});

adminRouter.post('/users/:userId/temporary-login-pin', async (req, res) => {
  if (!assertSuperAdmin(req, res)) return;
  const parsed = z.object({ reason: z.string().trim().min(3).max(240) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const actor = getAuthenticatedAccount(req);
    const result = await issueTemporaryLoginPin(actor.user.id, req.params.userId, {
      userAgent: req.header('user-agent') ?? null,
      ipAddress: req.ip || null
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ ...result, displayOnce: true });
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    return res.status(typed.code === 'PIN_USER_NOT_FOUND' ? 404 : 500).json({ error: typed.code ?? 'PIN_ISSUE_FAILED', message: typed.message });
  }
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

adminRouter.post('/qa-identities/:userId/onboarding/reset', async (req, res) => {
  const parsed = qaRevokeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  try {
    const result = await resetQaClientOnboarding(getAuthenticatedAccount(req), req.params.userId, parsed.data.reason);
    if (!result) return res.status(404).json({ error: 'QA_CLIENT_NOT_FOUND' });
    return res.status(200).json(result);
  } catch (error) {
    const typed = error as Error & { status?: number; code?: string };
    return res.status(typed.status ?? 500).json({ error: typed.code ?? 'QA_ONBOARDING_RESET_FAILED', message: typed.message });
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
