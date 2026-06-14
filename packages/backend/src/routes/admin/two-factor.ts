/**
 * /api/admin/two-factor — 2FA-Verwaltung für Admins
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';
import { twoFactorService } from '../../services/twoFactor.service';

const router = Router();

router.get('/status', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!req.admin?.sub) throw new AppError(401, 'Nicht authentifiziert');
    const status = await twoFactorService.status(req.admin.sub);
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
});

router.post('/setup', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!req.admin?.sub) throw new AppError(401, 'Nicht authentifiziert');
    const setup = await twoFactorService.setupBeginnen(req.admin.sub);
    // Secret + QR-Code an Frontend — NICHT loggen!
    res.json({ success: true, data: setup });
  } catch (err) { next(err); }
});

const bestaetigenSchema = z.object({ token: z.string().regex(/^\d{6}$/, '6 Ziffern erwartet') });
router.post('/verify-setup', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = bestaetigenSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültiger Code');
    if (!req.admin?.sub) throw new AppError(401, 'Nicht authentifiziert');
    const result = await twoFactorService.setupBestaetigen(req.admin.sub, body.data.token);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Code falsch')) {
      next(new AppError(400, err.message));
    } else {
      next(err);
    }
  }
});

router.post('/deactivate', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.admin?.sub) throw new AppError(401, 'Nicht authentifiziert');
    await twoFactorService.deaktivieren(req.admin.sub);
    res.json({ success: true, data: { message: '2FA deaktiviert' } });
  } catch (err) { next(err); }
});

export default router;
