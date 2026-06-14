/**
 * rateLimit.ts — Rate-Limiting für sicherheitskritische Endpoints
 *
 * loginRateLimiter: 5 Versuche in 15 Min pro IP. Bei Überschreitung 429.
 * Wirkt auf POST /login + POST /set-password + Mitarbeiter-Login.
 * Erfolgreiche Logins zählen NICHT zum Limit (skipSuccessfulRequests).
 */

import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

export const loginRateLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,
  limit:                  5,
  standardHeaders:        'draft-7',
  legacyHeaders:          false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error:   'Zu viele Login-Versuche. Bitte in 15 Minuten erneut versuchen.',
  },
  handler: (req, res, _next, options) => {
    logger.warn({
      ip:    req.ip,
      path:  req.path,
      limit: options.limit,
    }, 'Rate-Limit überschritten');
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Genereller, milderer API-Limiter — z.B. für Sync-Triggern oder
 * Bonusbuchung-Erstellen. 100 Requests / 15 Min pro IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  limit:           100,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message: {
    success: false,
    error:   'Zu viele Anfragen. Bitte kurz warten.',
  },
});
