import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { syncClientMedicationSnapshot } from './medications.service.js';

const frequencySchema = z.object({
  preset: z.enum(['every_day', 'alternate_days', 'specific_weekdays', 'every_x_days', 'weekly', 'monthly', 'custom']),
  intervalDays: z.number().int().positive().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  monthlyDays: z.array(z.number().int().min(1).max(31)).optional(),
  customRule: z.string().optional()
});

const medicationSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  type: z.enum(['tablet', 'capsule', 'syrup', 'injection', 'drops', 'powder']),
  dosage: z.string().trim().min(1),
  schedule: z.object({
    frequency: frequencySchema,
    timeSlots: z.array(z.object({
      id: z.string().min(1),
      time24h: z.string().regex(/^\d{2}:\d{2}$/),
      mealRelation: z.enum(['before_meal', 'after_meal', 'with_meal', 'empty_stomach'])
    })),
    duration: z.object({
      startDateISO: z.string().datetime(),
      endDateISO: z.string().datetime().nullable(),
      ongoing: z.boolean()
    })
  }),
  reminderSound: z.enum(['default', 'soft', 'bell', 'medical_alert']),
  status: z.enum(['active', 'paused']),
  notificationEnabled: z.boolean(),
  createdAtISO: z.string().datetime(),
  updatedAtISO: z.string().datetime()
});

const medicationLogSchema = z.object({
  id: z.string().min(1),
  medicationId: z.string().min(1),
  scheduledForISO: z.string().datetime(),
  status: z.enum(['taken', 'upcoming', 'missed', 'snoozed', 'skipped']),
  actionedAtISO: z.string().datetime().nullable(),
  snoozedUntilISO: z.string().datetime().nullable(),
  note: z.string().optional().nullable()
});

const snapshotSchema = z.object({
  medications: z.array(medicationSchema).max(200),
  logs: z.array(medicationLogSchema).max(5000)
});

export const medicationsRouter = Router();
medicationsRouter.use(requireAuthenticatedAccount);

const currentOwner = (req: Request) => {
  const account = getAuthenticatedAccount(req);
  return { accountId: account.accountId, clientId: account.client.id };
};

medicationsRouter.post('/snapshot', async (req: Request, res: Response) => {
  const parsed = snapshotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }

  const logs = parsed.data.logs.map((log) => ({ ...log, note: log.note ?? null }));
  const result = await syncClientMedicationSnapshot(currentOwner(req), parsed.data.medications, logs);
  return res.status(200).json(result);
});
