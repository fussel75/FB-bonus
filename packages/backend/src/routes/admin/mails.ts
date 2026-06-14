/**
 * /api/admin/mails — Mail-Approval-Workflow
 *
 * GET    /api/admin/mails?jahr=YYYY              → Drafts für ein Jahr
 * POST   /api/admin/mails/drafts/auszahlung      → Drafts für Jahr erzeugen
 * PATCH  /api/admin/mails/:id                    → Draft editieren
 * POST   /api/admin/mails/:id/genehmigen         → Status → bereit
 * POST   /api/admin/mails/:id/versenden          → tatsächlich versenden
 * POST   /api/admin/mails/:id/abbrechen          → Draft abbrechen
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';
import { mailService } from '../../services/mail.service';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const jahr = Number(req.query.jahr);
    if (isNaN(jahr)) throw new AppError(400, 'Jahr fehlt oder ungültig');
    const drafts = await mailService.listForJahr(jahr);
    res.json({ success: true, data: drafts });
  } catch (err) { next(err); }
});

const erzeugeSchema = z.object({ kalenderjahr: z.number().int() });
router.post('/drafts/auszahlung', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = erzeugeSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe');
    const ergebnis = await mailService.erzeugeAuszahlungsDrafts(body.data.kalenderjahr, req.admin?.sub);
    res.json({ success: true, data: ergebnis });
  } catch (err) { next(err); }
});

const editSchema = z.object({ betreff: z.string().optional(), textBody: z.string().optional() });
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = editSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Ungültige Eingabe');
    const draft = await mailService.aktualisiere(id, body.data);
    res.json({ success: true, data: draft });
  } catch (err) { next(err); }
});

router.post('/:id/genehmigen', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!req.admin?.sub) throw new AppError(401, 'Nicht authentifiziert');
    const draft = await mailService.genehmige(id, req.admin.sub);
    res.json({ success: true, data: draft });
  } catch (err) { next(err); }
});

router.post('/:id/versenden', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!req.admin?.sub) throw new AppError(401, 'Nicht authentifiziert');
    const result = await mailService.versende(id, req.admin.sub);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

const abbrechenSchema = z.object({ grund: z.string().min(1) });
router.post('/:id/abbrechen', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = abbrechenSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'Grund fehlt');
    if (!req.admin?.sub) throw new AppError(401, 'Nicht authentifiziert');
    const draft = await mailService.abbrechen(id, body.data.grund, req.admin.sub);
    res.json({ success: true, data: draft });
  } catch (err) { next(err); }
});

export default router;
