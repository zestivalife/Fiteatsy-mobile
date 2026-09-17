import { Router, type Response } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { canAccessConsultantClientApi } from './consultants.service.js';
import {
  CLIENT_OPERATION_TYPES,
  createClientOperation,
  getConsultantAvailability,
  listClientOperationAudit,
  listClientOperations,
  listConsultantOperations,
  resolveInternalClientId,
  updateClientOperation,
  upsertConsultantAvailability,
} from './client360.repository.js';

export const consultantClient360Router = Router();
consultantClient360Router.use(requireAuthenticatedAccount);
consultantClient360Router.use((req, res, next) => canAccessConsultantClientApi(getAuthenticatedAccount(req)) ? next() : res.status(403).json({ error: 'ROLE_NOT_ALLOWED' }));

const operationSchema = z.object({
  operationType: z.enum(CLIENT_OPERATION_TYPES),
  title: z.string().trim().min(1).max(180),
  detail: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(['OPEN','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED','ARCHIVED']).optional(),
  priority: z.enum(['LOW','NORMAL','HIGH','URGENT']).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});
const updateSchema = operationSchema.partial().extend({ expectedVersion: z.number().int().positive() });

const clientIdFor = async (publicClientId: string, res: Response) => {
  const clientId = await resolveInternalClientId(publicClientId);
  if (!clientId) res.status(404).json({ error: 'CLIENT_NOT_FOUND' });
  return clientId;
};

consultantClient360Router.get('/operations', async (req, res) => {
  const type = CLIENT_OPERATION_TYPES.includes(req.query.type as never)
    ? req.query.type as typeof CLIENT_OPERATION_TYPES[number]
    : undefined;
  return res.json({
    operations: await listConsultantOperations(getAuthenticatedAccount(req).accountId, type),
  });
});

consultantClient360Router.get('/clients/:clientId/operations', async (req, res) => {
  const internalId = await clientIdFor(req.params.clientId, res); if (!internalId) return;
  const type = CLIENT_OPERATION_TYPES.includes(req.query.type as never) ? req.query.type as typeof CLIENT_OPERATION_TYPES[number] : undefined;
  return res.json({ operations: await listClientOperations(internalId, type) });
});

consultantClient360Router.post('/clients/:clientId/operations', async (req, res) => {
  const parsed = operationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
  const key = req.header('idempotency-key');
  if (!key || key.length > 160) return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
  const internalId = await clientIdFor(req.params.clientId, res); if (!internalId) return;
  const result = await createClientOperation(internalId, getAuthenticatedAccount(req).accountId, parsed.data, key);
  return res.status(result.replayed ? 200 : 201).json(result);
});

consultantClient360Router.patch('/clients/:clientId/operations/:operationId', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
  const internalId = await clientIdFor(req.params.clientId, res); if (!internalId) return;
  const { expectedVersion, ...patch } = parsed.data;
  const result = await updateClientOperation(internalId, req.params.operationId, getAuthenticatedAccount(req).accountId, expectedVersion, patch);
  if (result.kind === 'not_found') return res.status(404).json({ error: 'OPERATION_NOT_FOUND' });
  if (result.kind === 'conflict') return res.status(409).json({ error: 'STALE_OPERATION_VERSION', current: result.current });
  return res.json({ operation: result.operation });
});

consultantClient360Router.get('/clients/:clientId/operations-audit', async (req, res) => {
  const internalId = await clientIdFor(req.params.clientId, res); if (!internalId) return;
  return res.json({ events: await listClientOperationAudit(internalId) });
});

const availabilitySchema = z.object({ timezone: z.string().min(1).max(100), schedule: z.array(z.unknown()), unavailableDates: z.array(z.string()), expectedVersion: z.number().int().positive().optional() });
consultantClient360Router.get('/availability', async (req, res) => res.json({ availability: await getConsultantAvailability(getAuthenticatedAccount(req).accountId) }));
consultantClient360Router.put('/availability', async (req, res) => {
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
  const availability = await upsertConsultantAvailability(getAuthenticatedAccount(req).accountId, parsed.data.timezone, parsed.data.schedule, parsed.data.unavailableDates, parsed.data.expectedVersion);
  if (!availability) return res.status(409).json({ error: 'STALE_AVAILABILITY_VERSION' });
  return res.json({ availability });
});
