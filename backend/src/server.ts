import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { intelligenceRouter } from './modules/intelligence/intelligence.routes.js';
import { checkinsRouter } from './modules/checkins/checkins.routes.js';
import { nudgesRouter } from './modules/nudges/nudges.routes.js';
import { employerRouter } from './modules/employer/employer.routes.js';
import { wearablesRouter } from './modules/wearables/wearables.routes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nuetra-backend' });
});

app.use('/v1/intelligence', intelligenceRouter);
app.use('/v1/checkins', checkinsRouter);
app.use('/v1/nudges', nudgesRouter);
app.use('/v1/employer', employerRouter);
app.use('/v1/wearables', wearablesRouter);

app.listen(env.port, () => {
  console.log(`Nuetra backend listening on ${env.port}`);
});
