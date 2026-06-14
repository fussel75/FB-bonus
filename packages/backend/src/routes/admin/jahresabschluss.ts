import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/requireAdmin';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';

const router = Router();

// ─── Schritt 1: Vorschau berechnen ───────────────────────────────────────────
// GET /api/admin/jahresabschluss/vorschau?jahr=2024
router.get('/vorschau', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { bonusService } = await import('../../services/bonus.service');
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    const ergebnis = await bonusService.berechneJahresbonus(jahr);

    res.json({ success: true, data: { jahr, ergebnis } });
  } catch (err) {
    next(err);
  }
});

// ─── Schritt 3: Freigabe (mit Passwortbestätigung) ───────────────────────────
// POST /api/admin/jahresabschluss/freigeben
const freigebenSchema = z.object({
  jahr:     z.number().int().min(2020).max(2100),
  passwort: z.string().min(1, 'Passwort zur Bestätigung erforderlich'),
});

router.post('/freigeben', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = freigebenSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const { jahr, passwort } = body.data;

    // Passwortbestätigung (Zwei-Schritt-Sicherheit)
    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
    if (!admin) throw new AppError(401, 'Admin nicht gefunden');

    const passwortKorrekt = await bcrypt.compare(passwort, admin.passwortHash);
    if (!passwortKorrekt) throw new AppError(401, 'Passwort falsch — Freigabe verweigert');

    // Jahresbonus berechnen + Auszahlungen schreiben
    const { auszahlungService } = await import('../../services/auszahlung.service');
    const ergebnis = await auszahlungService.jahresabschlussErstellen(jahr, req.admin!.sub);

    res.json({ success: true, data: ergebnis });
  } catch (err) {
    next(err);
  }
});

// ─── Halbjahresabschluss (Option A Vorschuss) ────────────────────────────────
// POST /api/admin/jahresabschluss/halbjahr
const halbjahrSchema = z.object({
  jahr:     z.number().int().min(2020).max(2100),
  passwort: z.string().min(1, 'Passwort zur Bestätigung erforderlich'),
});

router.post('/halbjahr', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = halbjahrSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const { jahr, passwort } = body.data;

    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
    if (!admin) throw new AppError(401, 'Admin nicht gefunden');

    const passwortKorrekt = await bcrypt.compare(passwort, admin.passwortHash);
    if (!passwortKorrekt) throw new AppError(401, 'Passwort falsch — Freigabe verweigert');

    const { auszahlungService } = await import('../../services/auszahlung.service');
    const ergebnis = await auszahlungService.halbjahresabschlussErstellen(jahr, req.admin!.sub);

    res.json({ success: true, data: ergebnis });
  } catch (err) {
    next(err);
  }
});

// ─── Schritt 4: Export ───────────────────────────────────────────────────────
// GET /api/admin/jahresabschluss/export?jahr=2024&format=pdf|csv|xlsx
router.get('/export', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { exportService } = await import('../../services/export.service');
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();
    const fmtRaw = String(req.query.format ?? 'pdf');
    const format: 'pdf' | 'csv' | 'xlsx' =
      fmtRaw === 'csv' ? 'csv' : fmtRaw === 'xlsx' ? 'xlsx' : 'pdf';

    const buffer = await exportService.jahresabschlussExport(jahr, format);

    const contentType =
      format === 'pdf'  ? 'application/pdf'
      : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

    res.setHeader('Content-Disposition', `attachment; filename="bonustrack_${jahr}.${format}"`);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ─── Schritt 5: Jahresreset ──────────────────────────────────────────────────
// POST /api/admin/jahresabschluss/reset
const resetSchema = z.object({
  jahr:     z.number().int(),
  passwort: z.string().min(1),
});

router.post('/reset', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = resetSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const { jahr, passwort } = body.data;

    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
    if (!admin) throw new AppError(401, 'Admin nicht gefunden');

    const passwortKorrekt = await bcrypt.compare(passwort, admin.passwortHash);
    if (!passwortKorrekt) throw new AppError(401, 'Passwort falsch — Reset verweigert');

    // Reset: Kranktage auf 0, neues Jahr beginnt
    // Bonusbuchungen bleiben erhalten (Audit-Trail — unveränderlich)
    await prisma.mitarbeiter.updateMany({
      data: { kranktageAktuellesJahr: 0 },
    });

    res.json({
      success: true,
      data: {
        message:        `Jahresreset ${jahr} abgeschlossen. Neues Jahr ${jahr + 1} beginnt.`,
        kranktageReset: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
