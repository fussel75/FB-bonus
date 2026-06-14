import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticatedRequest, JwtPayload, MitarbeiterRequest, MitarbeiterJwtPayload } from '../types';

// ─── Admin-Auth-Guard ────────────────────────────────────────────────────────

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Kein Authentifizierungstoken vorhanden' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload & { typ?: string };

    if (payload.typ === 'mitarbeiter') {
      res.status(403).json({ success: false, error: 'Zugriff verweigert: Kein Admin-Token' });
      return;
    }

    const ADMIN_ROLLEN: readonly string[] = ['superadmin', 'admin'];
    if (!payload.rolle || !ADMIN_ROLLEN.includes(payload.rolle)) {
      res.status(403).json({ success: false, error: 'Zugriff verweigert: Ungültige Admin-Rolle' });
      return;
    }

    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Token ungültig oder abgelaufen' });
  }
}

// ─── Mitarbeiter-Auth-Guard ──────────────────────────────────────────────────

export function requireMitarbeiterAuth(
  req: MitarbeiterRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Kein Authentifizierungstoken vorhanden' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as unknown as MitarbeiterJwtPayload;

    if (payload.typ !== 'mitarbeiter') {
      res.status(403).json({ success: false, error: 'Ungültiger Token-Typ' });
      return;
    }

    req.mitarbeiter = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Token ungültig oder abgelaufen' });
  }
}

// ─── Token-Generierung ───────────────────────────────────────────────────────

export function signAdminToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  remember = false,
): string {
  const expiresIn = remember ? '30d' : env.JWT_EXPIRES_IN;
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function signMitarbeiterToken(
  payload: Omit<MitarbeiterJwtPayload, 'iat' | 'exp'>,
  remember = false,
): string {
  const expiresIn = remember ? '30d' : '12h';
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn } as jwt.SignOptions);
}
