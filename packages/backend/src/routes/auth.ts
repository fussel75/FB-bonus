import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db/client';
import { signAdminToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { twoFactorService } from '../services/twoFactor.service';

const router = Router();

const loginSchema = z.object({
  email:    z.string().email('Ungültige E-Mail-Adresse'),
  passwort: z.string().min(1, 'Passwort erforderlich'),
  remember: z.boolean().optional(),
  twoFactorToken: z.string().optional(),
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response, next) => {
  try {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());
    }

    const { email, passwort, remember, twoFactorToken } = body.data;

    const admin = await prisma.adminUser.findUnique({ where: { email } });

    if (!admin || !admin.aktiv) {
      throw new AppError(401, 'E-Mail oder Passwort ungültig');
    }

    const passwortKorrekt = await bcrypt.compare(passwort, admin.passwortHash);
    if (!passwortKorrekt) {
      throw new AppError(401, 'E-Mail oder Passwort ungültig');
    }

    // ── 2FA-Check (falls aktiviert) ─────────────────────────────────────────
    if (admin.twoFactorEnabled) {
      if (!twoFactorToken) {
        // Frontend zeigt jetzt das 2FA-Eingabefeld an
        res.status(206).json({
          success: false,
          requiresTwoFactor: true,
          error: '2FA-Code erforderlich',
        });
        return;
      }
      const ok = await twoFactorService.verifyLogin(admin.id, twoFactorToken);
      if (!ok) throw new AppError(401, '2FA-Code ungültig');
    }

    // Letzten Login aktualisieren
    await prisma.adminUser.update({
      where: { id: admin.id },
      data:  { letzterLogin: new Date() },
    });

    const token = signAdminToken({
      sub:   admin.id,
      email: admin.email,
      rolle: admin.rolle,
      name:  admin.name,
    }, remember ?? false);

    res.json({
      success: true,
      data: {
        token,
        admin: {
          id:    admin.id,
          name:  admin.name,
          email: admin.email,
          rolle: admin.rolle,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout (clientseitig Token löschen — serverseitig kein Zustand)
router.post('/logout', (_req, res) => {
  res.json({ success: true, data: { message: 'Abgemeldet' } });
});

export default router;
