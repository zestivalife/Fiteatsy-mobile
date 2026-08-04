import { Router } from 'express';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';
import {
  BiomarkerObservationRecord,
  countBiomarkerHistory,
  listBiomarkerHistory,
  listBiomarkers
} from './biomarkers.repository.js';

export const biomarkersRouter = Router();

const currentOwner = (account: ReturnType<typeof getAuthenticatedAccount>): ClientOwnershipContext => ({
  accountId: account.accountId,
  clientId: account.client.id
});

const toBiomarkerObservationDto = (observation: BiomarkerObservationRecord, fiteatsyClientId: string) => ({
  id: observation.id,
  fiteatsyClientId,
  biomarkerId: observation.biomarkerId,
  biomarkerName: observation.biomarkerName,
  sourceReportId: observation.sourceReportId,
  value: observation.value,
  unit: observation.unit,
  testDate: observation.testDate,
  confidence: observation.confidence,
  validationStatus: observation.validationStatus,
  createdAtISO: observation.createdAtISO
});

biomarkersRouter.use(requireAuthenticatedAccount);

biomarkersRouter.get('/', async (_req, res) => {
  const items = await listBiomarkers();
  return res.status(200).json({ total: items.length, items });
});

biomarkersRouter.get('/history', async (req, res) => {
  const account = getAuthenticatedAccount(req);
  const owner = currentOwner(account);
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const biomarkerId =
    typeof req.query.biomarkerId === 'string' && req.query.biomarkerId.trim() ? req.query.biomarkerId.trim() : undefined;
  const [items, total] = await Promise.all([
    listBiomarkerHistory(owner, { biomarkerId, limit, offset }),
    countBiomarkerHistory(owner, biomarkerId)
  ]);
  return res.status(200).json({
    total,
    limit,
    offset,
    items: items.map((item) => toBiomarkerObservationDto(item, account.client.fiteatsyClientId))
  });
});
