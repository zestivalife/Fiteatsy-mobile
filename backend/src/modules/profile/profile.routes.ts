import { Router } from 'express';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { getHealthProfileBundle } from '../platform/platform.service.js';

export const profileRouter = Router();

profileRouter.use(requireAuthenticatedAccount);

profileRouter.get('/completion', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const bundle = await getHealthProfileBundle({
    accountId: account.accountId,
    clientId: account.client.id
  });

  if (!bundle) {
    return res.status(404).json({ error: 'HEALTH_PROFILE_NOT_FOUND' });
  }

  return res.status(200).json({
    completionPercent: bundle.nutrition.completionPercent,
    readinessScore: bundle.nutrition.readinessScore,
    aiReady: bundle.nutrition.aiReady,
    missingFields: bundle.nutrition.missingFields,
    sections: bundle.nutrition.sectionScores.map((section) => ({
      name: section.section,
      completion: section.percent,
      missing: section.missing
    }))
  });
});
