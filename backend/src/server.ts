import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { env } from './config/env.js';
import { migrateDatabase } from './db/migrator.js';
import { checkDatabaseReadiness } from './db/pool.js';
import { intelligenceRouter } from './modules/intelligence/intelligence.routes.js';
import { checkinsRouter } from './modules/checkins/checkins.routes.js';
import { nudgesRouter } from './modules/nudges/nudges.routes.js';
import { employerRouter } from './modules/employer/employer.routes.js';
import { wearablesRouter } from './modules/wearables/wearables.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { platformRouter } from './modules/platform/platform.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { biomarkersRouter } from './modules/biomarkers/biomarkers.routes.js';
import { consultantsRouter } from './modules/consultants/consultants.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { bootstrapInitialAdminFromEnvironment } from './modules/admin/admin.service.js';
import { scheduleDeletedReportPurge } from './jobs/purge-deleted-reports.js';

type CreateAppOptions = {
  readinessCheck?: () => Promise<boolean>;
};

export const createApp = (options: CreateAppOptions = {}) => {
  const app = express();
  const readinessCheck = options.readinessCheck ?? checkDatabaseReadiness;

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: env.serviceName });
  });

  app.get('/ready', async (_req, res) => {
    try {
      const databaseReady = await readinessCheck();
      if (!databaseReady) {
        return res.status(503).json({
          ok: false,
          service: env.serviceName,
          checks: {
            database: 'not_ready'
          }
        });
      }

      return res.status(200).json({
        ok: true,
        service: env.serviceName,
        checks: {
          database: 'ready'
        }
      });
    } catch (error) {
      return res.status(503).json({
        ok: false,
        service: env.serviceName,
        checks: {
          database: 'not_ready'
        },
        message: error instanceof Error ? error.message : 'Database readiness check failed.'
      });
    }
  });

  app.get('/v1/version', (_req, res) => {
    res.json({
      service: env.serviceName,
      version: env.version,
      environment: env.environment,
      git_commit: env.gitCommit
    });
  });

  app.use('/v1/intelligence', intelligenceRouter);
  app.use('/v1/checkins', checkinsRouter);
  app.use('/v1/nudges', nudgesRouter);
  app.use('/v1/employer', employerRouter);
  app.use('/v1/wearables', wearablesRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/reports', reportsRouter);
  app.use('/v1/health', healthRouter);
  app.use('/v1/biomarkers', biomarkersRouter);
  app.use('/v1/consultants', consultantsRouter);
  app.use('/v1/admin', adminRouter);
  app.use('/v1/platform', platformRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message });
  });

  return app;
};

export const app = createApp();

export const initializeBackend = async () => {
  await migrateDatabase();
  const adminBootstrap = await bootstrapInitialAdminFromEnvironment();
  console.log('Initial admin bootstrap status', {
    enabled: adminBootstrap.enabled,
    activeAdminExists: adminBootstrap.activeAdminExists,
    bootstrapAuditExists: adminBootstrap.bootstrapAuditExists,
    adminUserFound: adminBootstrap.adminUserFound,
    completed: adminBootstrap.completed,
    reason: 'reason' in adminBootstrap ? adminBootstrap.reason : undefined
  });
  if (adminBootstrap.status === 'bootstrapped') {
    console.log('Initial admin bootstrap completed.');
  }
  scheduleDeletedReportPurge();
};

export const startServer = async () => {
  await initializeBackend();
  return app.listen(env.port, () => {
    console.log(`Fiteatsy backend listening on ${env.port}`);
  });
};

const isDirectRun =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void startServer().catch((error) => {
    console.error(
      error instanceof Error
        ? `Failed to start Fiteatsy backend: ${error.message}`
        : 'Failed to start Fiteatsy backend.'
    );
    process.exitCode = 1;
  });
}
