/**
 * Standalone-Tests für berechneKrankenFaktor + wendeKrankenKuerzungAn.
 *
 * Bewusst ohne Test-Framework (vitest/jest sind nicht installiert), damit
 * die Tests direkt mit ts-node laufen:
 *
 *   cd packages/backend && npx ts-node src/utils/__tests__/krankenfaktor.test.ts
 *
 * Exit-Code != 0 bei mindestens einem fehlgeschlagenen Test.
 */

import { berechneKrankenFaktor, wendeKrankenKuerzungAn } from '../krankenfaktor';

let bestanden = 0;
let fehlgeschlagen = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    bestanden++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
    fehlgeschlagen++;
  }
}

function near(actual: number, expected: number, eps = 1e-9) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`Erwartet ${expected}, erhalten ${actual}`);
  }
}

const DEFAULT_KARENZ = 15;
const DEFAULT_ABZUG  = 4;
const DEFAULT_MAX    = 40;

console.log('\nbeschreibe(berechneKrankenFaktor)');

test('0 Krankheitstage → Faktor 1.00', () => {
  near(berechneKrankenFaktor({
    kranktage: 0, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
  }), 1.0);
});

test('15 Krankheitstage → Faktor 1.00 (Karenzgrenze)', () => {
  near(berechneKrankenFaktor({
    kranktage: 15, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
  }), 1.0);
});

test('16 Krankheitstage → Faktor 0.96 (−4 %)', () => {
  near(berechneKrankenFaktor({
    kranktage: 16, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
  }), 0.96);
});

test('20 Krankheitstage → Faktor 0.80', () => {
  near(berechneKrankenFaktor({
    kranktage: 20, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
  }), 0.80);
});

test('25 Krankheitstage → Faktor 0.60', () => {
  near(berechneKrankenFaktor({
    kranktage: 25, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
  }), 0.60);
});

test('40 Krankheitstage → Faktor 0.00 (Maxgrenze)', () => {
  near(berechneKrankenFaktor({
    kranktage: 40, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
  }), 0.0);
});

test('41 Krankheitstage → Faktor 0.00 (überschreitet Maxgrenze)', () => {
  near(berechneKrankenFaktor({
    kranktage: 41, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
  }), 0.0);
});

test('Negative Kranktage werden als 0 behandelt', () => {
  near(berechneKrankenFaktor({
    kranktage: -3, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
  }), 1.0);
});

console.log('\nbeschreibe(EFZG-Cap)');

test('3.000 € Bonus, 25 €/h, 30 Tage → EFZG zieht auf 1.500 €', () => {
  const ergebnis = wendeKrankenKuerzungAn({
    gesamtBrutto:             3000,
    kranktage:                30,
    karenz:                   DEFAULT_KARENZ,
    abzugProTagProzent:       DEFAULT_ABZUG,
    maxGrenze:                DEFAULT_MAX,
    efzgAktiv:                true,
    efzgTagesfaktor:          0.25,
    stundenlohnBrutto:        25,
    tagesstundenDurchschnitt: 8,
  });
  // prozentual: 3000 × 0.40 = 1200 €
  // EFZG-Cap:   30 × 200 × 0.25 = 1500 € max. Kürzung → 1500 € Bonus
  // Ergebnis: max(1200, 1500) = 1500
  near(ergebnis.gesamtNachKuerzung, 1500);
  near(ergebnis.efzgMaxKuerzung ?? 0, 1500);
  if (!ergebnis.efzgAngewendet) throw new Error('EFZG hätte greifen müssen');
});

test('1.000 € Bonus, 25 €/h, 30 Tage → prozentuale Kürzung günstiger', () => {
  const ergebnis = wendeKrankenKuerzungAn({
    gesamtBrutto:             1000,
    kranktage:                30,
    karenz:                   DEFAULT_KARENZ,
    abzugProTagProzent:       DEFAULT_ABZUG,
    maxGrenze:                DEFAULT_MAX,
    efzgAktiv:                true,
    efzgTagesfaktor:          0.25,
    stundenlohnBrutto:        25,
    tagesstundenDurchschnitt: 8,
  });
  // prozentual: 1000 × 0.40 = 400 €
  // EFZG-Cap:   1500 € max. Kürzung → min Bonus = max(0, 1000 − 1500) = 0 €
  // Ergebnis: max(400, 0) = 400 (prozentual ist hier günstiger)
  near(ergebnis.gesamtNachKuerzung, 400);
  if (ergebnis.efzgAngewendet) throw new Error('EFZG hätte hier nicht zusätzlich anheben dürfen');
});

test('Ohne Stundenlohn → reine prozentuale Kürzung', () => {
  const ergebnis = wendeKrankenKuerzungAn({
    gesamtBrutto:             3000,
    kranktage:                30,
    karenz:                   DEFAULT_KARENZ,
    abzugProTagProzent:       DEFAULT_ABZUG,
    maxGrenze:                DEFAULT_MAX,
    efzgAktiv:                true,
    efzgTagesfaktor:          0.25,
    stundenlohnBrutto:        null,
    tagesstundenDurchschnitt: 8,
  });
  near(ergebnis.gesamtNachKuerzung, 1200);
  if (ergebnis.efzgMaxKuerzung !== null) throw new Error('EFZG sollte nicht berechnet werden');
});

test('EFZG-Schutz deaktiviert → reine prozentuale Kürzung', () => {
  const ergebnis = wendeKrankenKuerzungAn({
    gesamtBrutto:             3000,
    kranktage:                30,
    karenz:                   DEFAULT_KARENZ,
    abzugProTagProzent:       DEFAULT_ABZUG,
    maxGrenze:                DEFAULT_MAX,
    efzgAktiv:                false,
    efzgTagesfaktor:          0.25,
    stundenlohnBrutto:        25,
    tagesstundenDurchschnitt: 8,
  });
  near(ergebnis.gesamtNachKuerzung, 1200);
});

test('0 Krankheitstage → keine Kürzung, kein EFZG-Eingriff', () => {
  const ergebnis = wendeKrankenKuerzungAn({
    gesamtBrutto:             3000,
    kranktage:                0,
    karenz:                   DEFAULT_KARENZ,
    abzugProTagProzent:       DEFAULT_ABZUG,
    maxGrenze:                DEFAULT_MAX,
    efzgAktiv:                true,
    efzgTagesfaktor:          0.25,
    stundenlohnBrutto:        25,
    tagesstundenDurchschnitt: 8,
  });
  near(ergebnis.gesamtNachKuerzung, 3000);
  near(ergebnis.kuerzungEur, 0);
});

test('18 Krankheitstage → 88 % Bonus (Regression: alte Logik schnitt auf 0)', () => {
  const f = berechneKrankenFaktor({
    kranktage: 18, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
  });
  near(f, 0.88);
});

console.log('');
console.log(`Ergebnis: ${bestanden} bestanden, ${fehlgeschlagen} fehlgeschlagen`);
if (fehlgeschlagen > 0) process.exit(1);
