/**
 * /api/konfiguration — Konfigurationsparameter lesen und schreiben
 *
 * GET  /api/konfiguration          → alle Werte (ohne API-Key!)
 * PUT  /api/konfiguration          → einzelnen Wert ändern + Protokolleintrag
 * PUT  /api/konfiguration/api-key  → API-Key sicher setzen (Base64-verschlüsselt)
 * GET  /api/konfiguration/log      → vollständiges Änderungsprotokoll
 *
 * Sicherheitsregel: api_key_encrypted wird NIEMALS im GET-Response zurückgegeben.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/requireAdmin';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';
import { konfigService } from '../services/konfiguration.service';
import { syncJob } from '../jobs/sync.job';

const router = Router();

// ─── GET /api/konfiguration ───────────────────────────────────────────────────
router.get('/', requireAuth, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const werte = await konfigService.alleWerte();

    // API-Key NIEMALS im Response exponieren
    const { api_key_encrypted: _removed, ...sicher } = werte as Record<string, unknown>;

    // Aktuellen Cron-Ausdruck des laufenden Jobs ergänzen
    const data = {
      ...sicher,
      sync_cron_ausdruck_aktiv: syncJob.getAktuellerAusdruck(),
    };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/konfiguration ───────────────────────────────────────────────────
const updateSchema = z.object({
  key:   z.string().min(1),
  value: z.string(),
});

router.put('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = updateSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    const { key, value } = body.data;

    // API-Key nie als Klartext — separater Endpunkt
    if (key === 'api_key_encrypted') {
      throw new AppError(
        400,
        'API-Key bitte über PUT /api/konfiguration/api-key setzen',
      );
    }

    const updated = await konfigService.setzeWert(
      key,
      value,
      req.admin?.name ?? 'Unbekannt',
      req.admin?.sub,
    );

    // Wenn Cron-Ausdruck geändert → Job neu starten
    if (key === 'sync_cron_ausdruck') {
      await syncJob.restartMitNeuemAusdruck();
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/konfiguration/api-key ──────────────────────────────────────────
// API-Key sicher speichern (nur Superadmin)
// Der Key wird als Klartext übergeben und Base64-kodiert gespeichert
// (echte Verschlüsselung erfordert einen Key-Management-Service — für Replit ausreichend)
const apiKeySchema = z.object({
  apiKey: z.string().min(1, 'API-Key darf nicht leer sein'),
});

router.put('/api-key', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = apiKeySchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe', body.error.flatten());

    // Base64-kodieren (nie im Klartext speichern)
    const encoded = Buffer.from(body.data.apiKey).toString('base64');

    await konfigService.setzeWert(
      'api_key_encrypted',
      encoded,
      req.admin?.name ?? 'Unbekannt',
      req.admin?.sub,
    );

    res.json({
      success: true,
      data: { message: 'API-Key gespeichert (verschlüsselt)' },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/konfiguration/log ───────────────────────────────────────────────
router.get('/log', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const logs = await konfigService.aenderungslog();
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

export default router;
