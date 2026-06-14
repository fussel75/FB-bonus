import { Router, Response } from 'express';
import { z } from 'zod';
import { Auszahlungspraeferenz } from '@prisma/client';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/requireAdmin';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();

// GET /api/mitarbeiter — alle Mitarbeiter (Admin)
router.get('/', requireAuth, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const alle = await prisma.mitarbeiter.findMany({
      include: { rolle: true },
      orderBy: [{ nachname: 'asc' }, { vorname: 'asc' }],
    });
    const mitarbeiter = alle.map(({ passwortHash: _pw, ...m }) => m);
    res.json({ success: true, data: mitarbeiter });
  } catch (err) {
    next(err);
  }
});

// GET /api/mitarbeiter/:id — einzelner Mitarbeiter (Admin)
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const raw = await prisma.mitarbeiter.findUnique({
      where:   { id },
      include: { rolle: true, projektStunden: { include: { projekt: true } } },
    });
    if (!raw) throw new AppError(404, 'Mitarbeiter nicht gefunden');
    const { passwortHash: _pw0, ...mitarbeiter } = raw;

    res.json({ success: true, data: mitarbeiter });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  vorname:                  z.string().min(2),
  nachname:                 z.string().min(2),
  rolleId:                  z.number().int().positive(),
  eintrittsdatum:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  austrittsdatum:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional().nullable(),
  kranktageAktuellesJahr:   z.number().int().min(0).default(0),
  auszahlungspraeferenz:    z.nativeEnum(Auszahlungspraeferenz).default(Auszahlungspraeferenz.geld),
  stundenlohnBrutto:        z.number().min(0).max(999.99).optional().nullable(),
  tagesstundenDurchschnitt: z.number().min(0).max(24).optional().nullable(),
});

// POST /api/mitarbeiter — neuen Mitarbeiter manuell anlegen (nur Superadmin)
router.post('/', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const {
      vorname, nachname, rolleId, eintrittsdatum, austrittsdatum,
      kranktageAktuellesJahr, auszahlungspraeferenz,
      stundenlohnBrutto, tagesstundenDurchschnitt,
    } = body.data;

    const rolleExistiert = await prisma.rolle.findUnique({ where: { id: rolleId } });
    if (!rolleExistiert) throw new AppError(404, 'Rolle nicht gefunden');

    const { passwortHash: _pw1, ...mitarbeiter } = await prisma.mitarbeiter.create({
      data: {
        vorname:                  vorname.trim(),
        nachname:                 nachname.trim(),
        rolleId,
        eintrittsdatum:           eintrittsdatum ? new Date(eintrittsdatum) : null,
        austrittsdatum:           austrittsdatum ? new Date(austrittsdatum) : null,
        kranktageAktuellesJahr,
        auszahlungspraeferenz,
        stundenlohnBrutto:        stundenlohnBrutto ?? null,
        tagesstundenDurchschnitt: tagesstundenDurchschnitt ?? null,
        aktiv:                    true,
        zuletztSynchronisiert:    new Date(),
      },
      include: { rolle: true },
    });

    res.status(201).json({ success: true, data: mitarbeiter });
  } catch (err) {
    next(err);
  }
});

// POST /api/mitarbeiter/sync — Sync mit Fristd-Bau Partner-API (nur Superadmin)
router.post('/sync', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { syncPartnerEmployees } = await import('../services/partnerEmployeeSync.service');
    const ergebnis = await syncPartnerEmployees();
    res.json({ success: true, data: ergebnis });
  } catch (err) {
    next(err);
  }
});

const editSchema = z.object({
  vorname:                  z.string().min(2).optional(),
  nachname:                 z.string().min(2).optional(),
  rolleId:                  z.number().int().positive().optional(),
  eintrittsdatum:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  austrittsdatum:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  kranktageAktuellesJahr:   z.number().int().min(0).optional(),
  auszahlungspraeferenz:    z.nativeEnum(Auszahlungspraeferenz).optional(),
  stundenlohnBrutto:        z.number().min(0).max(999.99).optional().nullable(),
  tagesstundenDurchschnitt: z.number().min(0).max(24).optional().nullable(),
});

// PATCH /api/mitarbeiter/:id/deaktivieren
router.patch('/:id/deaktivieren', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');
    const { passwortHash: _pw2, ...updated } = await prisma.mitarbeiter.update({
      where:   { id },
      data:    { aktiv: false },
      include: { rolle: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/mitarbeiter/:id/reaktivieren
router.patch('/:id/reaktivieren', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');
    const { passwortHash: _pw3, ...updated } = await prisma.mitarbeiter.update({
      where:   { id },
      data:    { aktiv: true },
      include: { rolle: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/mitarbeiter/:id — Felder bearbeiten
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const body = editSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const {
      vorname, nachname, rolleId, eintrittsdatum, austrittsdatum,
      kranktageAktuellesJahr, auszahlungspraeferenz,
      stundenlohnBrutto, tagesstundenDurchschnitt,
    } = body.data;

    const data: Record<string, unknown> = {};
    if (vorname !== undefined)                    data.vorname                  = vorname.trim();
    if (nachname !== undefined)                   data.nachname                 = nachname.trim();
    if (rolleId !== undefined)                    data.rolleId                  = rolleId;
    if (eintrittsdatum !== undefined)             data.eintrittsdatum           = eintrittsdatum ? new Date(eintrittsdatum) : null;
    if (austrittsdatum !== undefined)             data.austrittsdatum           = austrittsdatum ? new Date(austrittsdatum) : null;
    if (kranktageAktuellesJahr !== undefined)     data.kranktageAktuellesJahr   = kranktageAktuellesJahr;
    if (auszahlungspraeferenz !== undefined)      data.auszahlungspraeferenz    = auszahlungspraeferenz;
    if (stundenlohnBrutto !== undefined)          data.stundenlohnBrutto        = stundenlohnBrutto;
    if (tagesstundenDurchschnitt !== undefined)   data.tagesstundenDurchschnitt = tagesstundenDurchschnitt;

    if (Object.keys(data).length === 0) throw new AppError(400, 'Keine änderbaren Felder angegeben');

    const { passwortHash: _pw4, ...updated } = await prisma.mitarbeiter.update({
      where:   { id },
      data,
      include: { rolle: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/mitarbeiter/:id — löschen (nur Superadmin)
router.delete('/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');
    await prisma.mitarbeiter.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
});

export default router;
