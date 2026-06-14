/**
 * /api/mitarbeiter-auth — Mitarbeiter-Login und eigene Daten
 *
 * POST /api/mitarbeiter-auth/login               → Login mit E-Mail + Passwort
 * POST /api/mitarbeiter-auth/set-password        → Admin setzt/resettet Passwort
 * GET  /api/mitarbeiter-auth/me                  → Eigene Daten (nur eigene!)
 * GET  /api/mitarbeiter-auth/me/bonus?jahr       → Eigener Bonusstand
 * GET  /api/mitarbeiter-auth/me/prognose         → Eigene Prognose
 * PUT  /api/mitarbeiter-auth/me/praeferenz       → Auszahlungspräferenz setzen
 *
 * Sicherheitsregel: Mitarbeiter sehen AUSSCHLIESSLICH eigene Daten.
 * Die Mitarbeiter-ID wird immer aus dem JWT gelesen, nie aus URL-Parametern.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Auszahlungspraeferenz } from '@prisma/client';
import { prisma } from '../db/client';
import { requireMitarbeiterAuth, requireAuth, signMitarbeiterToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { MitarbeiterRequest, AuthenticatedRequest } from '../types';
import { bonusService } from '../services/bonus.service';
import { prognoseService } from '../services/prognose.service';
import { konfigService } from '../services/konfiguration.service';

const router = Router();

// ─── POST /api/mitarbeiter-auth/login ────────────────────────────────────────
// Login mit E-Mail + Passwort
const loginSchema = z.object({
  email:    z.string().email().toLowerCase().trim(),
  passwort: z.string().min(1),
  remember: z.boolean().optional(),
});

router.post('/login', async (req: Request, res: Response, next) => {
  try {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'E-Mail und Passwort erforderlich');

    const { email, passwort, remember } = body.data;

    const ma = await prisma.mitarbeiter.findUnique({
      where: { email },
      include: { rolle: true },
    });

    if (!ma || !ma.aktiv) {
      throw new AppError(401, 'E-Mail oder Passwort ungültig');
    }

    if (!ma.passwortHash) {
      throw new AppError(401, 'Für diesen Account wurde noch kein Passwort gesetzt. Bitte wende dich an deinen Administrator.');
    }

    const korrekt = await bcrypt.compare(passwort, ma.passwortHash);
    if (!korrekt) {
      throw new AppError(401, 'E-Mail oder Passwort ungültig');
    }

    const token = signMitarbeiterToken({
      sub:  ma.id,
      name: `${ma.vorname} ${ma.nachname}`,
      typ:  'mitarbeiter',
    }, remember ?? false);

    res.json({
      success: true,
      data: {
        token,
        mitarbeiter: {
          id:       ma.id,
          vorname:  ma.vorname,
          nachname: ma.nachname,
          rolle:    ma.rolle.bezeichnung,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/mitarbeiter-auth/set-password ──────────────────────────────────
// Admin setzt oder resettet das Passwort eines Mitarbeiters (Admin-only)
const setPasswordSchema = z.object({
  mitarbeiterId: z.number().int().positive(),
  passwort:      z.string().min(6, 'Mindestens 6 Zeichen'),
});

router.post('/set-password', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = setPasswordSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const { mitarbeiterId, passwort } = body.data;

    const ma = await prisma.mitarbeiter.findUnique({ where: { id: mitarbeiterId } });
    if (!ma) throw new AppError(404, 'Mitarbeiter nicht gefunden');

    const hash = await bcrypt.hash(passwort, 12);

    await prisma.mitarbeiter.update({
      where: { id: mitarbeiterId },
      data:  { passwortHash: hash },
    });

    res.json({ success: true, data: { message: 'Passwort erfolgreich gesetzt' } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/mitarbeiter-auth/me ─────────────────────────────────────────────
router.get('/me', requireMitarbeiterAuth, async (req: MitarbeiterRequest, res: Response, next) => {
  try {
    const mitarbeiterId = req.mitarbeiter!.sub;

    const ma = await prisma.mitarbeiter.findUnique({
      where:   { id: mitarbeiterId },
      include: { rolle: true },
    });

    if (!ma) throw new AppError(404, 'Mitarbeiter nicht gefunden');

    const konfig = await konfigService.alleWerte();
    const karenz    = Number(konfig.kranktage_karenz ?? 15);
    const maxGrenze = Number(konfig.kranktage_max_grenze ?? 40);
    // Anzeige-Bezugsgröße: Karenzgrenze (ab da beginnt die Kürzung)
    const kranktageProz = karenz > 0 ? Math.round((ma.kranktageAktuellesJahr / karenz) * 100) : 0;

    res.json({
      success: true,
      data: {
        id:                     ma.id,
        vorname:                ma.vorname,
        nachname:               ma.nachname,
        email:                  ma.email,
        rolle:                  ma.rolle,
        eintrittsdatum:         ma.eintrittsdatum,
        kranktageAktuellesJahr: ma.kranktageAktuellesJahr,
        kranktageSchwell:       karenz,
        kranktageMaxGrenze:     maxGrenze,
        kranktageProz:          Math.min(200, kranktageProz),
        auszahlungspraeferenz:  ma.auszahlungspraeferenz,
        aktiv:                  ma.aktiv,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/mitarbeiter-auth/me/bonus?jahr ──────────────────────────────────
router.get('/me/bonus', requireMitarbeiterAuth, async (req: MitarbeiterRequest, res: Response, next) => {
  try {
    const mitarbeiterId = req.mitarbeiter!.sub;
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();

    const ergebnis = await bonusService.berechneFuerMitarbeiter(mitarbeiterId, jahr);
    if (!ergebnis) throw new AppError(404, 'Mitarbeiter nicht gefunden');

    const startOfJahr = new Date(`${jahr}-01-01T00:00:00.000Z`);
    const endOfJahr   = new Date(`${jahr}-12-31T23:59:59.999Z`);

    const buchungshistorie = await prisma.bonusbuchung.findMany({
      where: {
        mitarbeiterId,
        buchungsdatum: { gte: startOfJahr, lte: endOfJahr },
      },
      include: {
        projekt: { select: { id: true, projektname: true, projektnummer: true } },
      },
      orderBy: { buchungsdatum: 'desc' },
    });

    res.json({ success: true, data: { berechnung: ergebnis, buchungshistorie } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/mitarbeiter-auth/me/prognose ────────────────────────────────────
router.get('/me/prognose', requireMitarbeiterAuth, async (req: MitarbeiterRequest, res: Response, next) => {
  try {
    const mitarbeiterId = req.mitarbeiter!.sub;
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();

    const prognose = await prognoseService.berechnePrognose(jahr);
    const maPrognose = prognose.ergebnisse.find((e) => e.mitarbeiterId === mitarbeiterId);

    if (!maPrognose) throw new AppError(404, 'Keine Prognosedaten gefunden');

    res.json({
      success: true,
      data: { ...maPrognose, jahresfortschritt: prognose.jahresfortschritt },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/mitarbeiter-auth/me/praeferenz ─────────────────────────────────
const praeferenzSchema = z.object({
  praeferenz: z.nativeEnum(Auszahlungspraeferenz),
});

router.put('/me/praeferenz', requireMitarbeiterAuth, async (req: MitarbeiterRequest, res: Response, next) => {
  try {
    const body = praeferenzSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const mitarbeiterId = req.mitarbeiter!.sub;

    await prisma.mitarbeiter.update({
      where: { id: mitarbeiterId },
      data:  { auszahlungspraeferenz: body.data.praeferenz },
    });

    res.json({ success: true, data: { praeferenz: body.data.praeferenz } });
  } catch (err) {
    next(err);
  }
});

export default router;
