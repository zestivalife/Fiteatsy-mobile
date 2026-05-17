import { Router } from 'express';
import { canSendNudge } from './nudges.service.js';

export const nudgesRouter = Router();

nudgesRouter.post('/dispatch-check', (req, res) => {
  const allowed = canSendNudge({
    now: new Date(req.body?.now ?? Date.now()),
    inMeeting: Boolean(req.body?.inMeeting),
    nudgesSentToday: Number(req.body?.nudgesSentToday ?? 0)
  });

  return res.json({ allowed });
});
