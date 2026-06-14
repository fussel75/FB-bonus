/**
 * mail.service.ts — Mail-Versand mit Approval-Workflow
 *
 * WICHTIGE REGEL: Mails werden NIEMALS automatisch versendet.
 * - erzeugeDrafts() erstellt Mails im Status "draft" — kein Versand!
 * - genehmige(id) markiert eine Mail als "bereit" — kein Versand!
 * - versende(id) führt erst den tatsächlichen Versand aus, NUR per
 *   expliziter Admin-Aktion über die UI.
 *
 * Cron-Jobs dürfen nur erzeugeDrafts() aufrufen, niemals versende().
 *
 * Inhaltliche Regel: Bei freiwilligen Bonus-Zahlungen MUSS der
 * Freiwilligkeitsvorbehalt im Mail-Text enthalten sein — sonst entsteht
 * über Jahre eine "betriebliche Übung" und damit Rechtsanspruch.
 */

import { Resend } from 'resend';
import { MailStatus } from '@prisma/client';
import { prisma } from '../db/client';
import { konfigService } from './konfiguration.service';
import { getLogger } from '../utils/logger';

const log = getLogger('mail');

/** Standard-Freiwilligkeitsvorbehalt — JEDER Bonus-Mail beigelegt. */
const FREIWILLIGKEITSVORBEHALT = `
─────────────────────────────────────────
Wichtiger Hinweis (Freiwilligkeitsvorbehalt):
Diese Zahlung erfolgt freiwillig und stellt eine einmalige Leistung
des Arbeitgebers dar. Ein Rechtsanspruch auf zukünftige Zahlungen,
auch bei wiederholter Gewährung, besteht ausdrücklich nicht. Der
Arbeitgeber behält sich vor, diese Leistung jederzeit einzustellen
oder anzupassen.
─────────────────────────────────────────
`.trim();

export interface AuszahlungsMailContext {
  vorname:        string;
  nachname:       string;
  kalenderjahr:   number;
  betragGesamt:   number;
  betragOptionA:  number;
  betragOptionB:  number;
  firmenname:     string;
}

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function templateBetreff(ctx: AuszahlungsMailContext) {
  return `Bonusabrechnung ${ctx.kalenderjahr} – ${ctx.firmenname}`;
}

function templateText(ctx: AuszahlungsMailContext) {
  return `Hallo ${ctx.vorname},

dein Bonus für das Kalenderjahr ${ctx.kalenderjahr} steht fest:

  Option A (Zusatzstunden):  ${fmtEur(ctx.betragOptionA)}
  Option B (Effizienz):       ${fmtEur(ctx.betragOptionB)}
  ─────────────────────────────────
  Gesamtbetrag:               ${fmtEur(ctx.betragGesamt)}

Die Überweisung erfolgt mit der nächsten Lohnzahlung.

${FREIWILLIGKEITSVORBEHALT}

Bei Fragen melde dich bei mir.

Viele Grüße
${ctx.firmenname}
`;
}

export const mailService = {
  /**
   * Erstellt Drafts für alle qualifizierten MA eines Jahres.
   * Wird vom Jahresabschluss-Endpoint aufgerufen.
   * KEIN VERSAND — nur Vorbereitung. Admin muss in der UI freigeben.
   */
  async erzeugeAuszahlungsDrafts(kalenderjahr: number, adminId?: number) {
    const auszahlungen = await prisma.auszahlung.findMany({
      where: { kalenderjahr, betragGesamt: { gt: 0 } },
      include: { mitarbeiter: true },
    });

    const konfig = await konfigService.alleWerte();
    const firmenname = String(konfig.unternehmensname ?? 'FriStD-Bau');

    let erstellt = 0;
    let uebersprungen = 0;

    for (const a of auszahlungen) {
      if (!a.mitarbeiter.email) {
        uebersprungen++;
        continue;
      }

      // Doppelt-Erzeugung verhindern: bestehenden Draft NICHT überschreiben
      const existing = await prisma.mailDraft.findFirst({
        where: { auszahlungId: a.id, anlass: 'auszahlung', status: { in: ['draft', 'bereit'] } },
      });
      if (existing) continue;

      const ctx: AuszahlungsMailContext = {
        vorname:       a.mitarbeiter.vorname,
        nachname:      a.mitarbeiter.nachname,
        kalenderjahr,
        betragGesamt:  Number(a.betragGesamt),
        betragOptionA: Number(a.betragOptionA),
        betragOptionB: Number(a.betragOptionB),
        firmenname,
      };

      await prisma.mailDraft.create({
        data: {
          auszahlungId:    a.id,
          anlass:          'auszahlung',
          empfaengerEmail: a.mitarbeiter.email,
          empfaengerName:  `${a.mitarbeiter.vorname} ${a.mitarbeiter.nachname}`,
          betreff:         templateBetreff(ctx),
          textBody:        templateText(ctx),
          status:          MailStatus.draft,
          erstelltVonId:   adminId ?? null,
        },
      });
      erstellt++;
    }

    log.info({ kalenderjahr, erstellt, uebersprungen }, 'Auszahlungs-Drafts erzeugt');
    return { erstellt, uebersprungen };
  },

  /** Markiert einen Draft als "bereit zum Versand" — KEIN Versand! */
  async genehmige(draftId: number, adminId: number) {
    return prisma.mailDraft.update({
      where: { id: draftId },
      data: { status: MailStatus.bereit, genehmigtAm: new Date(), genehmigtVonId: adminId },
    });
  },

  /** Editiert Betreff/Body eines noch nicht versendeten Drafts. */
  async aktualisiere(draftId: number, daten: { betreff?: string; textBody?: string }) {
    const draft = await prisma.mailDraft.findUnique({ where: { id: draftId } });
    if (!draft) throw new Error('Draft nicht gefunden');
    if (draft.status === MailStatus.versendet) {
      throw new Error('Bereits versendete Mails können nicht mehr geändert werden');
    }
    return prisma.mailDraft.update({
      where: { id: draftId },
      data:  {
        betreff: daten.betreff ?? draft.betreff,
        textBody: daten.textBody ?? draft.textBody,
        // Bei Edit zurück auf draft-Status, damit erneut genehmigt werden muss
        status: MailStatus.draft,
        genehmigtAm: null,
        genehmigtVonId: null,
      },
    });
  },

  async abbrechen(draftId: number, grund: string, adminId: number) {
    return prisma.mailDraft.update({
      where: { id: draftId },
      data: {
        status: MailStatus.abgebrochen,
        abgebrochenAm: new Date(),
        abgebrochenGrund: grund,
        genehmigtVonId: adminId,
      },
    });
  },

  /**
   * Versendet einen genehmigten Draft. Wird NUR über expliziten
   * Admin-UI-Klick aufgerufen — nie aus einem Cron-Job.
   */
  async versende(draftId: number, adminId: number) {
    const draft = await prisma.mailDraft.findUnique({ where: { id: draftId } });
    if (!draft) throw new Error('Draft nicht gefunden');
    if (draft.status !== MailStatus.bereit) {
      throw new Error(`Draft hat Status "${draft.status}", muss "bereit" sein zum Versand`);
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY ist nicht konfiguriert');

    const konfig = await konfigService.alleWerte();
    const firmenname = String(konfig.unternehmensname ?? 'FriStD-Bau');
    const from = process.env.MAIL_FROM ?? `${firmenname} <noreply@fristd-bau.com>`;

    const resend = new Resend(apiKey);

    try {
      const result = await resend.emails.send({
        from,
        to:      draft.empfaengerEmail,
        subject: draft.betreff,
        text:    draft.textBody,
      });

      await prisma.mailDraft.update({
        where: { id: draftId },
        data: {
          status:      MailStatus.versendet,
          versendetAm: new Date(),
          resendId:    result.data?.id ?? null,
          genehmigtVonId: adminId,
        },
      });

      log.info({ draftId, to: draft.empfaengerEmail, resendId: result.data?.id }, 'Mail versendet');
      return result;
    } catch (err) {
      const fehler = err instanceof Error ? err.message : String(err);
      await prisma.mailDraft.update({
        where: { id: draftId },
        data: { status: MailStatus.fehlgeschlagen, fehler },
      });
      log.error({ draftId, fehler }, 'Mail-Versand fehlgeschlagen');
      throw err;
    }
  },

  /** Listet Drafts für ein Bonusjahr — für Admin-Approval-UI */
  async listForJahr(kalenderjahr: number) {
    return prisma.mailDraft.findMany({
      where: {
        auszahlung: { kalenderjahr },
      },
      include: {
        auszahlung: { include: { mitarbeiter: { select: { id: true, vorname: true, nachname: true, email: true } } } },
        erstelltVon: { select: { id: true, name: true } },
        genehmigtVon: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { erstelltAm: 'desc' }],
    });
  },
};
