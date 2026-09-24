import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { getNotificationPreferences, updateNotificationPreferences } from './preferences.repository.js';
import { CONSULTANT_ACCESS_POLICY_VERSION, listConsultantAccessRequests, resolveConsultantClientAccess, setConsultantAccessDecision } from '../consultant-access/consultant-access.repository.js';

export const preferencesRouter=Router();
preferencesRouter.use(requireAuthenticatedAccount);
const notificationSchema=z.object({all:z.boolean(),hydration:z.boolean(),nutrition:z.boolean(),medication:z.boolean(),consultation:z.boolean(),followUp:z.boolean(),subscription:z.boolean(),account:z.boolean(),general:z.boolean(),version:z.number().int().positive().optional()});
preferencesRouter.get('/notifications',async(req,res)=>res.json({preferences:await getNotificationPreferences(getAuthenticatedAccount(req).user.id)}));
preferencesRouter.put('/notifications',async(req,res)=>{const parsed=notificationSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'INVALID_NOTIFICATION_PREFERENCES',details:parsed.error.flatten()});const {version,...value}=parsed.data;const saved=await updateNotificationPreferences(getAuthenticatedAccount(req).user.id,version,value);return saved?res.json({preferences:saved}):res.status(409).json({error:'PREFERENCE_VERSION_CONFLICT',preferences:await getNotificationPreferences(getAuthenticatedAccount(req).user.id)});});
preferencesRouter.get('/consultant-access',async(req,res)=>{
  const account=getAuthenticatedAccount(req);
  const requests=await listConsultantAccessRequests(account.user.id);
  return res.json({requests,consent:requests[0]??{status:'NOT_REQUESTED',policyVersion:CONSULTANT_ACCESS_POLICY_VERSION}});
});
preferencesRouter.put('/consultant-access',async(req,res)=>{
  const parsed=z.object({assignmentId:z.string().uuid(),status:z.enum(['GRANTED','REVOKED']),policyVersion:z.literal(CONSULTANT_ACCESS_POLICY_VERSION)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'INVALID_CONSENT'});
  const account=getAuthenticatedAccount(req);
  const consent=await setConsultantAccessDecision({clientUserId:account.user.id,internalClientId:account.client.id,assignmentId:parsed.data.assignmentId,status:parsed.data.status,source:'PROFILE',policyVersion:parsed.data.policyVersion});
  return consent?res.json({consent}):res.status(404).json({error:'CONSULTANT_ASSIGNMENT_NOT_FOUND'});
});
export const requireGrantedConsultantAccess=async(req:any,res:any,next:any)=>{try{const account=getAuthenticatedAccount(req);const result=await resolveConsultantClientAccess(account.user.id,String(req.params.clientId));return result.authorized?next():res.status(403).json({error:'CONSULTANT_ACCESS_CONSENT_REQUIRED'});}catch(error){next(error);}};
