/**
 * auszahlungLog.service.ts — Audit-Trail für Auszahlungen
 *
 * Jede Statusänderung, Genehmigung, Stornierung und Editierung wird
 * unveränderlich protokolliert. INSERT-only, kein UPDATE, kein DELETE.
 */

import { prisma } from '../db/client';
import { getLogger } from '../utils/logger';

const log = getLogger('auszahlungLog');

export type AuszahlungAktion =
  | 'erstellt'
  | 'genehmigt'
  | 'ausgezahlt'
  | 'storniert'
  | 'aktualisiert'
  | 'h1_vorauszahlung'
  | 'zahlungsnachweis_hochgeladen';

export const auszahlungLogService = {
  async log(
    auszahlungId: number,
    aktion: AuszahlungAktion,
    adminId?: number,
    detail?: string,
    ipAdresse?: string,
  ) {
    try {
      await prisma.auszahlungLog.create({
        data: {
          auszahlungId,
          aktion,
          detail,
          geaendertVon: adminId,
          ipAdresse,
        },
      });
    } catch (err) {
      log.error({ err, auszahlungId, aktion }, 'AuszahlungLog konnte nicht geschrieben werden');
    }
  },

  async fuerAuszahlung(auszahlungId: number) {
    return prisma.auszahlungLog.findMany({
      where:   { auszahlungId },
      include: { adminUser: { select: { id: true, name: true, email: true } } },
      orderBy: { geaendertAm: 'desc' },
    });
  },
};
