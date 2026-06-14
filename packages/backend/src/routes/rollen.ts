/**
 * /api/rollen — CRUD für Rollenverwaltung
 *
 * Rollen sind frei konfigurierbar: Helfer / Fachkraft / Polier + beliebige weitere.
 * Rollenfaktor darf nicht unter rollenfaktor_min fallen.
 * Helfer-Faktor (1.0) ist der Mindestfaktor — im Admin konfigurierbar.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/requireAdmin';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();

// GET /api/rollen — alle Rollen
router.get('/', requireAuth, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const rollen = await prisma.rolle.findMany({
      orderBy: { faktor: 'asc' },
      include: { _count: { select: { mitarbeiter: true } } },
    });

    res.json({ success: true, data: rollen });
  } catch (err) {
    next(err);
  }
});

const rolleSchema = z.object({
  bezeichnung: z.string().min(2, 'Mindestens 2 Zeichen').max(50),
  faktor:      z.number().positive('Faktor muss positiv sein'),
});

// POST /api/rollen — neue Rolle anlegen (nur Superadmin)
router.post('/', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = rolleSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const rolle = await prisma.rolle.create({
      data: {
        bezeichnung: body.data.bezeichnung.trim(),
        faktor:      new Prisma.Decimal(body.data.faktor),
      },
    });

    res.status(201).json({ success: true, data: rolle });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/rollen/:id — Faktor oder Bezeichnung ändern (nur Superadmin)
router.patch('/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const updateSchema = rolleSchema.partial();
    const body = updateSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const updated = await prisma.rolle.update({
      where: { id },
      data: {
        ...(body.data.bezeichnung ? { bezeichnung: body.data.bezeichnung.trim() } : {}),
        ...(body.data.faktor      ? { faktor: new Prisma.Decimal(body.data.faktor) } : {}),
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/rollen/:id — Rolle löschen (nur wenn keine Mitarbeiter zugewiesen)
router.delete('/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const rolle = await prisma.rolle.findUnique({
      where:   { id },
      include: { _count: { select: { mitarbeiter: true } } },
    });

    if (!rolle) throw new AppError(404, 'Rolle nicht gefunden');

    if (rolle._count.mitarbeiter > 0) {
      throw new AppError(
        409,
        `Rolle kann nicht gelöscht werden: ${rolle._count.mitarbeiter} Mitarbeiter sind dieser Rolle zugewiesen`,
      );
    }

    await prisma.rolle.delete({ where: { id } });

    res.json({ success: true, data: { message: `Rolle "${rolle.bezeichnung}" gelöscht` } });
  } catch (err) {
    next(err);
  }
});

export default router;
