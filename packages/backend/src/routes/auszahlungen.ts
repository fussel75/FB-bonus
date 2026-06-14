import { Router, Response } from 'express';
import { z } from 'zod';
import { AuszahlungStatus } from '@prisma/client';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/requireAdmin';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();

// GET /api/auszahlungen?jahr=2024 — alle Auszahlungen eines Jahres
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const jahr = req.query.jahr ? Number(req.query.jahr) : new Date().getFullYear();

    const auszahlungen = await prisma.auszahlung.findMany({
      where:   { kalenderjahr: jahr },
      include: {
        mitarbeiter: { include: { rolle: true } },
        genehmigtvon: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ mitarbeiter: { nachname: 'asc' } }],
    });

    res.json({ success: true, data: auszahlungen });
  } catch (err) {
    next(err);
  }
});

// POST /api/auszahlungen/:id/genehmigen — Status → genehmigt
router.post('/:id/genehmigen', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const auszahlung = await prisma.auszahlung.findUnique({ where: { id } });
    if (!auszahlung) throw new AppError(404, 'Auszahlung nicht gefunden');

    if (auszahlung.status !== AuszahlungStatus.ausstehend) {
      throw new AppError(409, `Auszahlung hat bereits Status: ${auszahlung.status}`);
    }

    const updated = await prisma.auszahlung.update({
      where: { id },
      data: {
        status:        AuszahlungStatus.genehmigt,
        genehmigtvonId: req.admin!.sub,
        genehmigtAm:   new Date(),
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/auszahlungen/:id/ausgezahlt — Status → ausgezahlt (nur Superadmin)
router.post('/:id/ausgezahlt', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const nachweisSchema = z.object({ zahlungsnachweis: z.string().optional() });
    const body = nachweisSchema.parse(req.body);

    const auszahlung = await prisma.auszahlung.findUnique({ where: { id } });
    if (!auszahlung) throw new AppError(404, 'Auszahlung nicht gefunden');

    if (auszahlung.status !== AuszahlungStatus.genehmigt) {
      throw new AppError(409, 'Auszahlung muss zuerst genehmigt werden');
    }

    const updated = await prisma.auszahlung.update({
      where: { id },
      data: {
        status:          AuszahlungStatus.ausgezahlt,
        ausgezahltAm:    new Date(),
        zahlungsnachweis: body.zahlungsnachweis,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/auszahlungen/:id/stornieren — Status → storniert (nur Superadmin)
router.post('/:id/stornieren', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const auszahlung = await prisma.auszahlung.findUnique({ where: { id } });
    if (!auszahlung) throw new AppError(404, 'Auszahlung nicht gefunden');

    if (auszahlung.status === AuszahlungStatus.ausgezahlt) {
      throw new AppError(409, 'Bereits ausgezahlte Auszahlungen können nicht storniert werden');
    }

    const updated = await prisma.auszahlung.update({
      where: { id },
      data:  { status: AuszahlungStatus.storniert },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/auszahlungen/bulk-genehmigen — Mehrere auf einmal genehmigen
router.post('/bulk-genehmigen', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const schema = z.object({ ids: z.array(z.number()).min(1) });
    const body = schema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const { ids } = body.data;

    const result = await prisma.auszahlung.updateMany({
      where: {
        id:     { in: ids },
        status: AuszahlungStatus.ausstehend,
      },
      data: {
        status:        AuszahlungStatus.genehmigt,
        genehmigtvonId: req.admin!.sub,
        genehmigtAm:   new Date(),
      },
    });

    res.json({ success: true, data: { aktualisiert: result.count } });
  } catch (err) {
    next(err);
  }
});

export default router;
