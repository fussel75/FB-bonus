/**
 * auszahlung.service.ts
 *
 * Jahresabschluss: Bonus berechnen → Auszahlungen schreiben → Bonusbuchungen erstellen.
 * Halbjahresabschluss: Option A vorschussmäßig auszahlen (H1).
 *
 * UNVERÄNDERLICHKEITS-REGEL:
 * Bonusbuchungen werden ausschließlich per INSERT angelegt.
 * Kein UPDATE, kein DELETE auf bonusbuchungen — niemals.
 */

import { AuszahlungStatus, BonusTyp } from '@prisma/client';
import { prisma } from '../db/client';
import { bonusService } from './bonus.service';

const runde2 = (n: number) => Math.round(n * 100) / 100;

export const auszahlungService = {
  // ── Jahresabschluss ───────────────────────────────────────────────────────
  async jahresabschlussErstellen(kalenderjahr: number, adminId: number) {
    const ergebnisse = await bonusService.berechneJahresbonus(kalenderjahr);
    const heute = new Date();
    const buchungsdatum = new Date(`${kalenderjahr}-12-31`);

    let erstelltCount = 0;
    let gesamtTopf = 0;

    for (const ergebnis of ergebnisse) {
      // Bereits gezahlten H1-Betrag prüfen
      const existing = await prisma.auszahlung.findUnique({
        where: {
          mitarbeiterId_kalenderjahr: {
            mitarbeiterId: ergebnis.mitarbeiterId,
            kalenderjahr,
          },
        },
      });
      const h1Bereits = existing ? Number(existing.h1BetragOptionA) : 0;

      // Verbleibender Option-A-Betrag nach H1-Abzug
      const restOptionA  = runde2(Math.max(0, ergebnis.optionA_betrag - h1Bereits));
      const betragGesamt = ergebnis.qualifiziert
        ? runde2(restOptionA + ergebnis.optionB_betrag)
        : 0;

      // Auszahlung anlegen oder aktualisieren (H1-Felder NICHT überschreiben)
      const krankenFelder = {
        betragBrutto:        ergebnis.qualifiziert ? ergebnis.gesamtBrutto : 0,
        krankenKuerzungEur:  ergebnis.qualifiziert ? ergebnis.kranken_kuerzung_eur : 0,
        krankenFaktorProzent: ergebnis.kranken_faktor_prozent,
        kranktage:           ergebnis.kranktage,
      };

      await prisma.auszahlung.upsert({
        where: {
          mitarbeiterId_kalenderjahr: {
            mitarbeiterId: ergebnis.mitarbeiterId,
            kalenderjahr,
          },
        },
        create: {
          mitarbeiterId:  ergebnis.mitarbeiterId,
          kalenderjahr,
          betragOptionA:  restOptionA,
          betragOptionB:  ergebnis.optionB_betrag,
          betragGesamt,
          status:         AuszahlungStatus.ausstehend,
          h1BetragOptionA: h1Bereits,
          ...krankenFelder,
        },
        update: {
          betragOptionA: restOptionA,
          betragOptionB: ergebnis.optionB_betrag,
          betragGesamt,
          status:        AuszahlungStatus.ausstehend,
          ...krankenFelder,
          // h1BetragOptionA + h1AusgezahltAm bleiben unverändert
        },
      });

      // ── Bonusbuchung Option B: INSERT (Audit-Trail) ─────────────────────
      if (ergebnis.optionB_betrag > 0) {
        const krankenHinweis = ergebnis.kranken_kuerzung_eur > 0
          ? ` — Krankheits-Kürzung: ${ergebnis.kranktage} Tage, Faktor ${ergebnis.kranken_faktor_prozent} %, −${ergebnis.kranken_kuerzung_eur.toFixed(2)} €${ergebnis.efzg_aktiv ? ' (mit § 4a EFZG-Schutz)' : ''}`
          : '';

        await prisma.bonusbuchung.create({
          data: {
            mitarbeiterId: ergebnis.mitarbeiterId,
            typ:           BonusTyp.option_b,
            stunden:       ergebnis.optionB_jahressaldo,
            betragEur:     ergebnis.optionB_betrag,
            buchungsdatum,
            beschreibung:  `Jahresabschluss ${kalenderjahr} — Option B Projekteffizienz-Bonus${krankenHinweis}`,
            erstelltVonId: adminId,
          },
        });
      }

      gesamtTopf += betragGesamt;
      erstelltCount++;
    }

    return {
      kalenderjahr,
      verarbeiteteMitarbeiter: erstelltCount,
      gesamtAuszahlungTopf:    runde2(gesamtTopf),
      erstelltAm:              heute.toISOString(),
    };
  },

  // ── Halbjahresabschluss (nur Option A) ────────────────────────────────────
  async halbjahresabschlussErstellen(kalenderjahr: number, _adminId: number) {
    const ergebnisse = await bonusService.berechneJahresbonus(kalenderjahr);
    const heute = new Date();

    let erstelltCount = 0;
    let gesamtH1Topf  = 0;

    for (const ergebnis of ergebnisse) {
      // Nur qualifizierte MA mit Option-A-Betrag > 0
      if (!ergebnis.qualifiziert || ergebnis.optionA_betrag <= 0) continue;

      const h1Betrag = ergebnis.optionA_betrag;

      await prisma.auszahlung.upsert({
        where: {
          mitarbeiterId_kalenderjahr: {
            mitarbeiterId: ergebnis.mitarbeiterId,
            kalenderjahr,
          },
        },
        create: {
          mitarbeiterId:   ergebnis.mitarbeiterId,
          kalenderjahr,
          betragOptionA:   0,
          betragOptionB:   0,
          betragGesamt:    0,
          status:          AuszahlungStatus.ausstehend,
          h1BetragOptionA: h1Betrag,
          h1AusgezahltAm:  heute,
        },
        update: {
          h1BetragOptionA: h1Betrag,
          h1AusgezahltAm:  heute,
        },
      });

      gesamtH1Topf  += h1Betrag;
      erstelltCount++;
    }

    return {
      kalenderjahr,
      verarbeiteteMitarbeiter: erstelltCount,
      gesamtH1Topf:            runde2(gesamtH1Topf),
      erstelltAm:              heute.toISOString(),
    };
  },
};
