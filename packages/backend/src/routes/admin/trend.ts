/**
 * /api/admin/trend — Mehrjahres-Bonus-Trend pro Mitarbeiter
 *
 * GET /api/admin/trend/:mitarbeiterId
 *   → Liefert ein Array { jahr, gesamt, optionA, optionB, qualifiziert }
 *     für jedes Jahr, in dem eine Auszahlung existiert (sortiert auf-/absteigend).
 *
 * Quelle: tatsächliche Auszahlung-Records (nicht Live-Berechnung) — historische
 * Werte bleiben so stabil, auch wenn sich Konfigurationen später ändern.
 */

import { Router, Response } from 'express';
import { prisma } from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';

const router = Router();

router.get('/:mitarbeiterId', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const mitarbeiterId = Number(req.params.mitarbeiterId);
    if (isNaN(mitarbeiterId)) throw new AppError(400, 'Ungültige ID');

    const auszahlungen = await prisma.auszahlung.findMany({
      where:    { mitarbeiterId },
      orderBy:  { kalenderjahr: 'asc' },
      select: {
        kalenderjahr: true,
        betragGesamt: true,
        betragOptionA: true,
        betragOptionB: true,
        betragBrutto: true,
        krankenKuerzungEur: true,
        status: true,
      },
    });

    const trend = auszahlungen.map((a) => ({
      jahr:                a.kalenderjahr,
      gesamt:              Number(a.betragGesamt),
      brutto:              Number(a.betragBrutto),
      kuerzung:            Number(a.krankenKuerzungEur),
      optionA:             Number(a.betragOptionA),
      optionB:             Number(a.betragOptionB),
      ausgezahlt:          a.status === 'ausgezahlt',
      storniert:           a.status === 'storniert',
    }));

    res.json({ success: true, data: trend });
  } catch (err) {
    next(err);
  }
});

export default router;
