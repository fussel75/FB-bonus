/**
 * prognose.service.ts — Schritt 10 (überarbeitet)
 *
 * Zwei Berechnungen:
 *
 * 1. berechnePrognose(jahr)         → Mitarbeiter-Prognose (wie bisher + verfeinert)
 * 2. berechneProjektSensitivitaet() → Stunden-Puffer JE PROJEKT je Mitarbeiter
 *
 * Annahme für Hochrechnung: linearer Fortschritt bis Jahresende.
 * Szenario-Logik:
 *   Min  = aktueller Stand (keine weiteren Verbesserungen)
 *   Base = linearer Trend fortgeschrieben
 *   Max  = Base + 15% Optimismus-Puffer (Effizienzgewinne halten an)
 */

import { ProjektStatus } from '@prisma/client';
import { prisma }          from '../db/client';
import { konfigService }   from './konfiguration.service';
import { bonusService }    from './bonus.service';
import { stufenBetrag, ladeStufenKonfig } from '../utils/stufensatz';
import { PrognoseErgebnis } from '../types';

function runde2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Mindestauslastung (Anteil istStunden / sollStunden) bevor ein Projekt
 * in die Prognose-Hochrechnung einfließt.
 * Projekte darunter gelten als "noch nicht begonnen" → progSaldo = 0.
 */
const MIN_AUSLASTUNG_PROGNOSE = 0.20; // 20 %

/** Wie weit ist das Kalenderjahr bereits fortgeschritten? (0.0 – 1.0) */
function jahresfortschritt(kalenderjahr: number): number {
  const jetzt     = new Date();
  const start     = new Date(`${kalenderjahr}-01-01`).getTime();
  const ende      = new Date(`${kalenderjahr}-12-31`).getTime();
  const now       = Math.min(jetzt.getTime(), ende);
  return (now - start) / (ende - start);
}

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface MitarbeiterPuffer {
  mitarbeiterId:   number;
  mitarbeiterName: string;
  istStunden:      number;
  anteilProz:      number;    // Anteil am Projekt in %
  pufferStunden:   number;    // Wie viele h darf dieses Projekt noch überziehen
  guthabenAktuell: number;    // Aktuelles Guthaben in h (saldo × anteil)
}

export interface ProjektSensitivitaet {
  projektId:           number;
  projektnummer:       string;
  projektname:         string;
  sollStunden:         number;
  istStunden:          number;
  saldo:               number;    // positiv = Effizienzgewinn
  auslastungProz:      number;
  nochNichtBegonnen:   boolean;   // true wenn Auslastung < MIN_AUSLASTUNG_PROGNOSE
  abgeschlossen:       boolean;   // true wenn Projektstatus = 'abgeschlossen'
  bonusAusgeschlossen: boolean;
  mitarbeiter:         MitarbeiterPuffer[];
}

export interface ProjektSensitivitaetAntwort {
  kalenderjahr:        number;
  jahresfortschritt:   number;   // 0–100
  gesamtPufferStunden: number;   // Summe aller positiven Puffer
  kritischeProjekte:   number;   // Projekte mit Puffer < 10 h
  projekte:            ProjektSensitivitaet[];
}

// ─── Prognose-Service ─────────────────────────────────────────────────────────

export const prognoseService = {

  // ── Mitarbeiter-Prognose (überarbeitet) ──────────────────────────────────────
  async berechnePrognose(kalenderjahr: number): Promise<{
    ergebnisse:       PrognoseErgebnis[];
    gesamtPrognose:   number;
    gesamtMin:        number;
    gesamtMax:        number;
    jahresfortschritt: number;
  }> {
    const konfig       = await konfigService.alleWerte();
    const stufen       = ladeStufenKonfig(konfig);
    const stundensatzA = Number(konfig.stundensatz_option_a) || 5;
    const fortschritt  = jahresfortschritt(kalenderjahr);

    const aktuelleBonus = await bonusService.berechneJahresbonus(kalenderjahr);

    // Nur aktive und abgeschlossene (nicht archivierte) Projekte einbeziehen —
    // pausierte und archivierte Projekte tauchen in der Prognose nicht auf.
    const aktiveProjekte = await prisma.projekt.findMany({
      where: {
        bonusAusgeschlossen: false,
        archiviert:          false,
        status:              { in: [ProjektStatus.aktiv, ProjektStatus.abgeschlossen] },
      },
      include: {
        mitarbeiterStunden: {
          where:   { jahr: kalenderjahr },
          include: { mitarbeiter: { include: { rolle: true } } },
        },
      },
    });

    const ergebnisse: PrognoseErgebnis[] = [];

    for (const ma of aktuelleBonus) {
      // Option A: linearer Hochlauf
      const progA_stunden = fortschritt > 0
        ? ma.optionA_stunden / fortschritt
        : ma.optionA_stunden;
      const progA_betrag = runde2(progA_stunden * stundensatzA);

      // Option B: Projektsaldi hochrechnen
      let progB_saldo  = 0;
      let minPuffer    = Infinity;

      for (const proj of aktiveProjekte) {
        const pm = proj.mitarbeiterStunden.find((p) => p.mitarbeiterId === ma.mitarbeiterId);
        if (!pm) continue;

        const istStunden  = Number(pm.istStunden);
        const sollStunden = Number(proj.sollStunden);
        const faktor      = Number(pm.mitarbeiter.rolle.faktor);
        const istGesamt   = Number(proj.istStundenGesamt);

        // Auslastungscheck: Projekte die noch nicht ausreichend begonnen haben
        // fließen nicht in die Prognose ein (verhindert unrealistische Saldo-Hochrechnung)
        const auslastung = sollStunden > 0 ? istGesamt / sollStunden : 0;
        if (auslastung < MIN_AUSLASTUNG_PROGNOSE) continue;

        // Hochrechnung IstStunden linear
        const progIst        = fortschritt > 0 ? istStunden / fortschritt : istStunden;
        const progPunkte     = progIst * faktor;

        const summePunkte = proj.mitarbeiterStunden.reduce((s, p) => {
          const pIst = fortschritt > 0
            ? Number(p.istStunden) / fortschritt
            : Number(p.istStunden);
          return s + pIst * Number(p.mitarbeiter.rolle.faktor);
        }, 0);

        const anteil      = summePunkte > 0 ? progPunkte / summePunkte : 0;
        const progIstGes  = fortschritt > 0 ? istGesamt / fortschritt : istGesamt;
        const progSaldo   = sollStunden - progIstGes;

        progB_saldo += progSaldo * anteil;

        // Puffer: persönliches Guthaben dieses MA in diesem Projekt (h)
        // = aktSaldo × Anteil → wie viele "eigene" Stunden noch als Puffer verbleiben
        // (aktSaldo / anteil würde bei kleinem Anteil astronomische Zahlen ergeben)
        const aktSaldo    = sollStunden - istGesamt;
        const guthabenH   = aktSaldo * anteil;   // kann negativ sein (Projekt überzogen)
        if (anteil > 0) {
          minPuffer = Math.min(minPuffer, guthabenH);
        }
      }

      const progBetragB = runde2(stufenBetrag(Math.max(0, progB_saldo), stufen.s1bis, stufen.s1satz, stufen.s2bis, stufen.s2satz, stufen.s3satz));
      const progGesamt  = runde2(progA_betrag + progBetragB);

      // Min-Szenario: aktueller Stand eingefroren
      const minBetrag = runde2(
        (ma.qualifiziert ? ma.optionA_betrag : 0) +
        (ma.qualifiziert ? ma.optionB_betrag : 0),
      );

      // Max-Szenario: +15% Optimismus auf die Prognose
      const maxBetrag = runde2(progGesamt * 1.15);

      ergebnisse.push({
        mitarbeiterId:       ma.mitarbeiterId,
        mitarbeiterName:     ma.mitarbeiterName,
        prognoseBetrag:      progGesamt,
        minSzenario:         minBetrag,
        maxSzenario:         maxBetrag,
        risikoStundenPuffer: minPuffer === Infinity ? -1 : runde2(minPuffer),
      });
    }

    const gesamtPrognose = runde2(ergebnisse.reduce((s, e) => s + e.prognoseBetrag, 0));
    const gesamtMin      = runde2(ergebnisse.reduce((s, e) => s + e.minSzenario, 0));
    const gesamtMax      = runde2(ergebnisse.reduce((s, e) => s + e.maxSzenario, 0));

    return {
      ergebnisse,
      gesamtPrognose,
      gesamtMin,
      gesamtMax,
      jahresfortschritt: runde2(fortschritt * 100),
    };
  },

  // ── Prognosesimulation ────────────────────────────────────────────────────────
  /**
   * Simuliert den Jahresbonus mit überschriebener Endauslastung je Projekt.
   * Option A (Extrastunden) bleibt unverändert; Qualifikationsstatus bleibt unverändert.
   * Nur Option B (Projekteffizienz) wird neu berechnet.
   */
  async simuliereBonus(
    kalenderjahr: number,
    overrides: { projektId: number; abschlussAuslastungProzent: number }[],
  ): Promise<{
    mitarbeiter: {
      mitarbeiterId:     number;
      mitarbeiterName:   string;
      optionA_betrag:    number;
      optionB_aktuell:   number;
      optionB_simuliert: number;
      gesamt_aktuell:    number;
      gesamt_simuliert:  number;
      differenz:         number;
      qualifiziert:      boolean;
    }[];
    gesamt_aktuell:   number;
    gesamt_simuliert: number;
  }> {
    const konfig          = await konfigService.alleWerte();
    const stufen          = ladeStufenKonfig(konfig);
    const mindestAuslastung = Number(konfig.mindest_auslastung_bonusrelevant ?? 80) / 100;

    // Aktuelle Bonus-Berechnung (liefert Option A + Qualifikation)
    const aktuelleBonus = await bonusService.berechneJahresbonus(kalenderjahr);

    // Projekte mit Mitarbeiter-Stunden laden — nur aktive und abgeschlossene,
    // keine archivierten, keine pausierten Projekte (konsistent mit den anderen Prognose-Abfragen).
    const projekte   = await prisma.projekt.findMany({
      where: {
        bonusAusgeschlossen: false,
        archiviert:          false,
        status:              { in: [ProjektStatus.aktiv, ProjektStatus.abgeschlossen] },
        OR: [{ abrechnungsJahr: null }, { abrechnungsJahr: kalenderjahr }],
      },
      include: {
        mitarbeiterStunden: {
          where:   { jahr: kalenderjahr },
          include: { mitarbeiter: { include: { rolle: true } } },
        },
      },
    });

    const overrideMap = new Map(overrides.map((o) => [o.projektId, o.abschlussAuslastungProzent / 100]));

    // Punkt-Summen pro Projekt (für Anteil-Berechnung)
    const punktSummen = new Map<number, number>();
    for (const proj of projekte) {
      const summe = proj.mitarbeiterStunden.reduce(
        (s, pm) => s + Number(pm.istStunden) * Number(pm.mitarbeiter.rolle.faktor),
        0,
      );
      punktSummen.set(proj.id, summe);
    }

    // Simulations-Saldo je Projekt berechnen
    const simSalden = new Map<number, number>();
    for (const proj of projekte) {
      const sollStunden = Number(proj.sollStunden);
      const simAuslastung = overrideMap.has(proj.id)
        ? overrideMap.get(proj.id)!
        : (sollStunden > 0 ? Number(proj.istStundenGesamt) / sollStunden : 0);

      const istBonusrelevant =
        proj.status === 'abgeschlossen' || simAuslastung >= mindestAuslastung;

      const simIstGesamt = sollStunden * simAuslastung;
      const simSaldo     = istBonusrelevant ? sollStunden - simIstGesamt : 0;
      simSalden.set(proj.id, simSaldo);
    }

    // Simulations-Option-B je Mitarbeiter
    const simSaldoJeMA = new Map<number, number>(); // maId → jahressaldo h

    for (const proj of projekte) {
      const simSaldo    = simSalden.get(proj.id) ?? 0;
      const summePunkte = punktSummen.get(proj.id) ?? 0;

      for (const pm of proj.mitarbeiterStunden) {
        const punkte  = Number(pm.istStunden) * Number(pm.mitarbeiter.rolle.faktor);
        const anteil  = summePunkte > 0 ? punkte / summePunkte : 0;
        const guthaben = Math.max(0, simSaldo) * anteil;
        simSaldoJeMA.set(pm.mitarbeiterId, (simSaldoJeMA.get(pm.mitarbeiterId) ?? 0) + guthaben);
      }
    }

    const ergebnisse = aktuelleBonus.map((ma) => {
      const simJahressaldo  = simSaldoJeMA.get(ma.mitarbeiterId) ?? 0;
      const optionB_simuliert = runde2(stufenBetrag(Math.max(0, simJahressaldo), stufen.s1bis, stufen.s1satz, stufen.s2bis, stufen.s2satz, stufen.s3satz));
      const gesamt_simuliert  = ma.qualifiziert
        ? runde2(ma.optionA_betrag + optionB_simuliert)
        : 0;

      return {
        mitarbeiterId:     ma.mitarbeiterId,
        mitarbeiterName:   ma.mitarbeiterName,
        optionA_betrag:    ma.optionA_betrag,
        optionB_aktuell:   ma.optionB_betrag,
        optionB_simuliert,
        gesamt_aktuell:    ma.gesamtBetrag,
        gesamt_simuliert,
        differenz:         runde2(gesamt_simuliert - ma.gesamtBetrag),
        qualifiziert:      ma.qualifiziert,
      };
    });

    return {
      mitarbeiter:      ergebnisse,
      gesamt_aktuell:   runde2(ergebnisse.reduce((s, e) => s + e.gesamt_aktuell,   0)),
      gesamt_simuliert: runde2(ergebnisse.reduce((s, e) => s + e.gesamt_simuliert, 0)),
    };
  },

  // ── Projekt-Sensitivitätsanalyse (NEU Schritt 10) ────────────────────────────
  async berechneProjektSensitivitaet(
    kalenderjahr: number,
  ): Promise<ProjektSensitivitaetAntwort> {
    const fortschritt = jahresfortschritt(kalenderjahr);

    const projekte = await prisma.projekt.findMany({
      where: {
        bonusAusgeschlossen: false,
        archiviert:          false,
        status:              { in: [ProjektStatus.aktiv, ProjektStatus.abgeschlossen] },
      },
      include: {
        mitarbeiterStunden: {
          where:   { jahr: kalenderjahr },
          include: {
            mitarbeiter: { include: { rolle: true } },
          },
        },
      },
      orderBy: { projektnummer: 'asc' },
    });

    const ergebnisProjekte: ProjektSensitivitaet[] = [];
    let gesamtPufferStunden = 0;
    let kritischeProjekte   = 0;

    for (const proj of projekte) {
      const sollStunden = Number(proj.sollStunden);
      const istStunden  = Number(proj.istStundenGesamt);
      const saldo       = sollStunden - istStunden;
      const auslastung  = sollStunden > 0
        ? runde2((istStunden / sollStunden) * 100)
        : 0;

      // Punkte-Summe aller MA in diesem Projekt
      const summePunkte = proj.mitarbeiterStunden.reduce((s, pm) => {
        return s + Number(pm.istStunden) * Number(pm.mitarbeiter.rolle.faktor);
      }, 0);

      const maPuffer: MitarbeiterPuffer[] = proj.mitarbeiterStunden.map((pm) => {
        const punkte  = Number(pm.istStunden) * Number(pm.mitarbeiter.rolle.faktor);
        const anteil  = summePunkte > 0 ? punkte / summePunkte : 0;

        // Guthaben = Saldo (Projektsaldo) × Anteil (für diesen MA)
        const guthabenAktuell = runde2(Math.max(0, saldo) * anteil);

        // Stunden-Puffer: wieviele Ist-Stunden mehr darf das Projekt noch haben
        // bevor dieser MA ins Minus dreht?
        // Saldo × anteil > 0 → puffer = saldo (da anteil < 1, aber saldo ist der absolute Spielraum)
        // Genauer: puffer = saldo / 1 (da das ganze Projekt überläuft, nicht nur dieser MA-Anteil)
        // Aus Sicht des MA: sein Guthabenanteil = saldo × anteil → er verliert, wenn saldo < 0
        // Also puffer = saldo (der gesamte verbleibende Saldo des Projekts)
        const pufferStunden = runde2(saldo);

        return {
          mitarbeiterId:   pm.mitarbeiterId,
          mitarbeiterName: `${pm.mitarbeiter.vorname} ${pm.mitarbeiter.nachname}`,
          istStunden:      Number(pm.istStunden),
          anteilProz:      runde2(anteil * 100),
          pufferStunden,
          guthabenAktuell,
        };
      });

      const nochNichtBegonnen = auslastung < MIN_AUSLASTUNG_PROGNOSE * 100;

      // Nur begonnene Projekte zählen zum Gesamt-Puffer und zu kritischen Projekten
      const abgeschlossen = proj.status === 'abgeschlossen';

      if (!nochNichtBegonnen) {
        if (saldo > 0) gesamtPufferStunden += saldo;
        // Kritisch = Puffer unter 10 h ODER bereits im Minus, sofern noch laufend.
        // Vorher war saldo >= 0 Bedingung — das ließ negative Salden (bereits überzogen)
        // fälschlicherweise als unkritisch durch.
        if (saldo < 10 && !abgeschlossen) kritischeProjekte++;
      }

      ergebnisProjekte.push({
        projektId:           proj.id,
        projektnummer:       proj.projektnummer,
        projektname:         proj.projektname,
        sollStunden,
        istStunden,
        saldo,
        auslastungProz:      auslastung,
        nochNichtBegonnen,
        abgeschlossen,
        bonusAusgeschlossen: proj.bonusAusgeschlossen,
        mitarbeiter:         maPuffer.sort((a, b) => b.anteilProz - a.anteilProz),
      });
    }

    return {
      kalenderjahr,
      jahresfortschritt: runde2(fortschritt * 100),
      gesamtPufferStunden: runde2(gesamtPufferStunden),
      kritischeProjekte,
      projekte: ergebnisProjekte.sort((a, b) => a.saldo - b.saldo), // kritischste zuerst
    };
  },
};
