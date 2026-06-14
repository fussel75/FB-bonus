/**
 * logger.ts — strukturiertes Logging mit pino
 *
 * In Production: JSON-Output (gut maschinenlesbar für log-aggregation)
 * In Development: human-readable über pino-pretty (separat installiert)
 *
 * Log-Level via LOG_LEVEL env (default: info)
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  base: {
    service: 'bonustrack-backend',
    env: process.env.NODE_ENV || 'development',
  },
  // Sensible Werte redacten — bevor sie in Logs landen
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.passwortHash',
      '*.password',
      '*.passwort',
      '*.apiKey',
      '*.api_key',
      '*.apiKeyEncrypted',
      '*.PARTNER_API_KEY',
      '*.JWT_SECRET',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Subset-Logger für ein bestimmtes Modul. */
export function getLogger(modul: string) {
  return logger.child({ modul });
}
