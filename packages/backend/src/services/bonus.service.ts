/**
 * bonus.service.ts
 *
 * Implementiert die Bonusberechnung exakt nach Spec:
 *
 * Option B — Projekteffizienz-Bonus:
 *   Schritt 1: Punkte(MA)    = geleistete_Stunden(MA) × Rollenfaktor(MA)
 *   Schritt 2: Anteil(MA)    = Punkte(MA) / Summe(Punkte aller MA im Projekt)
 *   Schritt 3: Guthaben(MA)  = Projektsaldo_Stunden × Anteil(MA)
 *   Schritt 4: Jahressaldo   = Summe aller Projektguthaben(MA) des Abrechnungsjahrs
 *   Schritt 5: Auszahlung    = MAX(0, Jahressaldo) × Stundensatz_Option_B
 *
 * Berechnungsreihenfolge je MA:
 *   1. Voller Bonus brutto (Option A + Option B nach Stufenmodell)
 *   2. Prozentuale Krankheits-Staffel (Karenz, Abzug/Tag, Maxgrenze)
 *   3. § 4a EFZG-Cap als untere Schranke der Kürzung
 *   4. Harte Disqualifikations-Kriterien überschreiben alles → Gesamt 0
 *
 * Krankheits-Logik (siehe utils/krankenfaktor.ts):
 *   - Karenzphase bis einschl. `kranktage_karenz` Tage → 100 % Bonus
 *   - Lineare Staffel über `kranktage_abzug_pro_tag_prozent` pro Tag
 *   - Disqualifikation bei `kranktage_max_grenze` (Default 40)
 *   - § 4a EFZG: max. Kürzung pro Tag = Tagesfaktor × Tageslohn
 *     (zwingend gesetzlich; MA bekommt den günstigeren Wert)
 *
 * Projekte werden in zwei Kategorien eingeteilt:
 *
 *   A) Archivierte Projekte (archiviert == true AND abrechnungsJahr == bonusjahr, bonusAusgeschlossen == false):
 *      → Einmalige Abrechnung in diesem Jahr
 *      → Alle Mitarbeiter aller Jahre werden einbezogen (Gesamtstunden über Laufzeit)
 *      → Danach kein Einfluss mehr auf zukünftige Berechnungen
 *
 *   B) Aktive Projekte (archiviert == false AND bonusAusgeschlossen == false):
 *      → abrechnungsJahr == null: immer im aktuellen Bonusjahr
 *      → abrechnungsJahr == bonusjahr: im aktuellen Bonusjahr (geplante Abrechnung)
 *      → abrechnungsJahr != bonusjahr: übersprungen (anderes Jahr)
 *      → Jahresspezifische Stunden des Bonusjahrs
 *      → Auslastungs-Schwellenwert gilt
 *
 * WICHTIG:
 *   - Kein negativer Jahressaldo wird ausgezahlt (Boden: 0)
 *   - Kein Vortrag ins Folgejahr
 *   - Kein Abzug vom Lohn
 *   - Bonusbuchungen werden NIEMALS geändert oder gelöscht (Audit-Trail)
 */

import { prisma } from '../db/client';
import { konfigService } from './konfiguration.service';
import { stufenBetrag, ladeStufenKonfig } from '../utils/stufensatz';
import { wendeKrankenKuerzungAn } from '../utils/krankenfaktor';
import { BonusJahresübersicht, BonusProjektDetail } from '../types';

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

function runde2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Qualifikationsprüfung ───────────────────────────────────────────────────

/**
 * Prüft die harten Disqualifikations-Kriterien.
 * Kranktage werden NICHT mehr hier als Schwellwert-Cut behandelt — die
 * Staffelung erfolgt im Service über wendeKrankenKuerzungAn(). Nur die
 * absolute Obergrenze `kranktage_max_grenze` führt hier zur Disqualifikation.
 */
async function pruefeHarteKriterien(
  _mitarbeiterId: number,
  eintrittsdatum: Date | null,
  austrittsdatum: Date | null,
  kranktage: number,
  kalenderjahr: number,
  maxGrenze: number,
  mindestMonate: number,
  ganzjahrBedingung: boolean,
  ganzjahresMindestMonateImJahr: number,
): Promise<{ qualifiziert: boolean; grund?: string }> {
  if (!eintrittsdatum) {
    return { qualifiziert: false, grund: 'Kein Eintrittsdatum bekannt' };
  }

  if (kranktage >= maxGrenze) {
    return {
      qualifiziert: false,
      grund: `${kranktage} Kranktage erreichen die Maxgrenze von ${maxGrenze}`,
    };
  }

  const stichtag = new Date(`${kalenderjahr}-12-31`);
  const monate =
    (stichtag.getFullYear() - eintrittsdatum.getFullYear()) * 12 +
    (stichtag.getMonth() - eintrittsdatum.getMonth());

  if (monate < mindestMonate) {
    return {
      qualifiziert: false,
      grund: `Nur ${monate} Monate Betriebszugehörigkeit (Mindest: ${mindestMonate})`,
    };
  }

  if (ganzjahrBedingung) {
    const eintritt   = new Date(eintrittsdatum.getFullYear(), eintrittsdatum.getMonth(), eintrittsdatum.getDate());
    const janErster  = new Date(kalenderjahr, 0, 1);
    if (eintritt > janErster) {
      return {
        qualifiziert: false,
        grund: `Eintrittsdatum ${eintritt.toLocaleDateString('de-DE')} liegt nach dem 01.01.${kalenderjahr} — kein volles Kalenderjahr`,
      };
    }

    // Austritt im Bonusjahr: prüfen, ob anteilige Qualifikation greift
    if (austrittsdatum && austrittsdatum.getFullYear() === kalenderjahr) {
      const monateImJahr = austrittsdatum.getMonth() + 1; // Januar = 1
      if (ganzjahresMindestMonateImJahr > 0 && monateImJahr >= ganzjahresMindestMonateImJahr) {
        // anteilige Qualifikation greift → MA bleibt qualifiziert
      } else {
        return {
          qualifiziert: false,
          grund: `Austritt am ${austrittsdatum.toLocaleDateString('de-DE')} — kein volles Kalenderjahr ${kalenderjahr}`,
        };
      }
    }
  }

  return { qualifiziert: true };
}

// ─── Hauptservice ────────────────────────────────────────────────────────────

export const bonusService = {
  /**
   * Berechnet den Jahresbonus für alle Mitarbeiter.
   * Schreibt KEINE Daten — gibt nur Vorschau zurück.
   * (Schreiben erfolgt in auszahlung.service.ts beim Jahresabschluss)
   */
  async berechneJahresbonus(kalenderjahr: number): Promise<BonusJahresübersicht[]> {
    // ── Konfiguration laden ────────────────────────────────────────────────
    const konfig = await konfigService.alleWerte();
    const stundensatzA      = Number(konfig.stundensatz_option_a)                  || 5;
    const stufen            = ladeStufenKonfig(konfig);
    const mindestMonate       = Number(konfig.mindest_betriebszugehoerigkeit_monate) || 12;
    const mindestAuslastung   = Number(konfig.mindest_auslastung_bonusrelevant ?? 80) / 100;
    const ganzjahrBedingung   = String(konfig.ganzjahres_bedingung_aktiv ?? 'true') !== 'false';
    const ganzjahresMindestMonateImJahr = Number(konfig.ganzjahres_bedingung_mindest_monate_im_jahr ?? 0);
    // gesamt | proportional | abschlussjahr
    const saldoMethode      = String(konfig.saldo_berechnungsmethode || 'gesamt');

    // Krankheits-Staffel
    const krankenKarenz       = Number(konfig.kranktage_karenz ?? 15);
    const krankenAbzugProTag  = Number(konfig.kranktage_abzug_pro_tag_prozent ?? 4);
    const krankenMaxGrenze    = Number(konfig.kranktage_max_grenze ?? 40);
    const efzgAktiv           = String(konfig.kranktage_efzg_schutz_aktiv ?? 'true') !== 'false';
    const efzgTagesfaktor     = Number(konfig.kranktage_efzg_tagesfaktor ?? 0.25);

    // ── A) Archivierte Projekte für dieses Jahr laden (Gesamtstunden) ──────
    // archiviert=true AND abrechnungsJahr==bonusjahr → Gesamtstunden aller Jahre
    const archivierteProjekte = await prisma.projekt.findMany({
      where: {
        archiviert:          true,
        abrechnungsJahr:     kalenderjahr,
        bonusAusgeschlossen: false,
      },
      include: {
        mitarbeiterStunden: {
          include: { mitarbeiter: { include: { rolle: true } } },
        },
      },
    });

    // Punkt-Summen für archivierte Projekte (alle Jahre, alle MA)
    const archivPunktSummen = new Map<number, number>();
    for (const p of archivierteProjekte) {
      // Stunden je MA über alle Jahre summieren
      const stundenJeMA = new Map<number, { stunden: number; faktor: number }>();
      for (const pm of p.mitarbeiterStunden) {
        const maId  = pm.mitarbeiterId;
        const std   = Number(pm.istStunden);
        const fakt  = Number(pm.mitarbeiter.rolle.faktor);
        if (stundenJeMA.has(maId)) {
          stundenJeMA.get(maId)!.stunden += std;
        } else {
          stundenJeMA.set(maId, { stunden: std, faktor: fakt });
        }
      }
      let summe = 0;
      for (const { stunden, faktor } of stundenJeMA.values()) {
        summe += stunden * faktor;
      }
      archivPunktSummen.set(p.id, summe);
    }

    // Für jeden MA: Stunden auf archivierten Projekten (alle Jahre zusammen)
    // Map: maId → Map<projektId, { stunden, faktor, saldo, projektname }>
    const archivBeitraegeJeMA = new Map<number, Map<number, {
      stunden:     number;
      faktor:      number;
      saldo:       number;
      projektname: string;
      projektnummer: string;
    }>>();

    for (const p of archivierteProjekte) {
      const saldo = Number(p.sollStunden) - Number(p.istStundenGesamt);

      // Stunden je MA über alle Jahre summieren
      const stundenJeMA = new Map<number, { stunden: number; faktor: number }>();
      for (const pm of p.mitarbeiterStunden) {
        const maId = pm.mitarbeiterId;
        const std  = Number(pm.istStunden);
        const fakt = Number(pm.mitarbeiter.rolle.faktor);
        if (stundenJeMA.has(maId)) {
          stundenJeMA.get(maId)!.stunden += std;
        } else {
          stundenJeMA.set(maId, { stunden: std, faktor: fakt });
        }
      }

      for (const [maId, { stunden, faktor }] of stundenJeMA) {
        if (!archivBeitraegeJeMA.has(maId)) {
          archivBeitraegeJeMA.set(maId, new Map());
        }
        archivBeitraegeJeMA.get(maId)!.set(p.id, {
          stunden,
          faktor,
          saldo,
          projektname:   p.projektname,
          projektnummer: p.projektnummer,
        });
      }
    }

    // ── B) Aktive Projekte (nicht archiviert) — jahresspezifisch ──────────
    // Enthält: abrechnungsJahr=null UND abrechnungsJahr=bonusjahr (sofern nicht archiviert)
    const aktiveProjekte = await prisma.projekt.findMany({
      where: {
        archiviert:          false,
        bonusAusgeschlossen: false,
        OR: [
          { abrechnungsJahr: null },
          { abrechnungsJahr: kalenderjahr },
        ],
      },
      include: {
        mitarbeiterStunden: {
          where:   { jahr: kalenderjahr },
          include: { mitarbeiter: { include: { rolle: true } } },
        },
      },
    });

    // Punkt-Summen für aktive Projekte (nur Bonusjahr)
    const aktivPunktSummen = new Map<number, number>();
    for (const p of aktiveProjekte) {
      let summe = 0;
      for (const pm of p.mitarbeiterStunden) {
        summe += Number(pm.istStunden) * Number(pm.mitarbeiter.rolle.faktor);
      }
      aktivPunktSummen.set(p.id, summe);
    }

    // Jahres-Ist-Stunden je aktivem Projekt (Summe aller MA, nur Bonusjahr)
    // Wird für die `proportional`-Berechnungsmethode benötigt
    const aktivJahresIstSummen = new Map<number, number>();
    for (const p of aktiveProjekte) {
      const summe = p.mitarbeiterStunden.reduce(
        (s, pm) => s + Number(pm.istStunden), 0,
      );
      aktivJahresIstSummen.set(p.id, summe);
    }

    // ── Mitarbeiter laden (mit jahresspezifischen Stunden für aktive Projekte)
    const mitarbeiter = await prisma.mitarbeiter.findMany({
      where:   { aktiv: true },
      include: {
        rolle:          true,
        projektStunden: {
          where:   { jahr: kalenderjahr },
          include: { projekt: true },
        },
      },
    });

    // Option-A-Buchungen für dieses Jahr
    const buchungenA = await prisma.bonusbuchung.findMany({
      where: {
        typ:           'option_a',
        buchungsdatum: {
          gte: new Date(`${kalenderjahr}-01-01`),
          lte: new Date(`${kalenderjahr}-12-31`),
        },
      },
    });

    // Wurst-Abzüge für dieses Jahr (offene, nicht aufgelöste Wurststunden)
    const wurstAbzuege = await prisma.wurstAbzug.findMany({
      where: { kalenderjahr },
    });
    const wurstByMA = new Map(wurstAbzuege.map((w) => [w.mitarbeiterId, Number(w.offeneStunden)]));

    // ── Je Mitarbeiter berechnen ──────────────────────────────────────────
    const ergebnisse: BonusJahresübersicht[] = [];

    for (const ma of mitarbeiter) {
      const rollenfaktor = Number(ma.rolle.faktor);

      const { qualifiziert, grund } = await pruefeHarteKriterien(
        ma.id,
        ma.eintrittsdatum,
        ma.austrittsdatum,
        ma.kranktageAktuellesJahr,
        kalenderjahr,
        krankenMaxGrenze,
        mindestMonate,
        ganzjahrBedingung,
        ganzjahresMindestMonateImJahr,
      );

      const projektDetails: BonusProjektDetail[] = [];
      let jahressaldoStunden = 0;

      // ── A) Beitrag aus archivierten Projekten (Gesamtstunden, alle Jahre) ─
      const archivBeitraege = archivBeitraegeJeMA.get(ma.id) ?? new Map();
      for (const [projektId, beitrag] of archivBeitraege) {
        const { stunden, faktor, saldo, projektname } = beitrag;
        const punkte      = stunden * faktor;
        const summePunkte = archivPunktSummen.get(projektId) ?? 0;
        const anteil      = summePunkte > 0 ? punkte / summePunkte : 0;
        const guthabenStunden = saldo * anteil;
        jahressaldoStunden += guthabenStunden;

        const p = archivierteProjekte.find((x) => x.id === projektId)!;
        projektDetails.push({
          projektId,
          projektname,
          sollStunden:          runde2(Number(p.sollStunden)),
          istStunden:           runde2(Number(p.istStundenGesamt)),
          saldo:                runde2(saldo),
          punkte:               runde2(punkte),
          anteilProzent:        runde2(anteil * 100),
          guthabenStunden:      runde2(guthabenStunden),
          guthabenEur:          0,
          extraStunden:         0,
          istBonusrelevant:     true,   // archivierte Projekte zählen immer
          auslastungProzent:    Number(p.sollStunden) > 0
            ? runde2((Number(p.istStundenGesamt) / Number(p.sollStunden)) * 100)
            : 0,
        });
      }

      // ── B) Beitrag aus aktiven Projekten (jahresspezifische Stunden) ──────
      for (const pm of ma.projektStunden) {
        const projekt     = pm.projekt;
        // Überspringe archivierte Projekte (werden in Abschnitt A behandelt)
        if (projekt.archiviert) continue;
        // Überspringe manuell ausgeschlossene Projekte
        if (projekt.bonusAusgeschlossen) continue;
        // Überspringe Projekte die einem anderen Bonusjahr zugeordnet sind
        if (projekt.abrechnungsJahr !== null && projekt.abrechnungsJahr !== kalenderjahr) continue;

        const istStunden  = Number(pm.istStunden);
        const sollStunden = Number(projekt.sollStunden);
        const gesamtSaldo = sollStunden - Number(projekt.istStundenGesamt);

        const auslastung = sollStunden > 0
          ? Number(projekt.istStundenGesamt) / sollStunden
          : 0;
        const istBonusrelevant =
          projekt.status === 'abgeschlossen' ||
          auslastung >= mindestAuslastung;

        // ── Saldo-Berechnungsmethode anwenden ──────────────────────────────
        let saldoBasis: number;
        if (saldoMethode === 'abschlussjahr') {
          // Nur archivierte Abschlussprojekte (Block A) zählen —
          // aktive Projekte tragen 0 zum Saldo bei.
          saldoBasis = 0;
        } else if (saldoMethode === 'proportional') {
          // Anteiliger Jahressaldo: gesamtSaldo × (JahresIst / GesamtIst)
          // → nur der im Bonusjahr erarbeitete Anteil des Projektsaldos wird bewertet
          const jahresIst = aktivJahresIstSummen.get(projekt.id) ?? 0;
          const gesamtIst = Number(projekt.istStundenGesamt);
          const anteilFaktor = gesamtIst > 0 ? jahresIst / gesamtIst : 0;
          saldoBasis = gesamtSaldo * anteilFaktor;
        } else {
          // gesamt (Standard): voller Projektsaldo fließt ein
          saldoBasis = gesamtSaldo;
        }

        const saldo = istBonusrelevant ? saldoBasis : 0;

        const punkte      = istStunden * rollenfaktor;
        const summePunkte = aktivPunktSummen.get(projekt.id) ?? 0;
        const anteil      = summePunkte > 0 ? punkte / summePunkte : 0;
        const guthabenStunden = saldo * anteil;
        jahressaldoStunden += guthabenStunden;

        // extraStunden aus bonusbuchungen (typ='option_a') für dieses Projekt
        const extraStdProjekt = runde2(
          buchungenA
            .filter((b) => b.mitarbeiterId === ma.id && b.projektId === projekt.id)
            .reduce((sum, b) => sum + Number(b.stunden), 0),
        );

        projektDetails.push({
          projektId:           projekt.id,
          projektname:         projekt.projektname,
          sollStunden:         runde2(sollStunden),
          // istStunden = Jahresstunden dieses MA (nicht Projekt-Gesamtstunden aller MA/Jahre)
          istStunden:          runde2(istStunden),
          saldo:               runde2(saldo),
          punkte:              runde2(punkte),
          anteilProzent:       runde2(anteil * 100),
          guthabenStunden:     runde2(guthabenStunden),
          guthabenEur:         0,
          extraStunden:        extraStdProjekt,
          istBonusrelevant,
          auslastungProzent:   sollStunden > 0
            ? runde2((Number(projekt.istStundenGesamt) / sollStunden) * 100)
            : 0,
        });
      }

      // Schritt 4 & 5: Jahressaldo mit Boden bei 0
      const jahressaldoMitBoden = Math.max(0, jahressaldoStunden);
      const betragOptionB       = runde2(stufenBetrag(jahressaldoMitBoden, stufen.s1bis, stufen.s1satz, stufen.s2bis, stufen.s2satz, stufen.s3satz));

      // ── Option A ──────────────────────────────────────────────────────────
      // Quelle: bonusbuchungen (typ='option_a') — enthält sowohl Auto-Sync-
      // Einträge (erstelltVonId=null) als auch manuelle Admin-Buchungen.
      const maBuchungenA = buchungenA.filter((b) => b.mitarbeiterId === ma.id);
      const optionABrutto = runde2(
        maBuchungenA.reduce((sum, b) => sum + Number(b.stunden), 0),
      );

      // Wurst-Abzug: offene Wurststunden werden temporär von Option A abgezogen
      const wurstAbzugStunden = runde2(wurstByMA.get(ma.id) ?? 0);
      const optionAStunden    = runde2(Math.max(0, optionABrutto - wurstAbzugStunden));
      const betragOptionA     = runde2(optionAStunden * stundensatzA);
      const wurstAbzugBetrag  = runde2(wurstAbzugStunden * stundensatzA);

      // ── Krankheits-Staffelung + § 4a EFZG-Cap ──────────────────────────────
      const gesamtBrutto = runde2(betragOptionA + betragOptionB);

      const stundenlohn = ma.stundenlohnBrutto !== null && ma.stundenlohnBrutto !== undefined
        ? Number(ma.stundenlohnBrutto)
        : null;
      const tagesStunden = ma.tagesstundenDurchschnitt !== null && ma.tagesstundenDurchschnitt !== undefined
        ? Number(ma.tagesstundenDurchschnitt)
        : null;

      if (efzgAktiv && stundenlohn === null && ma.kranktageAktuellesJahr > krankenKarenz) {
        console.warn(
          `[Bonus] EFZG-Schutz für MA #${ma.id} (${ma.vorname} ${ma.nachname}) nicht anwendbar — kein stundenlohnBrutto gesetzt.`,
        );
      }

      const kuerzung = wendeKrankenKuerzungAn({
        gesamtBrutto,
        kranktage:                ma.kranktageAktuellesJahr,
        karenz:                   krankenKarenz,
        abzugProTagProzent:       krankenAbzugProTag,
        maxGrenze:                krankenMaxGrenze,
        efzgAktiv,
        efzgTagesfaktor,
        stundenlohnBrutto:        stundenlohn,
        tagesstundenDurchschnitt: tagesStunden,
      });

      const krankenFaktor   = kuerzung.faktor;
      const krankenKuerzung = runde2(kuerzung.kuerzungEur);
      const gesamtNach      = runde2(kuerzung.gesamtNachKuerzung);

      // Option A und Option B anteilig nach Faktor kürzen, damit der Breakdown stimmig bleibt
      const anteilA = gesamtBrutto > 0 ? betragOptionA / gesamtBrutto : 0;
      const anteilB = gesamtBrutto > 0 ? betragOptionB / gesamtBrutto : 0;
      const betragOptionA_nachKuerzung = runde2(gesamtNach * anteilA);
      const betragOptionB_nachKuerzung = runde2(gesamtNach * anteilB);

      const gesamtBetrag = qualifiziert ? gesamtNach : 0;

      ergebnisse.push({
        mitarbeiterId:            ma.id,
        mitarbeiterName:          `${ma.vorname} ${ma.nachname}`,
        kalenderjahr,
        optionA_stunden:          runde2(optionAStunden),
        optionA_betrag:           qualifiziert ? betragOptionA_nachKuerzung : 0,
        optionB_jahressaldo:      runde2(jahressaldoMitBoden),
        optionB_betrag:           qualifiziert ? betragOptionB_nachKuerzung : 0,
        gesamtBetrag,
        gesamtBrutto:             runde2(gesamtBrutto),
        qualifiziert,
        disqualGrund:             grund,
        projekte:                 projektDetails,
        mindestAuslastungProzent: runde2(mindestAuslastung * 100),
        wurst_abzug_stunden:      wurstAbzugStunden,
        wurst_abzug_betrag:       qualifiziert ? wurstAbzugBetrag : 0,
        kranktage:                ma.kranktageAktuellesJahr,
        kranken_faktor_prozent:   runde2(krankenFaktor * 100),
        kranken_kuerzung_eur:     qualifiziert ? krankenKuerzung : 0,
        efzg_aktiv:               efzgAktiv,
        efzg_max_kuerzung_eur:    kuerzung.efzgMaxKuerzung !== null ? runde2(kuerzung.efzgMaxKuerzung) : null,
      });
    }

    return ergebnisse;
  },

  /**
   * Bonus für einzelnen Mitarbeiter berechnen
   */
  async berechneFuerMitarbeiter(
    mitarbeiterId: number,
    kalenderjahr:  number,
  ): Promise<BonusJahresübersicht | null> {
    const alle = await this.berechneJahresbonus(kalenderjahr);
    return alle.find((e) => e.mitarbeiterId === mitarbeiterId) ?? null;
  },
};
