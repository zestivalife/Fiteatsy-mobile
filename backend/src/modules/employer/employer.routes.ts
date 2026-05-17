import { Router } from 'express';

export const employerRouter = Router();

employerRouter.get('/dashboard', (_req, res) => {
  return res.json({
    stressTrend: [48, 51, 49, 45],
    burnoutSignals: {
      none: 62,
      watch: 30,
      alert: 8
    },
    departmentComparison: [
      { department: 'Engineering', risk: 43 },
      { department: 'Sales', risk: 57 },
      { department: 'Support', risk: 46 }
    ],
    roi: {
      absenteeismDeltaPct: -11,
      productivityDeltaPct: 7
    },
    note: 'Aggregated only. No individual-level records are exposed.'
  });
});
