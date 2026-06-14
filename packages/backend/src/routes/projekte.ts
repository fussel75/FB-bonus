import { Router, Response } from 'express';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();

// GET /api/projekte — alle Projekte (Admin)
router.get('/', requireAuth, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const projekte = await prisma.projekt.findMany({
      include: {
        mitarbeiterStunden: {
          include: { mitarbeiter: { include: { rolle: true } } },
        },
      },
      orderBy: { projektnummer: 'asc' },
    });

    res.json({ success: true, data: projekte });
  } catch (err) {
    next(err);
  }
});

// GET /api/projekte/archiv — archivierte Projekte (archiviert=true)
// ACHTUNG: Muss vor /:id stehen!
router.get('/archiv', requireAuth, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const projekte = await prisma.projekt.findMany({
      where:   { archiviert: true },
      include: {
        mitarbeiterStunden: {
          include: { mitarbeiter: { include: { rolle: true } } },
        },
      },
      orderBy: [{ abrechnungsJahr: 'desc' }, { projektnummer: 'asc' }],
    });

    res.json({ success: true, data: projekte });
  } catch (err) {
    next(err);
  }
});

// GET /api/projekte/:id — einzelnes Projekt (Admin)
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const projekt = await prisma.projekt.findUnique({
      where:   { id },
      include: {
        mitarbeiterStunden: {
          include: { mitarbeiter: { include: { rolle: true } } },
        },
        bonusbuchungen: {
          include: { mitarbeiter: true },
          orderBy: { buchungsdatum: 'desc' },
        },
      },
    });

    if (!projekt) throw new AppError(404, 'Projekt nicht gefunden');

    res.json({ success: true, data: projekt });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projekte/:id/bonus-ausschluss — Bonus-Ausschluss-Flag umschalten
router.patch('/:id/bonus-ausschluss', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const projekt = await prisma.projekt.findUnique({ where: { id } });
    if (!projekt) throw new AppError(404, 'Projekt nicht gefunden');

    const aktualisiert = await prisma.projekt.update({
      where: { id },
      data:  { bonusAusgeschlossen: !projekt.bonusAusgeschlossen },
    });

    res.json({ success: true, data: { bonusAusgeschlossen: aktualisiert.bonusAusgeschlossen } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projekte/:id/abrechnungsjahr — Abrechnungsjahr setzen oder löschen
router.patch('/:id/abrechnungsjahr', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id   = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const { jahr } = req.body as { jahr: number | null };
    if (jahr !== null && (typeof jahr !== 'number' || !Number.isInteger(jahr) || jahr < 2000 || jahr > 2100)) {
      throw new AppError(400, 'Ungültiges Jahr (2000–2100 oder null)');
    }

    const projekt = await prisma.projekt.findUnique({ where: { id } });
    if (!projekt) throw new AppError(404, 'Projekt nicht gefunden');

    const aktualisiert = await prisma.projekt.update({
      where: { id },
      data:  { abrechnungsJahr: jahr },
    });

    res.json({ success: true, data: { abrechnungsJahr: aktualisiert.abrechnungsJahr } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projekte/:id/archivieren — Archiviert-Flag setzen oder entfernen
// ACHTUNG: Muss vor /:id stehen!
router.patch('/:id/archivieren', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const { archiviert } = req.body as { archiviert: boolean };
    if (typeof archiviert !== 'boolean') {
      throw new AppError(400, 'archiviert muss ein Boolean sein');
    }

    const projekt = await prisma.projekt.findUnique({ where: { id } });
    if (!projekt) throw new AppError(404, 'Projekt nicht gefunden');

    const aktualisiert = await prisma.projekt.update({
      where: { id },
      data:  { archiviert },
    });

    res.json({ success: true, data: { archiviert: aktualisiert.archiviert } });
  } catch (err) {
    next(err);
  }
});

export default router;
