import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const healthObservability = (req: Request, res: Response, next: NextFunction) => {
  const requested = req.header('x-correlation-id');
  const correlationId = requested && uuid.test(requested) ? requested : crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  res.setHeader('X-Correlation-Id', correlationId);
  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    // Deliberately excludes body, query values, account/client identity, raw
    // health measurements, authentication material and provider record IDs.
    console.info('HEALTH_API_DIAGNOSTIC', {
      correlationId,
      route: req.route?.path ?? req.path.replace(/\/[0-9a-f-]{16,}/ig, '/:id'),
      method: req.method,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      outcome: res.statusCode >= 500 ? 'FAILURE' : res.statusCode >= 400 ? 'REJECTED' : 'SUCCESS'
    });
  });
  next();
};
