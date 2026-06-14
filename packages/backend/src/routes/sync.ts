import { Router, Response } from 'express';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { syncPartnerExtras } from '../services/partnerExtrasSync.service';

const router = Router();

// POST /api/sync — manueller Sync (Admin-Button)
router.post('/', requireAuth, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { syncService } = await import('../services/sync.service');
    const ergebnis = await syncService.syncNow(true);

    res.json({ success: true, data: ergebnis });
  } catch (err) {
    next(err);
  }
});

// POST /api/sync/extras?jahr=2025 — Extras-Only-Sync für beliebiges Jahr
router.post('/extras', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    if (isNaN(jahr) || jahr < 2020 || jahr > new Date().getFullYear()) {
      res.status(400).json({ success: false, error: 'Ungültiges Jahr' });
      return;
    }
    const ergebnis = await syncPartnerExtras(jahr);
    res.json({ success: true, data: { ...ergebnis, kalenderjahr: jahr } });
  } catch (err) {
    next(err);
  }
});

// GET /api/sync/status — letzter Sync + Fehlerlog
router.get('/status', requireAuth, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const logs = await prisma.syncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take:    10,
    });

    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

export default router;
