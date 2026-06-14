import { describe, it, expect } from 'vitest';
import { stufenBetrag } from '../stufensatz';

const S1_BIS = 20, S1_SATZ = 30;
const S2_BIS = 40, S2_SATZ = 20;
const S3_SATZ = 15;

describe('stufenBetrag', () => {
  it('0 h → 0 €', () => {
    expect(stufenBetrag(0, S1_BIS, S1_SATZ, S2_BIS, S2_SATZ, S3_SATZ)).toBe(0);
  });

  it('Negative Stunden → 0 €', () => {
    expect(stufenBetrag(-10, S1_BIS, S1_SATZ, S2_BIS, S2_SATZ, S3_SATZ)).toBe(0);
  });

  it('20 h → 600 € (komplett Stufe 1)', () => {
    expect(stufenBetrag(20, S1_BIS, S1_SATZ, S2_BIS, S2_SATZ, S3_SATZ)).toBe(600);
  });

  it('30 h → 800 € (Stufe 1 + 10h Stufe 2)', () => {
    // 20×30 + 10×20 = 600 + 200 = 800
    expect(stufenBetrag(30, S1_BIS, S1_SATZ, S2_BIS, S2_SATZ, S3_SATZ)).toBe(800);
  });

  it('40 h → 1.000 € (komplett bis Ende Stufe 2)', () => {
    // 20×30 + 20×20 = 600 + 400 = 1.000
    expect(stufenBetrag(40, S1_BIS, S1_SATZ, S2_BIS, S2_SATZ, S3_SATZ)).toBe(1000);
  });

  it('50 h → 1.150 € (alle drei Stufen)', () => {
    // 20×30 + 20×20 + 10×15 = 600 + 400 + 150 = 1.150
    expect(stufenBetrag(50, S1_BIS, S1_SATZ, S2_BIS, S2_SATZ, S3_SATZ)).toBe(1150);
  });

  it('Ungültige Konfig (s2bis ≤ s1bis) → Fallback auf Stufe-1-Satz', () => {
    // 30 h × 30 = 900 (statt korrekter Stufenrechnung)
    expect(stufenBetrag(30, 40, 30, 20, 20, 15)).toBe(900);
  });
});
