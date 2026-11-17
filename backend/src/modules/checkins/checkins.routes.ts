import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { listDailyCheckIns, upsertDailyCheckIn } from './checkins.repository.js';

export const checkinsRouter = Router();
checkinsRouter.use(requireAuthenticatedAccount);

const schema = z.object({
  dateISO: z.string().datetime(),
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  sleepQuality: z.number().int().min(1).max(5)
});
const owner = (req: Parameters<typeof getAuthenticatedAccount>[0]) => {
  const account = getAuthenticatedAccount(req);
  return { accountId: account.accountId, clientId: account.client.id };
};

checkinsRouter.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  return res.status(200).json({ status: 'stored', checkIn: await upsertDailyCheckIn(owner(req), parsed.data) });
});

checkinsRouter.get('/', async (req, res) => res.status(200).json({
  items: await listDailyCheckIns(owner(req), Math.min(90, Math.max(1, Number(req.query.limit) || 30)))
}));
