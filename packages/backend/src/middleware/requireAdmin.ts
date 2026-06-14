import { Response, NextFunction } from 'express';
import { AdminRolle } from '@prisma/client';
import { AuthenticatedRequest } from '../types';

// ─── Superadmin-Guard ─────────────────────────────────────────────────────────
// Nur für Aktionen, die ausschließlich Superadmins vorbehalten sind
// (z.B. Admin-User anlegen, Jahresabschluss freigeben)

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.admin) {
    res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
    return;
  }

  if (req.admin.rolle !== AdminRolle.superadmin) {
    res.status(403).json({
      success: false,
      error:   'Nur Superadmins dürfen diese Aktion ausführen',
    });
    return;
  }

  next();
}

// ─── Admin-oder-Superadmin-Guard ─────────────────────────────────────────────
// Für Aktionen, die alle Admin-Rollen ausführen dürfen

export function requireAnyAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.admin) {
    res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
    return;
  }

  const erlaubteRollen: AdminRolle[] = [AdminRolle.admin, AdminRolle.superadmin];

  if (!erlaubteRollen.includes(req.admin.rolle)) {
    res.status(403).json({
      success: false,
      error:   'Zugriff verweigert',
    });
    return;
  }

  next();
}
