/**
 * krankenfaktor.ts — Krankheits-Staffel + § 4a EFZG-Schutz
 *
 * Pure, side-effect-freie Funktionen zur Berechnung des Krankheits-
 * Kürzungsfaktors. Werden vom Bonus-Service konsumiert und sind durch
 * krankenfaktor.test.ts abgedeckt.
 *
 * Logik:
 *   Karenzphase   bis einschl. `karenz` Krankheitstage  → Faktor 1.0
 *   Staffelung    ab Tag karenz+1 → −abzugProTag pro Tag
 *   Maxgrenze     darüber wird `>= maxGrenze` durch die Disqualifikation
 *                 im Service abgefangen; hier liefert die Funktion bei
 *                 Erreichen/Überschreiten nur Faktor 0.
 *
 * EFZG-Schutz (§ 4a EFZG):
 *   Pro Krankheitstag darf max. 1/4 eines Tagesverdienstes gekürzt werden
 *   (gesetzlich, nicht verhandelbar). Die App bevorzugt für den Mitarbeiter
 *   den günstigeren Wert: prozentuale Kürzung ODER EFZG-Cap.
 */

export interface KrankenFaktorInput {
  kranktage:          number;
  karenz:             number;
  abzugProTagProzent: number;
  maxGrenze:          number;
}

/**
 * Liefert den Kürzungsfaktor (0..1) für eine gegebene Anzahl Krankheitstage.
 * Disqualifikation (= Faktor 0) bei kranktage >= maxGrenze.
 *
 *   0 Tage   → 1.00
 *  15 Tage   → 1.00 (Karenzgrenze; default)
 *  16 Tage   → 0.96 (−4 %; default)
 *  40 Tage   → 0.00 (Maxgrenze; default)
 */
export function berechneKrankenFaktor(input: KrankenFaktorInput): number {
  const { kranktage, karenz, abzugProTagProzent, maxGrenze } = input;

  if (!Number.isFinite(kranktage) || kranktage < 0) return 1;
  if (kranktage <= karenz) return 1;
  if (kranktage >= maxGrenze) return 0;

  const tageUeberKarenz = kranktage - karenz;
  const abzug = (tageUeberKarenz * abzugProTagProzent) / 100;
  return Math.max(0, 1 - abzug);
}

export interface KrankenKuerzungInput {
  gesamtBrutto:             number;
  kranktage:                number;
  karenz:                   number;
  abzugProTagProzent:       number;
  maxGrenze:                number;
  efzgAktiv:                boolean;
  efzgTagesfaktor:          number;
  stundenlohnBrutto:        number | null;
  tagesstundenDurchschnitt: number | null;
}

export interface KrankenKuerzungErgebnis {
  faktor:           number;         // prozentualer Kürzungsfaktor (0..1)
  gesamtNachKuerzung: number;       // Bonus nach Kürzung (€)
  kuerzungEur:      number;         // gesamtBrutto − gesamtNachKuerzung
  efzgAngewendet:   boolean;        // ob EFZG den Wert nach oben gezogen hat
  efzgMaxKuerzung:  number | null;  // max. zulässige Kürzung in € (oder null)
}

/**
 * Kombiniert die prozentuale Staffelung mit dem § 4a EFZG-Cap.
 * EFZG wirkt als untere Schranke für den Bonus — die App nimmt für den MA
 * den GÜNSTIGEREN von beiden Werten.
 *
 * EFZG-Cap kann nur greifen, wenn Stundenlohn und Tagesstunden gesetzt sind.
 * Ohne diese Werte fällt die App auf die reine prozentuale Kürzung zurück.
 */
export function wendeKrankenKuerzungAn(input: KrankenKuerzungInput): KrankenKuerzungErgebnis {
  const faktor = berechneKrankenFaktor({
    kranktage:          input.kranktage,
    karenz:             input.karenz,
    abzugProTagProzent: input.abzugProTagProzent,
    maxGrenze:          input.maxGrenze,
  });

  const nachProzent = input.gesamtBrutto * faktor;

  const kannEfzg =
    input.efzgAktiv &&
    input.stundenlohnBrutto !== null &&
    input.tagesstundenDurchschnitt !== null &&
    input.stundenlohnBrutto > 0 &&
    input.tagesstundenDurchschnitt > 0;

  if (!kannEfzg) {
    return {
      faktor,
      gesamtNachKuerzung: nachProzent,
      kuerzungEur:        input.gesamtBrutto - nachProzent,
      efzgAngewendet:     false,
      efzgMaxKuerzung:    null,
    };
  }

  const tageslohn   = input.stundenlohnBrutto! * input.tagesstundenDurchschnitt!;
  const maxKuerzung = input.kranktage * tageslohn * input.efzgTagesfaktor;
  const minBonus    = Math.max(0, input.gesamtBrutto - maxKuerzung);

  // Mitarbeiter bekommt den günstigeren Wert
  const gesamtNach = Math.max(nachProzent, minBonus);

  return {
    faktor,
    gesamtNachKuerzung: gesamtNach,
    kuerzungEur:        input.gesamtBrutto - gesamtNach,
    efzgAngewendet:     gesamtNach > nachProzent,
    efzgMaxKuerzung:    maxKuerzung,
  };
}
