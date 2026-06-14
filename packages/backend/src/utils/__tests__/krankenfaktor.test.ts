import { describe, it, expect } from 'vitest';
import { berechneKrankenFaktor, wendeKrankenKuerzungAn } from '../krankenfaktor';

const DEFAULT_KARENZ = 15;
const DEFAULT_ABZUG  = 4;
const DEFAULT_MAX    = 40;

describe('berechneKrankenFaktor', () => {
  it('0 Krankheitstage → Faktor 1.00', () => {
    expect(berechneKrankenFaktor({
      kranktage: 0, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
    })).toBe(1.0);
  });

  it('15 Krankheitstage → Faktor 1.00 (Karenzgrenze)', () => {
    expect(berechneKrankenFaktor({
      kranktage: 15, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
    })).toBe(1.0);
  });

  it('16 Krankheitstage → Faktor 0.96 (−4 %)', () => {
    expect(berechneKrankenFaktor({
      kranktage: 16, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
    })).toBeCloseTo(0.96);
  });

  it('20 Krankheitstage → Faktor 0.80', () => {
    expect(berechneKrankenFaktor({
      kranktage: 20, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
    })).toBeCloseTo(0.80);
  });

  it('25 Krankheitstage → Faktor 0.60', () => {
    expect(berechneKrankenFaktor({
      kranktage: 25, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
    })).toBeCloseTo(0.60);
  });

  it('40 Krankheitstage → Faktor 0.00 (Maxgrenze)', () => {
    expect(berechneKrankenFaktor({
      kranktage: 40, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
    })).toBe(0.0);
  });

  it('41 Krankheitstage → Faktor 0.00 (überschreitet Maxgrenze)', () => {
    expect(berechneKrankenFaktor({
      kranktage: 41, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
    })).toBe(0.0);
  });

  it('Negative Kranktage werden als 0 behandelt', () => {
    expect(berechneKrankenFaktor({
      kranktage: -3, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
    })).toBe(1.0);
  });

  it('18 Krankheitstage → 88 % Bonus (Regression: alte Logik schnitt auf 0)', () => {
    expect(berechneKrankenFaktor({
      kranktage: 18, karenz: DEFAULT_KARENZ, abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
    })).toBeCloseTo(0.88);
  });
});

describe('EFZG-Cap (§ 4a EFZG)', () => {
  it('3.000 € Bonus, 25 €/h, 30 Tage → EFZG zieht auf 1.500 €', () => {
    const r = wendeKrankenKuerzungAn({
      gesamtBrutto: 3000, kranktage: 30, karenz: DEFAULT_KARENZ,
      abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
      efzgAktiv: true, efzgTagesfaktor: 0.25,
      stundenlohnBrutto: 25, tagesstundenDurchschnitt: 8,
    });
    expect(r.gesamtNachKuerzung).toBeCloseTo(1500);
    expect(r.efzgMaxKuerzung).toBeCloseTo(1500);
    expect(r.efzgAngewendet).toBe(true);
  });

  it('1.000 € Bonus, 25 €/h, 30 Tage → prozentuale Kürzung günstiger', () => {
    const r = wendeKrankenKuerzungAn({
      gesamtBrutto: 1000, kranktage: 30, karenz: DEFAULT_KARENZ,
      abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
      efzgAktiv: true, efzgTagesfaktor: 0.25,
      stundenlohnBrutto: 25, tagesstundenDurchschnitt: 8,
    });
    expect(r.gesamtNachKuerzung).toBeCloseTo(400);
    expect(r.efzgAngewendet).toBe(false);
  });

  it('Ohne Stundenlohn → reine prozentuale Kürzung', () => {
    const r = wendeKrankenKuerzungAn({
      gesamtBrutto: 3000, kranktage: 30, karenz: DEFAULT_KARENZ,
      abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
      efzgAktiv: true, efzgTagesfaktor: 0.25,
      stundenlohnBrutto: null, tagesstundenDurchschnitt: 8,
    });
    expect(r.gesamtNachKuerzung).toBeCloseTo(1200);
    expect(r.efzgMaxKuerzung).toBeNull();
  });

  it('EFZG-Schutz deaktiviert → reine prozentuale Kürzung', () => {
    const r = wendeKrankenKuerzungAn({
      gesamtBrutto: 3000, kranktage: 30, karenz: DEFAULT_KARENZ,
      abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
      efzgAktiv: false, efzgTagesfaktor: 0.25,
      stundenlohnBrutto: 25, tagesstundenDurchschnitt: 8,
    });
    expect(r.gesamtNachKuerzung).toBeCloseTo(1200);
  });

  it('0 Krankheitstage → keine Kürzung, kein EFZG-Eingriff', () => {
    const r = wendeKrankenKuerzungAn({
      gesamtBrutto: 3000, kranktage: 0, karenz: DEFAULT_KARENZ,
      abzugProTagProzent: DEFAULT_ABZUG, maxGrenze: DEFAULT_MAX,
      efzgAktiv: true, efzgTagesfaktor: 0.25,
      stundenlohnBrutto: 25, tagesstundenDurchschnitt: 8,
    });
    expect(r.gesamtNachKuerzung).toBe(3000);
    expect(r.kuerzungEur).toBe(0);
  });
});
