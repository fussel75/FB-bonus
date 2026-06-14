/**
 * sentry.ts — optionales Error-Tracking via Sentry
 *
 * Aktiv nur wenn SENTRY_DSN gesetzt ist. Ohne DSN: silent no-op.
 * Tracesample 0.1 (10 %) als Default — bei Bedarf via SENTRY_TRACES env anpassen.
 */

import * as Sentry from '@sentry/node';
import type { Application } from 'express';
import { logger } from './logger';

let isInitialized = false;

export function initSentry(app: Application) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('Sentry: SENTRY_DSN nicht gesetzt — Error-Tracking deaktiviert');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES ?? '0.1'),
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
    ],
  });

  isInitialized = true;
  logger.info({ dsn: dsn.replace(/:[^@]+@/, ':[REDACTED]@') }, 'Sentry: aktiviert');
}

export function getSentry() {
  return isInitialized ? Sentry : null;
}

export { Sentry };
