/**
 * /api/prognose — Hochrechnung auf Basis laufender Projekte
 *
 * GET /api/prognose?jahr=2024           → Mitarbeiter-Prognose (Min/Base/Max)
 * GET /api/prognose/:mitarbeiterId?jahr → Prognose für einen Mitarbeiter
 * GET /api/prognose/projekte?jahr=2024  → Projekt-Sensitivitätsanalyse (NEU Schritt 10)
 */

import { Router, Response } from 'express';
import { requireAuth }       from '../middleware/auth';
import { AppError }          from '../middleware/errorHandler';
import { prognoseService }   from '../services/prognose.service';
import { AuthenticatedRequest } from '../types';

const router = Router();

// ─── POST /api/prognose/simulation ─────────────────────────────────────────────
router.post('/simulation', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { jahr, overrides } = req.body as {
      jahr?:      number;
      overrides?: { projektId: number; abschlussAuslastungProzent: number }[];
    };
    const ergebnis = await prognoseService.simuliereBonus(
      jahr ?? new Date().getFullYear(),
      overrides ?? [],
    );
    res.json({ success: true, data: ergebnis });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/prognose/projekte?jahr=2024 (VOR :mitarbeiterId registrieren!) ──
router.get('/projekte', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    const ergebnis = await prognoseService.berechneProjektSensitivitaet(jahr);

    res.json({ success: true, data: ergebnis });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/prognose?jahr=2024 ──────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    const ergebnis = await prognoseService.berechnePrognose(jahr);

    res.json({ success: true, data: ergebnis });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/prognose/:mitarbeiterId?jahr=2024 ───────────────────────────────
router.get('/:mitarbeiterId', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const mitarbeiterId = Number(req.params.mitarbeiterId);
    if (isNaN(mitarbeiterId)) throw new AppError(400, 'Ungültige Mitarbeiter-ID');

    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    const ergebnis = await prognoseService.berechnePrognose(jahr);

    const maPrognose = ergebnis.ergebnisse.find((e) => e.mitarbeiterId === mitarbeiterId);
    if (!maPrognose) throw new AppError(404, 'Mitarbeiter nicht gefunden');

    res.json({
      success: true,
      data: {
        ...maPrognose,
        jahresfortschritt: ergebnis.jahresfortschritt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
