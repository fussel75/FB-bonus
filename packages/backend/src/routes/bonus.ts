/**
 * /api/bonus — Bonus-Routen
 *
 * GET  /api/bonus/uebersicht?jahr=2024          → Jahresübersicht alle MA (Admin)
 * GET  /api/bonus/:mitarbeiterId?jahr=2024       → Buchungshistorie eines MA
 * GET  /api/bonus/:mitarbeiterId/berechnung?jahr → Live-Berechnung für einen MA
 * POST /api/bonus/berechnen?jahr=2024            → Vorschau Jahresbonus alle MA (Admin)
 * POST /api/bonus/option-a                       → Zusatzstunden-Buchung manuell (Admin)
 *
 * AUDIT-TRAIL-REGEL: Bonusbuchungen sind unveränderlich.
 * In dieser Datei: kein UPDATE, kein DELETE auf bonusbuchungen.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { BonusTyp, Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { bonusService } from '../services/bonus.service';
import { konfigService } from '../services/konfiguration.service';
import { AuthenticatedRequest } from '../types';

const router = Router();

// ─── GET /api/bonus/uebersicht?jahr=2024 ─────────────────────────────────────
// Jahresübersicht aller Mitarbeiter (Admin-Dashboard KPI)
router.get('/uebersicht', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    const ergebnisse = await bonusService.berechneJahresbonus(jahr);

    // Aggregierte KPIs für Admin-Dashboard
    const qualifiziert  = ergebnisse.filter((e) => e.qualifiziert);
    const gesamtTopf    = qualifiziert.reduce((s, e) => s + e.gesamtBetrag, 0);
    const topfOptionA   = qualifiziert.reduce((s, e) => s + e.optionA_betrag, 0);
    const topfOptionB   = qualifiziert.reduce((s, e) => s + e.optionB_betrag, 0);

    res.json({
      success: true,
      data: {
        kalenderjahr:          jahr,
        gesamtTopf:            Math.round(gesamtTopf * 100) / 100,
        topfOptionA:           Math.round(topfOptionA * 100) / 100,
        topfOptionB:           Math.round(topfOptionB * 100) / 100,
        anzahlMitarbeiter:     ergebnisse.length,
        anzahlQualifiziert:    qualifiziert.length,
        anzahlNichtQualifiziert: ergebnisse.length - qualifiziert.length,
        mitarbeiter:           ergebnisse,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bonus/berechnen?jahr=2024 ─────────────────────────────────────
// Vorschau für Jahresabschluss-Wizard (Schritt 1)
router.post('/berechnen', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    const ergebnis = await bonusService.berechneJahresbonus(jahr);

    res.json({ success: true, data: ergebnis });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bonus/option-a ────────────────────────────────────────────────
// Manuelle Zusatzstunden-Buchung durch Admin (Option A)
// AUDIT-TRAIL: nur INSERT — kein UPDATE, kein DELETE
const optionASchema = z.object({
  mitarbeiterId: z.number().int().positive(),
  stunden:       z.number().positive('Stunden müssen positiv sein'),
  buchungsdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  beschreibung:  z.string().optional(),
  projektId:     z.number().int().positive().optional(),
});

router.post('/option-a', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = optionASchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const { mitarbeiterId, stunden, buchungsdatum, beschreibung, projektId } = body.data;

    // Mitarbeiter prüfen
    const ma = await prisma.mitarbeiter.findUnique({ where: { id: mitarbeiterId } });
    if (!ma) throw new AppError(404, 'Mitarbeiter nicht gefunden');

    // Stundensatz aus Konfiguration (nie hardcoded)
    const satz = Number(await konfigService.getTypisiert('stundensatz_option_a')) || 5;

    const betragEur = new Prisma.Decimal(stunden * satz);

    // NUR INSERT — keine Updates auf bestehende Buchungen (Audit-Trail)
    const buchung = await prisma.bonusbuchung.create({
      data: {
        mitarbeiterId,
        projektId:     projektId ?? null,
        typ:           BonusTyp.option_a,
        stunden:       new Prisma.Decimal(stunden),
        betragEur,
        buchungsdatum: new Date(buchungsdatum),
        beschreibung:  beschreibung ?? `Manuelle Zusatzstunden-Buchung (${stunden}h × ${satz} €/h)`,
        erstelltVonId: req.admin!.sub,
      },
      include: { mitarbeiter: true, projekt: true },
    });

    res.status(201).json({ success: true, data: buchung });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bonus/:mitarbeiterId/berechnung?jahr=2024 ──────────────────────
// Live-Berechnung für einzelnen Mitarbeiter (Dashboard-Widget)
router.get('/:mitarbeiterId/berechnung', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const mitarbeiterId = Number(req.params.mitarbeiterId);
    if (isNaN(mitarbeiterId)) throw new AppError(400, 'Ungültige Mitarbeiter-ID');

    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    const ergebnis = await bonusService.berechneFuerMitarbeiter(mitarbeiterId, jahr);

    if (!ergebnis) throw new AppError(404, 'Mitarbeiter nicht gefunden');

    res.json({ success: true, data: ergebnis });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bonus/:mitarbeiterId?jahr=2024 ─────────────────────────────────
// Buchungshistorie (Audit-Trail lesen)
router.get('/:mitarbeiterId', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const mitarbeiterId = Number(req.params.mitarbeiterId);
    if (isNaN(mitarbeiterId)) throw new AppError(400, 'Ungültige Mitarbeiter-ID');

    const jahr      = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    const typFilter = req.query.typ as string | undefined;

    const buchungen = await prisma.bonusbuchung.findMany({
      where: {
        mitarbeiterId,
        buchungsdatum: {
          gte: new Date(`${jahr}-01-01`),
          lte: new Date(`${jahr}-12-31`),
        },
        ...(typFilter ? { typ: typFilter as BonusTyp } : {}),
      },
      include: { projekt: { select: { id: true, projektname: true, projektnummer: true } } },
      orderBy: { buchungsdatum: 'desc' },
    });

    // Summen berechnen
    const summeA = buchungen
      .filter((b) => b.typ === BonusTyp.option_a)
      .reduce((s, b) => s + Number(b.betragEur), 0);
    const summeB = buchungen
      .filter((b) => b.typ === BonusTyp.option_b)
      .reduce((s, b) => s + Number(b.betragEur), 0);

    res.json({
      success: true,
      data: {
        mitarbeiterId,
        kalenderjahr: jahr,
        summeOptionA:  Math.round(summeA * 100) / 100,
        summeOptionB:  Math.round(summeB * 100) / 100,
        summeGesamt:   Math.round((summeA + summeB) * 100) / 100,
        buchungen,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
