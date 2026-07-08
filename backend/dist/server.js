import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { env } from './config/env.js';
import { intelligenceRouter } from './modules/intelligence/intelligence.routes.js';
import { checkinsRouter } from './modules/checkins/checkins.routes.js';
import { nudgesRouter } from './modules/nudges/nudges.routes.js';
import { employerRouter } from './modules/employer/employer.routes.js';
import { wearablesRouter } from './modules/wearables/wearables.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { platformRouter } from './modules/platform/platform.routes.js';
export const createApp = () => {
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
    app.use('/v1/auth', authRouter);
    app.use('/v1/reports', reportsRouter);
    app.use('/v1/platform', platformRouter);
    return app;
};
export const app = createApp();
export const startServer = () => app.listen(env.port, () => {
    console.log(`Nuetra backend listening on ${env.port}`);
});
const isDirectRun = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    startServer();
}
