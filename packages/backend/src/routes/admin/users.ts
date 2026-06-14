import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AdminRolle } from '@prisma/client';
import { prisma } from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/requireAdmin';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';

const router = Router();

// GET /api/admin/users — alle Admin-User (nur Superadmin)
router.get('/', requireAuth, requireSuperAdmin, async (_req, res: Response, next) => {
  try {
    const users = await prisma.adminUser.findMany({
      select: {
        id: true, name: true, email: true,
        rolle: true, letzterLogin: true, aktiv: true, erstelltAm: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  passwort: z.string().min(10, 'Mindestens 10 Zeichen'),
  rolle:    z.nativeEnum(AdminRolle).default(AdminRolle.admin),
});

// POST /api/admin/users — neuen Admin anlegen (nur Superadmin)
router.post('/', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const { name, email, passwort, rolle } = body.data;
    const hash = await bcrypt.hash(passwort, 12);

    const user = await prisma.adminUser.create({
      data:   { name, email, passwortHash: hash, rolle },
      select: { id: true, name: true, email: true, rolle: true, erstelltAm: true },
    });

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/deaktivieren (nur Superadmin)
router.patch('/:id/deaktivieren', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');
    if (id === req.admin!.sub) throw new AppError(409, 'Eigenes Konto kann nicht deaktiviert werden');

    const updated = await prisma.adminUser.update({
      where: { id },
      data:  { aktiv: false },
      select: { id: true, name: true, aktiv: true },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/reaktivieren (nur Superadmin)
router.patch('/:id/reaktivieren', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(_req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const updated = await prisma.adminUser.update({
      where: { id },
      data:  { aktiv: true },
      select: { id: true, name: true, aktiv: true },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

const editSchema = z.object({
  name:     z.string().min(2).optional(),
  email:    z.string().email().optional(),
  rolle:    z.nativeEnum(AdminRolle).optional(),
  passwort: z.string().min(10, 'Mindestens 10 Zeichen').optional(),
});

// PATCH /api/admin/users/:id — Benutzer bearbeiten (nur Superadmin)
router.patch('/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');

    const body = editSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const { name, email, rolle, passwort } = body.data;

    const data: Record<string, unknown> = {};
    if (name)     data.name  = name;
    if (email)    data.email = email;
    if (rolle)    data.rolle = rolle;
    if (passwort) data.passwortHash = await bcrypt.hash(passwort, 12);

    const updated = await prisma.adminUser.update({
      where:  { id },
      data,
      select: { id: true, name: true, email: true, rolle: true, aktiv: true },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id — Benutzer löschen (nur Superadmin)
router.delete('/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'Ungültige ID');
    if (id === req.admin!.sub) throw new AppError(409, 'Eigenes Konto kann nicht gelöscht werden');

    await prisma.adminUser.delete({ where: { id } });

    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
});

export default router;
